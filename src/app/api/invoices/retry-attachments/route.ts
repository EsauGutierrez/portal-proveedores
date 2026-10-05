// app/api/invoices/retry-attachments/route.ts
// Reintenta el envío a NetSuite de los documentos adicionales de una factura.

import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireAuth } from '../../../lib/auth';
import { syncInvoiceAttachments } from '../../../lib/syncInvoiceAttachments';

export async function POST(request: Request) {
  const auth = await requireAuth(request, ['TENANT_ADMIN', 'SUPERADMIN']);
  if (auth.error) return auth.error;
  const { decoded } = auth;

  try {
    const { invoiceId } = await request.json();
    if (!invoiceId || typeof invoiceId !== 'string') {
      return NextResponse.json({ message: 'Falta invoiceId.' }, { status: 400 });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { tenantId: true, netsuiteId: true, syncStatus: true },
    });
    // Aislamiento por tenant: un TENANT_ADMIN solo opera sobre facturas de su empresa.
    if (!invoice || (decoded.role === 'TENANT_ADMIN' && invoice.tenantId !== decoded.tenantId)) {
      return NextResponse.json({ message: 'Factura no encontrada.' }, { status: 404 });
    }
    if (invoice.syncStatus !== 'SYNCED' || !invoice.netsuiteId) {
      return NextResponse.json(
        { message: 'La factura aún no está sincronizada con NetSuite. Sus documentos adicionales se enviarán automáticamente al sincronizarla.' },
        { status: 409 },
      );
    }

    const summary = await syncInvoiceAttachments(invoiceId);

    const attachments = await prisma.invoiceAttachment.findMany({
      where: { invoiceId },
      select: { id: true, netsuiteSyncStatus: true, netsuiteSyncError: true },
    });

    const message = summary.skipped
      ? summary.skipped
      : summary.total === 0
        ? 'Todos los documentos adicionales ya estaban enviados a NetSuite.'
        : summary.failed === 0
          ? 'Documentos adicionales enviados a NetSuite.'
          : `${summary.synced} enviado(s) y ${summary.failed} con error. Revisa el detalle de cada documento.`;

    return NextResponse.json({ message, ...summary, attachments });
  } catch (error: any) {
    console.error('[invoices/retry-attachments] Error:', error);
    return NextResponse.json({ message: 'Error al reintentar el envío de los documentos adicionales.' }, { status: 500 });
  }
}
