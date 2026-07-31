// POST /api/admin/sync/reconcile-invoices
// Reconciliación manual de facturas ↔ NetSuite para el tenant del admin.
// Adopta bills creados durante un timeout (PENDING/FAILED → SYNCED) y marca los
// eliminados en NetSuite (SYNCED → FAILED con motivo). Solo TENANT_ADMIN/ADMIN.

import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAuth } from '../../../../lib/auth';
import { reconcileInvoicesForTenant } from '../../../../lib/reconcileInvoices';

export async function POST(request: Request) {
  const auth = await requireAuth(request, ['ADMIN', 'TENANT_ADMIN']);
  if (auth.error) return auth.error;
  const { decoded } = auth;

  if (!decoded.tenantId) {
    return NextResponse.json({ message: 'Token sin tenant.' }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: decoded.tenantId },
    select: {
      name: true,
      netsuiteAccountId: true, netsuiteConsumerKey: true, netsuiteConsumerSec: true,
      netsuiteTokenId: true, netsuiteTokenSecret: true,
    },
  });
  if (!tenant) {
    return NextResponse.json({ message: 'Empresa no encontrada.' }, { status: 404 });
  }

  try {
    const result = await reconcileInvoicesForTenant(decoded.tenantId, tenant, decoded.email || 'admin', 'MANUAL');
    return NextResponse.json({
      message: result.status === 'SUCCESS'
        ? `Reconciliación completada: ${result.checked} revisadas, ${result.adopted} recuperadas, ${result.deleted} eliminadas en NetSuite.`
        : (result.error || 'No se pudo reconciliar.'),
      ...result,
    }, { status: result.status === 'FAILED' ? 502 : 200 });
  } catch (err: any) {
    console.error('[RECONCILE] Error:', err);
    return NextResponse.json({ message: `Error al reconciliar: ${err.message}` }, { status: 500 });
  }
}
