// app/api/sync/purchase-orders/route.ts
// Endpoint para SINCRONIZACIÓN PROGRAMADA de OC (llamado por un cron job externo).
// Filtra OC solo de proveedores ACTIVOS registrados en el portal.
// Protegido con x-sync-key (no JWT, ya que es llamado por un servicio externo).

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { querySuiteQL } from '../../../lib/netsuite';

const prisma = new PrismaClient();

/**
 * NetSuite SuiteQL devuelve trandate en formato M/D/YYYY (ej. "3/18/2025").
 * new Date() no lo parsea correctamente en todos los entornos.
 */
function parseNetSuiteDate(raw: string | null | undefined): Date {
  if (!raw) return new Date();
  const direct = new Date(raw);
  if (!isNaN(direct.getTime())) return direct;
  // Formato M/D/YYYY o MM/DD/YYYY
  const parts = raw.split('/');
  if (parts.length === 3) {
    const [month, day, year] = parts;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    if (!isNaN(parsed.getTime())) return parsed;
  }
  console.warn(`[SYNC PROGRAMADO] Fecha no reconocida: "${raw}", usando fecha actual.`);
  return new Date();
}

export async function GET(request: Request) {
  const startTime = Date.now();

  // 1. Seguridad: solo llamadas autorizadas con clave de servicio
  const apiKey = request.headers.get('x-sync-key');
  const tenantId = request.headers.get('x-tenant-id');

  if (apiKey !== process.env.SYNC_API_KEY) {
    return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
  }

  if (!tenantId) {
    return NextResponse.json({ message: 'Falta cabecera x-tenant-id' }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { subsidiaries: true }
  });

  if (!tenant || !tenant.netsuiteAccountId || !tenant.netsuiteConsumerKey || !tenant.netsuiteConsumerSec || !tenant.netsuiteTokenId || !tenant.netsuiteTokenSecret) {
    return NextResponse.json({ message: 'Credenciales de NetSuite incompletas o empresa no encontrada' }, { status: 400 });
  }

  const creds = {
    accountId: tenant.netsuiteAccountId,
    consumerKey: tenant.netsuiteConsumerKey,
    consumerSecret: tenant.netsuiteConsumerSec,
    tokenId: tenant.netsuiteTokenId,
    tokenSecret: tenant.netsuiteTokenSecret
  };

  try {
    // 2. Obtener solo proveedores ACTIVOS registrados en el portal
    const activeSuppliers = await prisma.supplierProfile.findMany({
      where: { tenantId, status: 'ACTIVE' },
      select: { rfc: true, companyName: true, userId: true }
    });

    if (activeSuppliers.length === 0) {
      const durationMs = Date.now() - startTime;
      await prisma.syncLog.create({
        data: {
          type: 'SCHEDULED', status: 'PARTIAL', totalFound: 0,
          durationMs, triggeredBy: 'sistema', tenantId,
          errorMessage: 'No hay proveedores activos para sincronizar.'
        }
      });
      return NextResponse.json({
        message: 'No hay proveedores activos registrados en el portal para sincronizar.',
        createdCount: 0, updatedCount: 0, skippedCount: 0
      }, { status: 200 });
    }

    // Filtro por RFC. BUILTIN.DF() no puede usarse en WHERE con JOIN explícito.
    const rfcList = activeSuppliers.map(s => s.rfc.replace(/'/g, "''"));
    const rfcClause = rfcList.map(r => `'${r}'`).join(', ');

    console.log(`[SYNC PROGRAMADO] Iniciando para tenant ${tenantId} — ${activeSuppliers.length} proveedores activos`);

    const suiteqlQuery = `
      SELECT
        t.id                 AS po_netsuite_id,
        t.tranid             AS folio,
        t.trandate           AS fecha,
        BUILTIN.DF(t.subsidiary) AS subsidiaria,
        BUILTIN.DF(t.entity) AS proveedor,
        t.foreigntotal       AS total,
        t.taxtotal           AS taxtotal,
        t.entity             AS proveedorId,
        v.vatregnumber       AS rfc
      FROM
        transaction t
        JOIN Vendor v ON t.entity = v.id
      WHERE
        t.type = 'PurchOrd'
        AND v.vatregnumber IN (${rfcClause})
    `;

    const results = await querySuiteQL(suiteqlQuery, creds);
    console.log(`[SYNC PROGRAMADO] ${results.length} OC encontradas en NetSuite`);

    if (results.length === 0) {
      const durationMs = Date.now() - startTime;
      await prisma.syncLog.create({
        data: {
          type: 'SCHEDULED', status: 'SUCCESS', totalFound: 0,
          durationMs, triggeredBy: 'sistema', tenantId
        }
      });
      return NextResponse.json({ message: 'Sincronización completada. No se encontraron OC nuevas.' }, { status: 200 });
    }

    // 4. Upsert de OC — sin transacción global para evitar timeout P2028
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;   // RFC no encontrado en portal
    let errorCount = 0;   // Errores inesperados al procesar la OC
    const errorDetails: { folio: string; rfc: string; motivo: string }[] = [];

    const subsidiaryCache = new Map<string, string>(); // name → id
    const objPoNetSuiteIdToPrismaId = new Map<string, string>(); // po_netsuite_id → prisma_id
    const poNetSuiteIds = new Set<string>();
    const vendorNetSuiteIds = new Set<string>();

    for (const po of results) {
      try {
        const rfcNormalizado = (po.rfc || '').toUpperCase().replace(/\s/g, '').replace(/-/g, '');

        const supplierProfile = await prisma.supplierProfile.findFirst({
          where: { tenantId, rfc: rfcNormalizado },
          select: { userId: true, id: true, netsuiteId: true }
        });

        if (!supplierProfile) { skippedCount++; continue; }

        if (!supplierProfile.netsuiteId && po.proveedorId) {
          await prisma.supplierProfile.update({
            where: { id: supplierProfile.id },
            data: { netsuiteId: po.proveedorId }
          });
        }

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
                name: subName, rfc: 'GENERIC_RFC', businessName: subName,
                taxRegime: 'GENERIC_REGIME', taxAddress: 'GENERIC_ADDRESS', tenantId
              }
            });
          }
          subsidiaryId = subsidiary.id;
          subsidiaryCache.set(subName, subsidiaryId);
        }

        const valTotal = Math.abs(parseFloat(po.total) || 0);
        const valTax = Math.abs(parseFloat(po.taxtotal) || 0);
        const valSubtotal = valTotal - valTax;

        const purchaseOrderData = {
          netsuiteId: po.po_netsuite_id,
          folio: po.folio,
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

        objPoNetSuiteIdToPrismaId.set(po.po_netsuite_id, upsertedPo.id);
        poNetSuiteIds.add(po.po_netsuite_id);
        if (po.proveedorId) vendorNetSuiteIds.add(po.proveedorId);

        if (!existing) { createdCount++; } else { updatedCount++; }

      } catch (poError: any) {
        errorCount++;
        const detail = {
          folio: po.folio ?? '?',
          rfc: po.rfc ?? '?',
          motivo: poError?.message ?? 'Error desconocido'
        };
        errorDetails.push(detail);
        console.error(`[SYNC PROGRAMADO] Error OC ${detail.folio} (${detail.rfc}): ${detail.motivo}`);
      }
    }

    // =========================================================================
    // 6.5. SINCRONIZACIÓN DE RECEPCIONES (ITEM RECEIPTS)
    // =========================================================================
    let rcptCreatedCount = 0;
    let rcptUpdatedCount = 0;
    let rcptErrorCount = 0;

    if (poNetSuiteIds.size > 0 && vendorNetSuiteIds.size > 0) {
      console.log(`[SYNC PROGRAMADO] Buscando Recepciones para ${vendorNetSuiteIds.size} proveedores Netsuite y ${poNetSuiteIds.size} OC Netsuite...`);

      const pIds = Array.from(poNetSuiteIds).filter(Boolean).map(id => `'${id}'`).join(',');
      const vIds = Array.from(vendorNetSuiteIds).filter(Boolean).map(id => `'${id}'`).join(',');

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
          });
        }

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
            errorDetails.push({ folio: `Recepcion-${rcpt.folio}`, rfc: 'N/A', motivo: rError?.message || 'Error guardando recepción' });
            errorCount++;
            console.error(`[SYNC PROGRAMADO] Error Recepción ${rcpt.folio}: ${rError.message}`);
          }
        }
        console.log(`[SYNC PROGRAMADO] Recepciones obtenidas: ${rcptCreatedCount} nuevas, ${rcptUpdatedCount} actualizadas.`);
      } catch (err: any) {
        console.error(`[SYNC PROGRAMADO] Fallo buscando Recepciones en SuiteQL: ${err.message}`);
      }
    }

    const durationMs = Date.now() - startTime;

    // Determinar estatus global
    const allFailed = errorCount + skippedCount === results.length && (results.length > 0 || errorCount > 0);
    const hasErrors = errorCount > 0;
    const syncStatus = allFailed ? 'FAILED' : hasErrors || skippedCount > 0 ? 'PARTIAL' : 'SUCCESS';

    const errorMessage = errorDetails.length > 0
      ? `${errorDetails.length} errores:\n` + errorDetails.map(e =>
        `  • ${e.folio} (RFC: ${e.rfc}): ${e.motivo}`
      ).join('\n')
      : undefined;

    await prisma.syncLog.create({
      data: {
        type: 'SCHEDULED',
        status: syncStatus,
        totalFound: results.length,
        createdCount, updatedCount,
        skippedCount: skippedCount + errorCount,
        durationMs, triggeredBy: 'sistema', tenantId,
        ...(errorMessage ? { errorMessage } : {})
      }
    });

    return NextResponse.json({
      message: `Sincronización programada ${syncStatus === 'SUCCESS' ? 'completada' : 'con incidencias'}.`,
      totalFound: results.length,
      createdCount, updatedCount, skippedCount, errorCount,
      ...(errorDetails.length > 0 ? { errors: errorDetails } : {})
    }, { status: 200 });


  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    console.error('[SYNC PROGRAMADO] Error:', error);

    try {
      await prisma.syncLog.create({
        data: {
          type: 'SCHEDULED', status: 'FAILED', durationMs,
          errorMessage: error.message, tenantId, triggeredBy: 'sistema'
        }
      });
    } catch { /* silencioso */ }

    return NextResponse.json({
      message: 'Error interno durante la sincronización programada.',
      error: error.message
    }, { status: 500 });
  }
}
