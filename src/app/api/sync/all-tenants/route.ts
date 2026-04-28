// app/api/sync/all-tenants/route.ts
// Sincronización programada para TODOS los tenants activos con NetSuite configurado.
// Llamado por EventBridge Scheduler. No requiere x-tenant-id — itera internamente.

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { syncPurchaseOrdersForTenant } from '../../../lib/syncPurchaseOrdersForTenant';

const prisma = new PrismaClient();

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
    try {
      console.log(`[SYNC ALL] → Tenant: ${tenant.name} (${tenant.id})`);
      const result = await syncPurchaseOrdersForTenant(
        tenant.id,
        tenant as any,
        'sistema',
        'SCHEDULED'
      );
      results.push(result);
      console.log(`[SYNC ALL] ✓ ${tenant.name}: ${result.createdCount} creadas, ${result.updatedCount} actualizadas`);
    } catch (err: any) {
      console.error(`[SYNC ALL] ✗ Error en tenant ${tenant.name}: ${err.message}`);
      results.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        status: 'FAILED',
        error: err.message,
      });
    }
  }

  const totalCreated = results.reduce((s: number, r: any) => s + (r.createdCount || 0), 0);
  const totalUpdated = results.reduce((s: number, r: any) => s + (r.updatedCount || 0), 0);
  const failed = results.filter((r: any) => r.status === 'FAILED').length;

  return NextResponse.json({
    message: `Sync completado: ${tenants.length} tenants procesados.`,
    summary: { tenants: tenants.length, totalCreated, totalUpdated, failed },
    results,
  });
}
