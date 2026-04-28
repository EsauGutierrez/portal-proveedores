// app/api/sync/purchase-orders/route.ts
// Sincronización programada para UN tenant específico (x-tenant-id requerido).
// Útil cuando un tenant necesita una frecuencia de sync distinta al resto.

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { syncPurchaseOrdersForTenant } from '../../../lib/syncPurchaseOrdersForTenant';

const prisma = new PrismaClient();

export async function GET(request: Request) {
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
    include: { subsidiaries: true },
  });

  if (!tenant || !tenant.netsuiteAccountId || !tenant.netsuiteConsumerKey ||
    !tenant.netsuiteConsumerSec || !tenant.netsuiteTokenId || !tenant.netsuiteTokenSecret) {
    return NextResponse.json(
      { message: 'Credenciales de NetSuite incompletas o empresa no encontrada' },
      { status: 400 }
    );
  }

  try {
    const result = await syncPurchaseOrdersForTenant(tenant.id, tenant as any, 'sistema', 'SCHEDULED');
    return NextResponse.json({
      message: `Sincronización ${result.status === 'SUCCESS' ? 'completada' : 'con incidencias'}.`,
      ...result,
    });
  } catch (error: any) {
    console.error('[SYNC PER-TENANT] Error:', error);
    return NextResponse.json({ message: 'Error durante la sincronización.', error: error.message }, { status: 500 });
  }
}
