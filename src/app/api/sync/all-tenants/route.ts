// app/api/sync/all-tenants/route.ts
// Sincronización programada para TODOS los tenants activos con NetSuite configurado.
// Llamado por EventBridge Scheduler. No requiere x-tenant-id — itera internamente.

import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { syncPurchaseOrdersForTenant } from '../../../lib/syncPurchaseOrdersForTenant';
import { syncSuppliersForTenant } from '../../../lib/syncSuppliersForTenant';
import { reconcileInvoicesForTenant } from '../../../lib/reconcileInvoices';

export async function GET(request: Request) {
  const apiKey = request.headers.get('x-sync-key');
  if (apiKey !== process.env.SYNC_API_KEY) {
    return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
  }

  // Tenants con credenciales NetSuite completas
  const tenants = await prisma.tenant.findMany({
    where: {
      isActive: true,
      netsuiteAccountId: { not: null },
      netsuiteConsumerKey: { not: null },
      netsuiteConsumerSec: { not: null },
      netsuiteTokenId: { not: null },
      netsuiteTokenSecret: { not: null },
    },
    include: { subsidiaries: true },
  });

  if (tenants.length === 0) {
    return NextResponse.json({ message: 'No hay tenants con NetSuite configurado.', results: [] });
  }

  console.log(`[SYNC ALL] Iniciando sync para ${tenants.length} tenants...`);

  const results = [];
  for (const tenant of tenants) {
    console.log(`[SYNC ALL] → Tenant: ${tenant.name} (${tenant.id})`);

    // 1. Sincronizar proveedores primero (para que existan antes de buscar sus OC)
    try {
      const suppResult = await syncSuppliersForTenant(tenant.id, tenant as any);
      console.log(`[SYNC ALL] ✓ Proveedores ${tenant.name}: ${suppResult.createdCount} nuevos, ${suppResult.updatedCount} actualizados`);
    } catch (err: any) {
      console.error(`[SYNC ALL] ✗ Error sync proveedores ${tenant.name}: ${err.message}`);
    }

    // 2. Sincronizar órdenes de compra
    try {
      const result = await syncPurchaseOrdersForTenant(tenant.id, tenant as any, 'sistema', 'SCHEDULED');
      results.push(result);
      console.log(`[SYNC ALL] ✓ OC ${tenant.name}: ${result.createdCount} creadas, ${result.updatedCount} actualizadas`);
    } catch (err: any) {
      console.error(`[SYNC ALL] ✗ Error sync OC ${tenant.name}: ${err.message}`);
      results.push({ tenantId: tenant.id, tenantName: tenant.name, status: 'FAILED', error: err.message });
    }

    // 3. Reconciliar facturas ↔ NetSuite (adopta bills creados en timeout; marca los eliminados)
    try {
      const rec = await reconcileInvoicesForTenant(tenant.id, tenant as any, 'sistema', 'SCHEDULED');
      if (rec.adopted > 0 || rec.deleted > 0) {
        console.log(`[SYNC ALL] ✓ Reconciliación ${tenant.name}: ${rec.adopted} adoptadas, ${rec.deleted} eliminadas en ERP`);
      }
    } catch (err: any) {
      console.error(`[SYNC ALL] ✗ Error reconciliación facturas ${tenant.name}: ${err.message}`);
    }
  }

  const totalCreated = results.reduce((s: number, r: any) => s + (r.createdCount || 0), 0);
  const totalUpdated = results.reduce((s: number, r: any) => s + (r.updatedCount || 0), 0);
  const failed = results.filter((r: any) => r.status === 'FAILED').length;

  return NextResponse.json({
    message: `Sync completado: ${tenants.length} tenants procesados (proveedores + OC).`,
    summary: { tenants: tenants.length, totalCreated, totalUpdated, failed },
    results,
  });
}
