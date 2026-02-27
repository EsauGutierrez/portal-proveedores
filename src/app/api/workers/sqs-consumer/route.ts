// app/api/workers/sqs-consumer/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { invokeRestlet } from '../../../lib/netsuite';
import { getPresignedUrl } from '../../../lib/s3';

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

            const { invoiceId, userId, receptionId } = messageBody;

            if (!invoiceId) {
                console.warn('Mensaje SQS ignorado, no contiene invoiceId', messageBody);
                continue; // Skip silently to remove bad message from queue
            }

            console.log(`[Worker] Procesando factura asíncrona: ${invoiceId}`);

            // 3. Obtener toda la información de la Base de Datos
            const invoice = await prisma.invoice.findUnique({
                where: { id: invoiceId },
                include: {
                    user: {
                        include: {
                            supplierProfile: {
                                include: { subsidiary: true }
                            }
                        }
                    },
                    reception: {
                        include: { articles: true }
                    }
                }
            });

            if (!invoice || !invoice.user?.supplierProfile || !invoice.reception) {
                console.error(`[Worker] Datos incompletos para la factura ${invoiceId}. Marcaremos como fallida.`);
                await updateSyncStatus(invoiceId, 'FAILED', 'Datos de usuario o recepción incompletos en base de datos.');
                continue;
            }

            const supplier = invoice.user.supplierProfile;
            const subsidiary = supplier.subsidiary;

            // 4. Validar las Matemáticas y Totales Cruzados
            const receptionSubtotal = invoice.reception.articles.reduce((sum, article) => sum + parseFloat(article.subtotal as any), 0);
            const receptionTotal = invoice.reception.articles.reduce((sum, article) => sum + parseFloat(article.total as any), 0);

            const errors: string[] = [];

            // Note: We already validated RFCs on the frontend, but as a Worker it's a good practice to double check
            // However, to keep it fast, we rely on the math of the database records vs the XML variables we saved

            if (Math.abs(Number(invoice.subtotal) - receptionSubtotal) > 0.5) {
                errors.push(`El subtotal de la factura ($${invoice.subtotal}) difiere de la recepción ($${receptionSubtotal.toFixed(2)}).`);
            }
            if (Math.abs(Number(invoice.total) - receptionTotal) > 0.5) {
                errors.push(`El total de la factura ($${invoice.total}) difiere de la recepción ($${receptionTotal.toFixed(2)}).`);
            }

            // 5. Rechazar si las matemáticas no cuadran
            if (errors.length > 0) {
                console.error(`[Worker] Validación fallida para ${invoiceId}:`, errors);
                await updateSyncStatus(invoiceId, 'FAILED', `Validación fallida: ${errors.join(' | ')}`);
                // Continuamos procesando los siguientes si hay más de 1 en el lote SQS, no tiramos todo el POST
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
                // TODO: CAMBIAR ESTOS IDs POR LOS REALES EN NETSUITE
                const SCRIPT_ID = 'customscript_imr_portal_facturas_rl';
                const DEPLOY_ID = 'customdeploy_imr_portal_facturas_rl_1';

                const netsuitePayload = {
                    proveedorId: supplier.rfc, // O usar el internal ID de NetSuite si lo tienes mapeado
                    recepcionFolio: invoice.reception.folio, // Usamos el num. de documento como referencia
                    uuidFactura: invoice.folio,
                    totalFactura: invoice.total,
                    facturaPDFUrl: pdfPresignedUrl,
                    facturaXMLUrl: xmlPresignedUrl
                };

                console.log(`[Worker] Enviando datos a NetSuite RESTlet:`, netsuitePayload);

                const netsuiteResponse = await invokeRestlet(SCRIPT_ID, DEPLOY_ID, 'POST', netsuitePayload);

                if (netsuiteResponse && netsuiteResponse.success) {
                    console.log(`[Worker] Factura ${invoiceId} sincronizada con NetSuite! Internal ID: ${netsuiteResponse.vendorBillId}`);
                    // 8. ÉXITO: Actualizar el estado a SYNCED
                    await updateSyncStatus(invoiceId, 'SYNCED', null);
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
async function updateSyncStatus(invoiceId: string, status: 'SYNCED' | 'FAILED' | 'PENDING_SYNC', errorMsg: string | null) {
    try {
        await prisma.invoice.update({
            where: { id: invoiceId },
            data: {
                syncStatus: status,
                syncError: errorMsg ? errorMsg.substring(0, 255) : null // Truncar para evitar errores de BD si el msj de NetSuite es inmenso
            }
        });
    } catch (e) {
        console.error(`[Worker Database Error] Falló al intentar guardar el estado de error/éxito para factura ${invoiceId}`, e);
    }
}
