// app/api/workers/sqs-consumer/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { invokeRestlet } from '../../../lib/netsuite';
import { getPresignedUrl } from '../../../lib/s3';
import { processBulkPaymentComplements } from '../../../lib/processBulkPaymentComplements';

const prisma = new PrismaClient();

// This endpoint matches the SQS Event Payload signature
export async function POST(request: Request) {
    try {
        // 1. Basic Security: Only allow internal invocations based on a Secret Header or SQS Signature
        const signature = request.headers.get('x-amz-sqs-signature') || request.headers.get('x-worker-key');
        if (!process.env.WORKER_SECRET_KEY || signature !== process.env.WORKER_SECRET_KEY) {
            return NextResponse.json({ message: 'Unauthorized Worker Execution' }, { status: 401 });
        }

        // 2. Extract the payload from SQS Event Bridge pipe
        const eventRecords = await request.json();

        // SQS typically sends messages in an array inside the `Records` property
        const records = eventRecords.Records || [eventRecords];

        for (const record of records) {
            // SQS body is a JSON string containing our specific payload
            let messageBody;
            try {
                messageBody = typeof record.body === 'string' ? JSON.parse(record.body) : record.body;
            } catch (e) {
                // If the body is not JSON, it might just be the direct payload depending on the pipe configuration
                messageBody = record;
            }

            const { invoiceId, bulkLogId, s3ZipKey, userId: msgUserId, tenantId: msgTenantId } = messageBody;

            // Enrutar mensajes de carga masiva de complementos
            if (bulkLogId) {
                console.log(`[Worker] Procesando carga masiva de complementos: ${bulkLogId}`);
                await processBulkPaymentComplements(bulkLogId, s3ZipKey, msgUserId, msgTenantId);
                continue;
            }

            if (!invoiceId) {
                console.warn('Mensaje SQS ignorado, no contiene invoiceId ni bulkLogId', messageBody);
                continue; // Skip silently to remove bad message from queue
            }

            console.log(`[Worker] Procesando factura asíncrona: ${invoiceId}`);

            // 3. Obtener toda la información de la Base de Datos
            const invoice = await prisma.invoice.findUnique({
                where: { id: invoiceId },
                include: {
                    tenant: true,
                    user: {
                        include: {
                            supplierProfile: {
                                include: { subsidiary: true }
                            }
                        }
                    },
                    receptions: {
                        include: { articles: true },
                    },
                    purchaseOrder: {
                        select: { folio: true, subtotal: true, total: true, netsuiteId: true, isConsignment: true }
                    } as any
                }
            });

            if (!invoice || !invoice.user?.supplierProfile) {
                console.error(`[Worker] Datos incompletos para la factura ${invoiceId}. Marcaremos como fallida.`);
                await updateSyncStatus(invoiceId, 'FAILED', 'Datos de usuario o perfil de proveedor incompletos.');
                continue;
            }

            const supplier = invoice.user.supplierProfile;
            const primaryReception = invoice.receptions?.[0];
            // Factura puede estar ligada a recepciones o directamente a una OC
            const isConsignment = !!(invoice.purchaseOrder as any)?.isConsignment;
            const isPoLevelInvoice = !primaryReception && !!invoice.purchaseOrder;
            const referenceFolio = primaryReception?.folio ?? invoice.purchaseOrder?.folio ?? 'N/A';

            // 4. Validar Totales Cruzados (omitido para consignación — saldo validado al subir)
            const errors: string[] = [];
            if (!isConsignment) {
                if (primaryReception) {
                    const receptionSubtotal = primaryReception.articles.reduce((sum, article) => sum + parseFloat(article.subtotal as any), 0);
                    const receptionTotal = primaryReception.articles.reduce((sum, article) => sum + parseFloat(article.total as any), 0);

                    if (Math.abs(Number(invoice.subtotal) - receptionSubtotal) > 0.5) {
                        errors.push(`El subtotal de la factura ($${invoice.subtotal}) difiere de la recepción ($${receptionSubtotal.toFixed(2)}).`);
                    }
                    if (Math.abs(Number(invoice.total) - receptionTotal) > 0.5) {
                        errors.push(`El total de la factura ($${invoice.total}) difiere de la recepción ($${receptionTotal.toFixed(2)}).`);
                    }
                } else if (isPoLevelInvoice) {
                    // Para facturas integrales de OC validamos contra el total de la OC
                    const poTotal = Number(invoice.purchaseOrder!.total);
                    if (poTotal > 0 && Math.abs(Number(invoice.total) - poTotal) > 0.5) {
                        errors.push(`El total de la factura ($${invoice.total}) difiere del total de la OC ($${poTotal.toFixed(2)}).`);
                    }
                } else {
                    await updateSyncStatus(invoiceId, 'FAILED', 'La factura no tiene recepción ni orden de compra asociada.');
                    continue;
                }
            }

            // 5. Rechazar si las matemáticas no cuadran
            if (errors.length > 0) {
                console.error(`[Worker] Validación fallida para ${invoiceId}:`, errors);
                await updateSyncStatus(invoiceId, 'FAILED', `Validación fallida: ${errors.join(' | ')}`);
                continue;
            }

            // 6. Preparar los URLs de S3 para enviárselos a NetSuite
            let pdfPresignedUrl = '';
            let xmlPresignedUrl = '';
            try {
                // Generamos URLs que duran 24 horas para que el script de NetSuite tenga tiempo de descargarlos
                pdfPresignedUrl = await getPresignedUrl(invoice.pdfUrl!);
                xmlPresignedUrl = await getPresignedUrl(invoice.xmlUrl!);
            } catch (e) {
                console.error("[Worker] Error generando presigned URLs", e);
                // Si falla, los pasamos vacíos o como log de error, NetSuite decidirá si son obligatorios
            }

            // 7. Sincronización a NETSUITE mediante RESTlet
            try {
                const SCRIPT_ID = invoice.tenant.netsuiteScriptId || process.env.NETSUITE_SCRIPT_ID || '3878';
                const DEPLOY_ID = invoice.tenant.netsuiteDeployId || process.env.NETSUITE_DEPLOY_ID || '1';

                // fromId: si es factura por OC completa → ID interno de la OC en NetSuite
                //         si es factura por recepción → ID interno de la recepción en NetSuite
                const fromIdRaw = isPoLevelInvoice
                    ? invoice.purchaseOrder!.netsuiteId
                    : primaryReception?.netsuiteId ?? null;
                const fromId = fromIdRaw ? parseInt(fromIdRaw, 10) : null;
                const fromType = isPoLevelInvoice ? 'purchaseorder' : 'itemreceipt';

                const netsuitePayload = {
                    fromId,
                    fromType,
                    proveedorId: supplier.rfc,
                    recepcionFolio: referenceFolio,
                    uuidFactura: invoice.folio,
                    totalFactura: invoice.total,
                    facturaPDFUrl: pdfPresignedUrl,
                    facturaXMLUrl: xmlPresignedUrl
                };

                const nsCreds = {
                    accountId: invoice.tenant.netsuiteAccountId!,
                    consumerKey: invoice.tenant.netsuiteConsumerKey!,
                    consumerSecret: invoice.tenant.netsuiteConsumerSec!,
                    tokenId: invoice.tenant.netsuiteTokenId!,
                    tokenSecret: invoice.tenant.netsuiteTokenSecret!,
                };

                console.log(`[Worker] Enviando datos a NetSuite RESTlet:`, netsuitePayload);

                const netsuiteResponse = await invokeRestlet(SCRIPT_ID, DEPLOY_ID, nsCreds, 'POST', netsuitePayload);

                if (netsuiteResponse && netsuiteResponse.success) {
                    console.log(`[Worker] Factura ${invoiceId} sincronizada con NetSuite! Internal ID: ${netsuiteResponse.vendorBillId}`);
                    // 8. ÉXITO: Actualizar el estado a SYNCED y guardar el ID interno del VendorBill
                    await updateSyncStatus(invoiceId, 'SYNCED', null, String(netsuiteResponse.vendorBillId));
                } else {
                    console.error(`[Worker] NetSuite rechazó la transacción:`, netsuiteResponse);
                    await updateSyncStatus(invoiceId, 'FAILED', `Error ERP: ${netsuiteResponse.error || JSON.stringify(netsuiteResponse)}`);
                }

            } catch (nsError: any) {
                console.error(`[Worker] Excepción irrecuperable al llamar a NetSuite para factura ${invoiceId}:`, nsError);
                await updateSyncStatus(invoiceId, 'FAILED', `Excepción de red/ERP: ${nsError.message}`);
                // Re-tiramos el error SOLO si queremos que SQS reintente el mensaje completo más tarde
                // throw nsError; 
            }
        } // End For Each Record

        // 9. Informar a SQS/EventBridge que procesamos la carga correctamente para que borre de la cola
        return NextResponse.json({ success: true, message: `Processed ${records.length} records.` }, { status: 200 });

    } catch (error) {
        console.error('[Worker Fatal Error]:', error);
        // Devolvemos 500 para dejarle saber a SQS que falló y debe Rencolar (DLQ) la petición
        return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
    }
}

// Helper para no escribir tanto prisma repetido, actualiza tanto éxito como error
async function updateSyncStatus(invoiceId: string, status: 'SYNCED' | 'FAILED' | 'PENDING_SYNC', errorMsg: string | null, netsuiteId?: string) {
    try {
        await prisma.invoice.update({
            where: { id: invoiceId },
            data: {
                syncStatus: status,
                syncError: errorMsg ? errorMsg.substring(0, 255) : null,
                ...(netsuiteId ? { netsuiteId } : {}), // Guardar ID interno del VendorBill en NS
            }
        });
    } catch (e) {
        console.error(`[Worker Database Error] Falló al intentar guardar el estado de error/éxito para factura ${invoiceId}`, e);
    }
}
