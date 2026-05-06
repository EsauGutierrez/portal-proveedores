// lib/syncPurchaseOrdersForTenant.ts
// Lógica central de sincronización de OC y Recepciones para un tenant.
// Usada por el endpoint programado (/api/sync/purchase-orders),
// el endpoint de todos los tenants (/api/sync/all-tenants),
// y el sync manual del admin (/api/admin/sync/purchase-orders).

import { PrismaClient } from '@prisma/client';
import { querySuiteQL } from './netsuite';

const prisma = new PrismaClient();

export interface SyncCreds {
  accountId: string;
  consumerKey: string;
  consumerSecret: string;
  tokenId: string;
  tokenSecret: string;
}

export interface SyncResult {
  tenantId: string;
  tenantName: string;
  totalFound: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  rcptCreatedCount: number;
  rcptUpdatedCount: number;
  durationMs: number;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  errors: { folio: string; rfc: string; motivo: string }[];
}

function parseNetSuiteDate(raw: string | null | undefined): Date {
  if (!raw) return new Date();
  const direct = new Date(raw);
  if (!isNaN(direct.getTime())) return direct;
  const parts = raw.split('/');
  if (parts.length === 3) {
    const [month, day, year] = parts;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

export async function syncPurchaseOrdersForTenant(
  tenantId: string,
  tenant: { name: string; subsidiaries: any[]; netsuiteAccountId: string; netsuiteConsumerKey: string; netsuiteConsumerSec: string; netsuiteTokenId: string; netsuiteTokenSecret: string },
  triggeredBy: 'sistema' | string = 'sistema',
  syncType: 'SCHEDULED' | 'MANUAL' = 'SCHEDULED'
): Promise<SyncResult> {
  const startTime = Date.now();
  const errorDetails: { folio: string; rfc: string; motivo: string }[] = [];

  const creds: SyncCreds = {
    accountId: tenant.netsuiteAccountId,
    consumerKey: tenant.netsuiteConsumerKey,
    consumerSecret: tenant.netsuiteConsumerSec,
    tokenId: tenant.netsuiteTokenId,
    tokenSecret: tenant.netsuiteTokenSecret,
  };

  const baseResult = {
    tenantId,
    tenantName: tenant.name,
    totalFound: 0,
    createdCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    rcptCreatedCount: 0,
    rcptUpdatedCount: 0,
    durationMs: 0,
    status: 'SUCCESS' as const,
    errors: [],
  };

  // 1. Proveedores activos del tenant
  const activeSuppliers = await prisma.supplierProfile.findMany({
    where: { tenantId, status: 'ACTIVE' },
    select: { rfc: true, companyName: true, userId: true },
  });

  if (activeSuppliers.length === 0) {
    const durationMs = Date.now() - startTime;
    await prisma.syncLog.create({
      data: {
        type: syncType, status: 'PARTIAL', totalFound: 0,
        durationMs, triggeredBy, tenantId,
        errorMessage: 'No hay proveedores activos para sincronizar.',
      },
    });
    return { ...baseResult, durationMs, status: 'PARTIAL' };
  }

  const rfcList = activeSuppliers.map(s => s.rfc.replace(/'/g, "''"));
  const rfcClause = rfcList.map(r => `'${r}'`).join(', ');

  // 2. Query SuiteQL para OC
  const defaultQuery = `
    SELECT
      t.id                        AS po_netsuite_id,
      t.tranid                    AS folio,
      t.trandate                  AS fecha,
      BUILTIN.DF(t.subsidiary)    AS subsidiaria,
      BUILTIN.DF(t.entity)        AS proveedor,
      t.foreigntotal              AS total,
      t.taxtotal                  AS taxtotal,
      t.entity                    AS proveedorId,
      v.vatregnumber              AS rfc,
      NVL(t.custbody_es_consignacion, 'F') AS es_consignacion
    FROM
      transaction t
      JOIN Vendor v ON t.entity = v.id
    WHERE
      t.type = 'PurchOrd'
      AND v.vatregnumber IN (${rfcClause})
  `;

  let results: any[] = [];
  const subsidiariesWithCustomQuery = tenant.subsidiaries.filter(s => s.poSuiteqlQuery?.trim());

  if (subsidiariesWithCustomQuery.length > 0) {
    for (const sub of subsidiariesWithCustomQuery) {
      const customQuery = sub.poSuiteqlQuery!.replace(/\{rfcClause\}/g, rfcClause);
      const subResults = await querySuiteQL(customQuery, creds);
      results.push(...subResults);
    }
    const customSubNames = new Set(subsidiariesWithCustomQuery.map((s: any) => s.name));
    const defaultResults = await querySuiteQL(defaultQuery, creds);
    results.push(...defaultResults.filter((po: any) => !customSubNames.has(po.subsidiaria)));
  } else {
    results = await querySuiteQL(defaultQuery, creds);
  }

  if (results.length === 0) {
    const durationMs = Date.now() - startTime;
    await prisma.syncLog.create({
      data: { type: syncType, status: 'SUCCESS', totalFound: 0, durationMs, triggeredBy, tenantId },
    });
    return { ...baseResult, durationMs };
  }

  // 3. Upsert de OC
  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const subsidiaryCache = new Map<string, string>();
  const objPoNetSuiteIdToPrismaId = new Map<string, string>();
  const poNetSuiteIds = new Set<string>();
  const vendorNetSuiteIds = new Set<string>();

  for (const po of results) {
    try {
      const rfcNormalizado = (po.rfc || '').toUpperCase().replace(/\s/g, '').replace(/-/g, '');
      const supplierProfile = await prisma.supplierProfile.findFirst({
        where: { tenantId, rfc: rfcNormalizado },
        select: { userId: true, id: true, netsuiteId: true },
      });

      if (!supplierProfile) { skippedCount++; continue; }

      if (!supplierProfile.netsuiteId && po.proveedorId) {
        await prisma.supplierProfile.update({
          where: { id: supplierProfile.id },
          data: { netsuiteId: po.proveedorId },
        });
      }

      const subName = po.subsidiaria || 'GENERIC_NAME';
      let subsidiaryId = subsidiaryCache.get(subName);
      if (!subsidiaryId) {
        let subsidiary = await prisma.subsidiary.findFirst({
          where: { tenantId, name: subName },
          select: { id: true },
        });
        if (!subsidiary) {
          subsidiary = await prisma.subsidiary.create({
            data: { name: subName, rfc: 'GENERIC_RFC', businessName: subName, taxRegime: 'GENERIC_REGIME', taxAddress: 'GENERIC_ADDRESS', tenantId },
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
        netsuiteId: po.po_netsuite_id,
        folio: po.folio,
        fecha: parseNetSuiteDate(po.fecha),
        subsidiaryId,
        subtotal: valSubtotal,
        total: valTotal,
        tax: valTax,
        userId: supplierProfile.userId,
        tenantId,
        isConsignment: po.es_consignacion === 'T' || po.es_consignacion === true,
      };

      const existing = await prisma.purchaseOrder.findUnique({
        where: { tenantId_folio: { tenantId, folio: po.folio } },
        select: { id: true },
      });

      const upsertedPo = await prisma.purchaseOrder.upsert({
        where: { tenantId_folio: { tenantId, folio: po.folio } },
        update: purchaseOrderData,
        create: purchaseOrderData,
        select: { id: true },
      });

      objPoNetSuiteIdToPrismaId.set(po.po_netsuite_id, upsertedPo.id);
      if (po.po_netsuite_id) poNetSuiteIds.add(po.po_netsuite_id);
      if (po.proveedorId) vendorNetSuiteIds.add(po.proveedorId);

      if (!existing) { createdCount++; } else { updatedCount++; }

    } catch (poError: any) {
      errorCount++;
      errorDetails.push({ folio: po.folio ?? '?', rfc: po.rfc ?? '?', motivo: poError?.message ?? 'Error desconocido' });
    }
  }

  // 4. Sync de Recepciones
  let rcptCreatedCount = 0;
  let rcptUpdatedCount = 0;

  if (poNetSuiteIds.size > 0 && vendorNetSuiteIds.size > 0) {
    const pIds = Array.from(poNetSuiteIds).filter(Boolean).map(id => `'${id}'`).join(',');
    const vIds = Array.from(vendorNetSuiteIds).filter(Boolean).map(id => `'${id}'`).join(',');

    const rcptQuery = `
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
      const rcptResults = await querySuiteQL(rcptQuery, creds);
      const receiptsMap = new Map<string, any>();

      for (const row of rcptResults) {
        if (!objPoNetSuiteIdToPrismaId.has(row.po_netsuite_id)) continue;
        if (!receiptsMap.has(row.ir_folio)) {
          receiptsMap.set(row.ir_folio, {
            folio: row.ir_folio,
            fecha: parseNetSuiteDate(row.fecha),
            purchaseOrderId: objPoNetSuiteIdToPrismaId.get(row.po_netsuite_id),
            articles: [],
          });
        }
        const cantidad = parseFloat(row.cantidad) || 0;
        const unitPrice = parseFloat(row.precio_unitario) || 0;
        const subtotal = Math.abs(parseFloat(row.subtotal)) || (cantidad * unitPrice);
        const tax = Math.abs(parseFloat(row.impuesto)) || 0;
        receiptsMap.get(row.ir_folio).articles.push({
          articleName: row.articulo || 'Artículo desconocido',
          quantity: cantidad, unitPrice, subtotal, tax, total: subtotal + tax,
        });
      }

      for (const rcpt of receiptsMap.values()) {
        try {
          const existingRcpt = await prisma.reception.findUnique({
            where: { tenantId_folio: { tenantId, folio: rcpt.folio } },
          });
          if (existingRcpt) {
            await prisma.receptionArticle.deleteMany({ where: { receptionId: existingRcpt.id } });
            await prisma.reception.update({
              where: { id: existingRcpt.id },
              data: { fecha: rcpt.fecha, purchaseOrderId: rcpt.purchaseOrderId, articles: { create: rcpt.articles } },
            });
            rcptUpdatedCount++;
          } else {
            await prisma.reception.create({
              data: { folio: rcpt.folio, fecha: rcpt.fecha, tenantId, purchaseOrderId: rcpt.purchaseOrderId, articles: { create: rcpt.articles } },
            });
            rcptCreatedCount++;
          }
        } catch (rError: any) {
          errorCount++;
          errorDetails.push({ folio: `Recepcion-${rcpt.folio}`, rfc: 'N/A', motivo: rError?.message || 'Error guardando recepción' });
        }
      }
    } catch (err: any) {
      console.error(`[SYNC] Fallo buscando Recepciones para tenant ${tenantId}: ${err.message}`);
    }
  }

  const durationMs = Date.now() - startTime;
  const allFailed = errorCount + skippedCount === results.length && results.length > 0;
  const syncStatus = allFailed ? 'FAILED' : errorCount > 0 || skippedCount > 0 ? 'PARTIAL' : 'SUCCESS';
  const errorMessage = errorDetails.length > 0
    ? `${errorDetails.length} errores:\n` + errorDetails.map(e => `  • ${e.folio} (RFC: ${e.rfc}): ${e.motivo}`).join('\n')
    : undefined;

  await prisma.syncLog.create({
    data: {
      type: syncType, status: syncStatus,
      totalFound: results.length, createdCount, updatedCount,
      skippedCount: skippedCount + errorCount,
      durationMs, triggeredBy, tenantId,
      ...(errorMessage ? { errorMessage } : {}),
    },
  });

  return {
    tenantId, tenantName: tenant.name,
    totalFound: results.length, createdCount, updatedCount,
    skippedCount, errorCount, rcptCreatedCount, rcptUpdatedCount,
    durationMs, status: syncStatus, errors: errorDetails,
  };
}
