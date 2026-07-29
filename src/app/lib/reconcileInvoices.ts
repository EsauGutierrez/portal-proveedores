// Reconciliación de facturas Portal ↔ NetSuite.
// Consulta el estado REAL de los VendorBill en NetSuite (por UUID/tranid) y alinea el portal:
//   - Factura PENDING_SYNC/FAILED pero el bill SÍ existe  → SYNCED (adopta el id real).
//     Cubre el caso de TIMEOUT: el bill se creó pero el portal no recibió la respuesta.
//   - Factura SYNCED pero el bill YA NO existe            → FAILED con motivo (eliminado en ERP).
//     NO se recrea en silencio: el borrado pudo ser intencional; el usuario decide reenviar.

import { prisma } from './prisma';
import { querySuiteQL, NetSuiteCredentials } from './netsuite';

export interface ReconcileResult {
  tenantId: string;
  tenantName: string;
  checked: number;
  adopted: number;   // PENDING/FAILED → SYNCED (bill existía)
  deleted: number;   // SYNCED → FAILED (bill eliminado en NetSuite)
  unchanged: number;
  status: 'SUCCESS' | 'SKIPPED' | 'FAILED';
  error?: string;
}

const DELETED_MOTIVE =
  'La factura ya no existe en NetSuite (pudo haber sido eliminada). Presiona "Reenviar" para volver a registrarla.';

function escapeSql(v: string): string {
  return v.replace(/'/g, "''");
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function reconcileInvoicesForTenant(
  tenantId: string,
  tenant: {
    name: string;
    netsuiteAccountId: string | null;
    netsuiteConsumerKey: string | null;
    netsuiteConsumerSec: string | null;
    netsuiteTokenId: string | null;
    netsuiteTokenSecret: string | null;
  },
  triggeredBy: string = 'sistema',
  syncType: 'SCHEDULED' | 'MANUAL' = 'SCHEDULED'
): Promise<ReconcileResult> {
  const startTime = Date.now();
  const base = { tenantId, tenantName: tenant.name, checked: 0, adopted: 0, deleted: 0, unchanged: 0 };

  // Registra la corrida en el Log de Sincronización. Se identifica por el actor
  // "Reconciliación (...)". Para no llenar el log, en las corridas AUTOMÁTICAS solo se
  // registra si hubo algo que reportar (recuperadas/eliminadas/error); las MANUALES
  // siempre se registran para que el admin vea el resultado de su acción.
  const writeLog = async (r: ReconcileResult) => {
    const noteworthy = r.adopted > 0 || r.deleted > 0 || r.status !== 'SUCCESS';
    if (syncType === 'SCHEDULED' && !noteworthy) return;
    const logStatus = r.status === 'FAILED' || r.status === 'SKIPPED' ? 'FAILED' : (r.deleted > 0 ? 'PARTIAL' : 'SUCCESS');
    let msg: string | null = r.error ?? null;
    if (!msg && r.deleted > 0) msg = `${r.deleted} factura(s) ya no existen en NetSuite (pudieron ser eliminadas); requieren re-registro.`;
    try {
      await prisma.syncLog.create({
        data: {
          type: syncType, status: logStatus as any, tenantId,
          totalFound: r.checked, createdCount: r.adopted, updatedCount: r.deleted, skippedCount: r.unchanged,
          durationMs: Date.now() - startTime,
          triggeredBy: `Reconciliación (${triggeredBy})`,
          errorMessage: msg,
        },
      });
    } catch (logErr: any) {
      console.error('[RECONCILE] No se pudo escribir SyncLog:', logErr.message);
    }
  };

  if (!tenant.netsuiteAccountId || !tenant.netsuiteConsumerKey || !tenant.netsuiteConsumerSec || !tenant.netsuiteTokenId || !tenant.netsuiteTokenSecret) {
    const r: ReconcileResult = { ...base, status: 'SKIPPED', error: 'Credenciales de NetSuite incompletas.' };
    await writeLog(r);
    return r;
  }
  const creds: NetSuiteCredentials = {
    accountId: tenant.netsuiteAccountId,
    consumerKey: tenant.netsuiteConsumerKey,
    consumerSecret: tenant.netsuiteConsumerSec,
    tokenId: tenant.netsuiteTokenId,
    tokenSecret: tenant.netsuiteTokenSecret,
  };

  // Facturas candidatas: las ya sincronizadas (para detectar borrados) y las
  // pendientes/fallidas (para detectar bills creados durante un timeout).
  const invoices = await prisma.invoice.findMany({
    where: { tenantId, folio: { not: '' }, syncStatus: { in: ['SYNCED', 'PENDING_SYNC', 'FAILED'] } },
    select: { id: true, folio: true, syncStatus: true, netsuiteId: true },
  });
  if (invoices.length === 0) {
    const r: ReconcileResult = { ...base, status: 'SUCCESS' };
    await writeLog(r);
    return r;
  }

  // Mapa UUID(upper) → billId, consultando NetSuite en lotes.
  const uuidToBillId = new Map<string, string>();
  const uuids = Array.from(new Set(invoices.map(i => (i.folio || '').toUpperCase()).filter(Boolean)));
  for (const group of chunk(uuids, 100)) {
    const inClause = group.map(u => `'${escapeSql(u)}'`).join(', ');
    const rows = await querySuiteQL(
      `SELECT id, UPPER(tranid) AS uuid FROM transaction WHERE type = 'VendBill' AND UPPER(tranid) IN (${inClause})`,
      creds
    );
    for (const r of rows as any[]) {
      if (r.uuid) uuidToBillId.set(String(r.uuid), String(r.id));
    }
  }

  let adopted = 0, deleted = 0, unchanged = 0;
  for (const inv of invoices) {
    const uuid = (inv.folio || '').toUpperCase();
    const billId = uuidToBillId.get(uuid);

    if (inv.syncStatus === 'SYNCED') {
      if (billId) {
        // Existe. Corregir netsuiteId si difiere (raro).
        if (inv.netsuiteId !== billId) {
          await prisma.invoice.update({ where: { id: inv.id }, data: { netsuiteId: billId } });
        }
        unchanged++;
      } else {
        // Estaba sincronizada pero el bill ya no existe → eliminado en ERP.
        await prisma.invoice.update({
          where: { id: inv.id },
          data: { syncStatus: 'FAILED', syncError: DELETED_MOTIVE },
        });
        console.warn(`[RECONCILE] Factura ${inv.folio} marcada FAILED: bill eliminado en NetSuite (tenant ${tenant.name}).`);
        deleted++;
      }
    } else {
      // PENDING_SYNC o FAILED: si el bill existe, fue creado (p. ej. timeout) → adoptar.
      if (billId) {
        await prisma.invoice.update({
          where: { id: inv.id },
          data: { syncStatus: 'SYNCED', netsuiteId: billId, syncError: null },
        });
        console.log(`[RECONCILE] Factura ${inv.folio} adoptada como SYNCED (bill ${billId} ya existía en NetSuite).`);
        adopted++;
      } else {
        unchanged++;
      }
    }
  }

  const result: ReconcileResult = { ...base, checked: invoices.length, adopted, deleted, unchanged, status: 'SUCCESS' };
  await writeLog(result);
  return result;
}
