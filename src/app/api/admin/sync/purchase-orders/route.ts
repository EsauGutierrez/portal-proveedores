// app/api/admin/sync/purchase-orders/route.ts
// Endpoint para SINCRONIZACIÓN MANUAL de OC desde el panel admin del tenant.
// Solo sincroniza OC de proveedores que ya están registrados (ACTIVE) en el portal.

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { querySuiteQL } from '../../../../lib/netsuite';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

/**
 * NetSuite SuiteQL devuelve trandate en formato M/D/YYYY (ej. "3/18/2025").
 * new Date() no lo parsea correctamente en todos los entornos.
 * Esta función lo convierte de forma segura.
 */
function parseNetSuiteDate(raw: string | null | undefined): Date {
    if (!raw) return new Date();

    // Intentar parseo directo primero (funciona con ISO 8601: YYYY-MM-DD)
    const direct = new Date(raw);
    if (!isNaN(direct.getTime())) return direct;

    // Formato M/D/YYYY o MM/DD/YYYY de NetSuite
    const parts = raw.split('/');
    if (parts.length === 3) {
        const [month, day, year] = parts;
        const parsed = new Date(Number(year), Number(month) - 1, Number(day));
        if (!isNaN(parsed.getTime())) return parsed;
    }

    // Formato DD-MM-YYYY
    const partsAlt = raw.split('-');
    if (partsAlt.length === 3 && partsAlt[0].length === 2) {
        const [day, month, year] = partsAlt;
        const parsed = new Date(Number(year), Number(month) - 1, Number(day));
        if (!isNaN(parsed.getTime())) return parsed;
    }

    // Fallback: fecha actual para no romper el upsert
    console.warn(`[SYNC] Fecha no reconocida: "${raw}", usando fecha actual.`);
    return new Date();
}

export async function POST(request: Request) {
    const startTime = Date.now();

    try {
        // 1. Autenticación — Solo TENANT_ADMIN puede disparar la sync manual
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
        }
        const token = authHeader.split(' ')[1];

        let decodedToken: any;
        try {
            decodedToken = jwt.verify(token, process.env.JWT_SECRET!);
        } catch {
            return NextResponse.json({ message: 'Token inválido o expirado' }, { status: 401 });
        }

        if (decodedToken.role !== 'TENANT_ADMIN' && decodedToken.role !== 'ADMIN') {
            return NextResponse.json({ message: 'No tienes permisos para ejecutar esta acción' }, { status: 403 });
        }

        const tenantId: string = decodedToken.tenantId;
        const triggeredBy: string = decodedToken.email || 'admin';

        if (!tenantId) {
            return NextResponse.json({ message: 'No se encontró el Tenant ID en el token' }, { status: 400 });
        }

        // 2. Obtener credenciales del tenant
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            include: { subsidiaries: true }
        });

        if (!tenant) {
            return NextResponse.json({ message: 'Empresa no encontrada' }, { status: 404 });
        }
        if (!tenant.netsuiteAccountId || !tenant.netsuiteConsumerKey || !tenant.netsuiteConsumerSec || !tenant.netsuiteTokenId || !tenant.netsuiteTokenSecret) {
            return NextResponse.json({ message: 'Credenciales de NetSuite incompletas. Configúralas desde el panel de administración.' }, { status: 400 });
        }

        const creds = {
            accountId: tenant.netsuiteAccountId,
            consumerKey: tenant.netsuiteConsumerKey,
            consumerSecret: tenant.netsuiteConsumerSec,
            tokenId: tenant.netsuiteTokenId,
            tokenSecret: tenant.netsuiteTokenSecret
        };

        // 3. Obtener SOLO los proveedores activos registrados en el portal (RFC válido)
        const activeSuppliers = await prisma.supplierProfile.findMany({
            where: { tenantId, status: 'ACTIVE' },
            select: { rfc: true, companyName: true }
        });

        if (activeSuppliers.length === 0) {
            const durationMs = Date.now() - startTime;
            await prisma.syncLog.create({
                data: {
                    type: 'MANUAL', status: 'PARTIAL', totalFound: 0,
                    skippedCount: 0, createdCount: 0, updatedCount: 0,
                    durationMs, triggeredBy, tenantId,
                    errorMessage: 'No hay proveedores activos registrados para sincronizar.'
                }
            });
            return NextResponse.json({
                message: 'No hay proveedores activos registrados en el portal para sincronizar.',
                createdCount: 0, updatedCount: 0, skippedCount: 0, totalFound: 0
            }, { status: 200 });
        }

        // Filtro por RFC de proveedores registrados.
        // Nota: BUILTIN.DF() no se puede usar en WHERE con JOIN explícito en SuiteQL.
        // El filtro por RFC del proveedor es suficiente para limitar los resultados.
        const rfcList = activeSuppliers.map(s => s.rfc.replace(/'/g, "''"));
        const rfcClause = rfcList.map(r => `'${r}'`).join(', ');

        console.log(`[SYNC MANUAL] Buscando OC para ${activeSuppliers.length} proveedores activos del tenant ${tenantId}...`);

        const suiteqlQuery = `
      SELECT
        t.id                 AS po_netsuite_id,
        t.tranid             AS folio,
        t.trandate           AS fecha,
        BUILTIN.DF(t.subsidiary) AS subsidiaria,
        BUILTIN.DF(t.entity) AS proveedor,
        t.foreigntotal       AS total,
        t.subtotal           AS subtotalns,
        t.taxtotal           AS taxtotal,
        t.entity             AS proveedor_netsuite_id,
        v.vatregnumber       AS rfc
      FROM
        transaction t
        JOIN Vendor v ON t.entity = v.id
      WHERE
        t.type = 'PurchOrd'
        AND v.vatregnumber IN (${rfcClause})
    `;

        const results = await querySuiteQL(suiteqlQuery, creds);
        console.log(`[SYNC MANUAL] Se encontraron ${results.length} órdenes de compra en NetSuite.`);

        if (results.length === 0) {
            const durationMs = Date.now() - startTime;
            await prisma.syncLog.create({
                data: {
                    type: 'MANUAL', status: 'SUCCESS', totalFound: 0,
                    skippedCount: 0, createdCount: 0, updatedCount: 0,
                    durationMs, triggeredBy, tenantId
                }
            });
            return NextResponse.json({
                message: 'Sincronización completada. No se encontraron órdenes de compra nuevas para los proveedores registrados.',
                createdCount: 0, updatedCount: 0, skippedCount: 0, totalFound: 0
            }, { status: 200 });
        }

        // 6. Upsert de las OC — procesamiento individual sin transacción global
        //    (evita timeout P2028 al procesar 100+ registros)
        let createdCount = 0;
        let updatedCount = 0;
        let skippedCount = 0;    // RFC no encontrado en portal
        let errorCount = 0;    // Errores inesperados al procesar la OC
        const errorDetails: { folio: string; rfc: string; motivo: string }[] = [];

        // Caché de subsidiarias para evitar queries repetidas
        const subsidiaryCache = new Map<string, string>(); // name → id
        const objPoFolioToId = new Map<string, string>();
        const objPoNetSuiteIdToPrismaId = new Map<string, string>();
        const poNetSuiteIds = new Set<string>();
        const vendorNetSuiteIds = new Set<string>();

        for (const po of results) {
            try {
                // po_netsuite_id debe ser po.po_netsuite_id en el script original de suiteQL si existe.
                if (po.po_netsuite_id) poNetSuiteIds.add(po.po_netsuite_id);
                // Buscar proveedor por RFC normalizado
                const rfcNormalizado = (po.rfc || '').toUpperCase().replace(/\s/g, '').replace(/-/g, '');
                const supplierProfile = await prisma.supplierProfile.findFirst({
                    where: { tenantId, rfc: rfcNormalizado },
                    select: { userId: true, id: true, netsuiteId: true }
                });

                if (!supplierProfile) {
                    skippedCount++;
                    continue;
                }

                // Poblar netsuiteId en proveedor de forma pasiva si no lo tiene
                if (!supplierProfile.netsuiteId && po.proveedor_netsuite_id) {
                    await prisma.supplierProfile.update({
                        where: { id: supplierProfile.id },
                        data: { netsuiteId: po.proveedor_netsuite_id }
                    });
                }

                // Llenar vendorNetSuiteIds para posterior filtro de Items
                const resolvedVendorId = supplierProfile.netsuiteId || po.proveedor_netsuite_id;
                if (resolvedVendorId) {
                    vendorNetSuiteIds.add(resolvedVendorId);
                }

                // Buscar/crear subsidiaria con caché en memoria
                const subName = po.subsidiaria || 'GENERIC_NAME';
                let subsidiaryId = subsidiaryCache.get(subName);
                if (!subsidiaryId) {
                    let subsidiary = await prisma.subsidiary.findFirst({
                        where: { tenantId, name: subName },
                        select: { id: true }
                    });
                    if (!subsidiary) {
                        subsidiary = await prisma.subsidiary.create({
                            data: {
                                name: subName,
                                rfc: 'GENERIC_RFC',
                                businessName: subName,
                                taxRegime: 'GENERIC_REGIME',
                                taxAddress: 'GENERIC_ADDRESS',
                                tenantId
                            }
                        });
                    }
                    subsidiaryId = subsidiary.id;
                    subsidiaryCache.set(subName, subsidiaryId);
                }

                const valTotal = Math.abs(parseFloat(po.total) || 0);
                const valTax = Math.abs(parseFloat(po.taxtotal) || 0);
                const valSubtotal = po.subtotalns != null && po.subtotalns !== ''
                  ? Math.abs(parseFloat(po.subtotalns) || 0)
                  : valTotal - valTax;

                const purchaseOrderData = {
                    folio: po.folio,
                    netsuiteId: po.po_netsuite_id,
                    fecha: parseNetSuiteDate(po.fecha),
                    subsidiaryId,
                    subtotal: valSubtotal,
                    total: valTotal,
                    tax: valTax,
                    userId: supplierProfile.userId,
                    tenantId,
                };

                const existing = await prisma.purchaseOrder.findUnique({
                    where: { tenantId_folio: { tenantId, folio: po.folio } },
                    select: { id: true }
                });

                const upsertedPo = await prisma.purchaseOrder.upsert({
                    where: { tenantId_folio: { tenantId, folio: po.folio } },
                    update: purchaseOrderData,
                    create: purchaseOrderData,
                    select: { id: true }
                });

                objPoFolioToId.set(po.folio, upsertedPo.id);
                if (po.po_netsuite_id) {
                    objPoNetSuiteIdToPrismaId.set(po.po_netsuite_id, upsertedPo.id);
                }

                if (!existing) { createdCount++; } else { updatedCount++; }

            } catch (poError: any) {
                errorCount++;
                const detail = {
                    folio: po.folio ?? '?',
                    rfc: po.rfc ?? '?',
                    motivo: poError?.message ?? 'Error desconocido'
                };
                errorDetails.push(detail);
                console.error(`[SYNC MANUAL] Error OC ${detail.folio} (${detail.rfc}): ${detail.motivo}`);
            }
        }

        // =========================================================================
        // 6.5. SINCRONIZACIÓN DE RECEPCIONES (ITEM RECEIPTS)
        // =========================================================================
        let rcptCreatedCount = 0;
        let rcptUpdatedCount = 0;
        let rcptErrorCount = 0;

        if (objPoFolioToId.size > 0 && activeSuppliers.length > 0 && poNetSuiteIds.size > 0) {
            console.log(`[SYNC MANUAL] Buscando Recepciones para ${activeSuppliers.length} proveedores activos...`);

            const pIds = Array.from(poNetSuiteIds).map(id => `'${id}'`).join(',');
            const vIds = Array.from(vendorNetSuiteIds).map(id => `'${id}'`).join(',');

            const suiteqlRcptQuery = `
              SELECT
                ir.tranid             AS ir_folio,
                ir.trandate           AS fecha,
                ir_head.createdfrom   AS po_netsuite_id,
                BUILTIN.DF(irl.item)  AS articulo,
                irl.quantity          AS cantidad,
                COALESCE(irl.rate, 0) AS precio_unitario,
                COALESCE(irl.netamount, 0) AS subtotal,
                COALESCE(irl.taxamount, 0) AS impuesto
              FROM
                transaction ir
                JOIN transactionline ir_head ON ir_head.transaction = ir.id AND ir_head.mainline = 'T'
                JOIN transactionline irl ON irl.transaction = ir.id AND irl.mainline = 'F'
              WHERE
                ir.type = 'ItemRcpt'
                AND ir.entity IN (${vIds})
                AND ir_head.createdfrom IN (${pIds})
                AND irl.item IS NOT NULL
            `;

            try {
                const rcptResults = await querySuiteQL(suiteqlRcptQuery, creds);
                const receiptsMap = new Map<string, any>();

                for (const row of rcptResults) {
                    // Si la OC no la acabamos de mapear, ignoramos su recepción
                    if (!objPoNetSuiteIdToPrismaId.has(row.po_netsuite_id)) continue;

                    if (!receiptsMap.has(row.ir_folio)) {
                        receiptsMap.set(row.ir_folio, {
                            folio: row.ir_folio,
                            fecha: parseNetSuiteDate(row.fecha),
                            purchaseOrderId: objPoNetSuiteIdToPrismaId.get(row.po_netsuite_id),
                            articles: []
                        });
                    }
                                        const cantidad = parseFloat(row.cantidad) || 0;
                            const unitPrice = parseFloat(row.precio_unitario) || 0;
                            const subtotal = Math.abs(parseFloat(row.subtotal)) || (cantidad * unitPrice);
                            const tax = Math.abs(parseFloat(row.impuesto)) || 0;
                            const total = subtotal + tax;

                            receiptsMap.get(row.ir_folio).articles.push({
                                articleName: row.articulo || 'Artículo desconocido',
                                quantity: cantidad,
                                unitPrice: unitPrice,
                                subtotal,
                                tax,
                                total
                            });            }

                for (const rcpt of receiptsMap.values()) {
                    try {
                        const existingRcpt = await prisma.reception.findUnique({
                            where: { tenantId_folio: { tenantId, folio: rcpt.folio } }
                        });

                        if (existingRcpt) {
                            await prisma.receptionArticle.deleteMany({ where: { receptionId: existingRcpt.id } });
                            await prisma.reception.update({
                                where: { id: existingRcpt.id },
                                data: {
                                    fecha: rcpt.fecha,
                                    purchaseOrderId: rcpt.purchaseOrderId,
                                    articles: { create: rcpt.articles }
                                }
                            });
                            rcptUpdatedCount++;
                        } else {
                            await prisma.reception.create({
                                data: {
                                    folio: rcpt.folio,
                                    fecha: rcpt.fecha,
                                    tenantId,
                                    purchaseOrderId: rcpt.purchaseOrderId,
                                    articles: { create: rcpt.articles }
                                }
                            });
                            rcptCreatedCount++;
                        }
                    } catch (rError: any) {
                        rcptErrorCount++;
                        errorCount++;
                        errorDetails.push({ folio: `Recepcion-${rcpt.folio}`, rfc: 'N/A', motivo: rError?.message || 'Error guardando recepción' });
                    }
                }
                console.log(`[SYNC MANUAL] Recepciones obtenidas: ${rcptCreatedCount} nuevas, ${rcptUpdatedCount} actualizadas.`);
            } catch (err: any) {
                console.error(`[SYNC MANUAL] Fallo buscando Recepciones en SuiteQL: ${err.message}`);
            }
        }

        const durationMs = Date.now() - startTime;

        // Determinar estatus global del sync
        const allFailed = errorCount + skippedCount === results.length && (results.length > 0 || errorCount > 0);
        const hasErrors = errorCount > 0;
        const syncStatus = allFailed ? 'FAILED' : hasErrors || skippedCount > 0 ? 'PARTIAL' : 'SUCCESS';

        // Serializar errores detallados para el log
        const errorMessage = errorDetails.length > 0
            ? `${errorDetails.length} errores:\n` + errorDetails.map(e =>
                `  • ${e.folio} (RFC: ${e.rfc}): ${e.motivo}`
            ).join('\n')
            : undefined;

        // 7. Registrar el log
        await prisma.syncLog.create({
            data: {
                type: 'MANUAL',
                status: syncStatus,
                totalFound: results.length,
                createdCount,
                updatedCount,
                skippedCount: skippedCount + errorCount, // total de no procesadas
                durationMs,
                triggeredBy,
                tenantId,
                ...(errorMessage ? { errorMessage } : {})
            }
        });

        return NextResponse.json({
            message: syncStatus === 'SUCCESS'
                ? `Sincronización completada exitosamente.`
                : syncStatus === 'PARTIAL'
                    ? `Sincronización parcial: ${errorCount} OC con error, ${skippedCount} omitidas.`
                    : 'Sincronización fallida.',
            totalFound: results.length,
            createdCount,
            updatedCount,
            skippedCount,
            errorCount,
            durationMs,
            ...(errorDetails.length > 0 ? { errors: errorDetails } : {})
        }, { status: 200 });

    } catch (error: any) {
        const durationMs = Date.now() - startTime;
        console.error('[SYNC MANUAL] Error durante la sincronización:', error);

        // Intentar registrar el fallo en el log (si tenemos tenantId)
        try {
            const authHeader = request.headers.get('Authorization');
            if (authHeader) {
                const token = authHeader.split(' ')[1];
                const dec: any = jwt.decode(token);
                if (dec?.tenantId) {
                    await prisma.syncLog.create({
                        data: {
                            type: 'MANUAL', status: 'FAILED', durationMs,
                            errorMessage: error.message, tenantId: dec.tenantId,
                            triggeredBy: dec.email || 'admin'
                        }
                    });
                }
            }
        } catch { /* silencioso */ }

        return NextResponse.json({
            message: 'Error durante la sincronización con NetSuite.',
            error: error.message
        }, { status: 500 });
    }
}

// GET: Obtener el historial de sincronizaciones y el estado del último sync
export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
        }
        const token = authHeader.split(' ')[1];

        let decodedToken: any;
        try {
            decodedToken = jwt.verify(token, process.env.JWT_SECRET!);
        } catch {
            return NextResponse.json({ message: 'Token inválido' }, { status: 401 });
        }

        if (decodedToken.role !== 'TENANT_ADMIN' && decodedToken.role !== 'ADMIN') {
            return NextResponse.json({ message: 'No autorizado' }, { status: 403 });
        }

        const tenantId: string = decodedToken.tenantId;

        const logs = await prisma.syncLog.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
            take: 10 // Últimos 10 logs
        });

        return NextResponse.json(logs, { status: 200 });

    } catch (error: any) {
        return NextResponse.json({ message: 'Error al obtener el historial.', error: error.message }, { status: 500 });
    }
}
