// app/api/invoices/pending-assignment/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const prisma = new PrismaClient();

function getDecoded(request: Request): any | null {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  try { return jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET!); } catch { return null; }
}

// GET /api/invoices/pending-assignment — listar facturas sin OC asignada
export async function GET(request: Request) {
  const decoded = getDecoded(request);
  if (!decoded) return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });
  if (!['CARGADOR', 'TENANT_ADMIN', 'SUPERADMIN'].includes(decoded.role)) {
    return NextResponse.json({ message: 'Sin permiso.' }, { status: 403 });
  }

  const invoices = await prisma.invoice.findMany({
    where: { tenantId: decoded.tenantId, pendingAssignment: true },
    include: {
      user: { select: { supplierProfile: { select: { companyName: true, rfc: true } } } },
      uploadedByUser: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(invoices.map(inv => ({
    id: inv.id,
    folio: inv.folio,
    fecha: inv.fecha,
    total: inv.total,
    subtotal: inv.subtotal,
    tax: inv.tax,
    supplierName: inv.user?.supplierProfile?.companyName ?? 'N/A',
    supplierRfc: inv.user?.supplierProfile?.rfc ?? 'N/A',
    uploadedBy: inv.uploadedByUser?.name ?? inv.uploadedByUser?.email ?? 'Proveedor',
    createdAt: inv.createdAt,
  })));
}

// PATCH /api/invoices/pending-assignment — resolver una factura pendiente:
//   { invoiceId, purchaseOrderId }  -> asignar OC manualmente (matchMethod MANUAL)
//   { invoiceId, standalone: true } -> enviar sin OC como Vendor Bill standalone (matchMethod STANDALONE)
// En ambos casos se encola a SQS para sincronizar a NetSuite.
export async function PATCH(request: Request) {
  const decoded = getDecoded(request);
  if (!decoded) return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });
  if (!['CARGADOR', 'TENANT_ADMIN', 'SUPERADMIN'].includes(decoded.role)) {
    return NextResponse.json({ message: 'Sin permiso.' }, { status: 403 });
  }

  const { invoiceId, purchaseOrderId, standalone } = await request.json();
  if (!invoiceId) {
    return NextResponse.json({ message: 'invoiceId es requerido.' }, { status: 400 });
  }
  if (!standalone && !purchaseOrderId) {
    return NextResponse.json({ message: 'Debes asignar una OC o marcar la factura como sin OC (standalone).' }, { status: 400 });
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId: decoded.tenantId, pendingAssignment: true },
  });
  if (!invoice) return NextResponse.json({ message: 'Factura no encontrada o ya asignada.' }, { status: 404 });

  if (standalone) {
    // Sin OC: se registrará en NetSuite como Vendor Bill standalone (desde los datos del proveedor)
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        pendingAssignment: false,
        matchMethod: 'STANDALONE',
        syncStatus: 'PENDING_SYNC',
        syncError: null,
      },
    });
  } else {
    const po = await prisma.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, tenantId: decoded.tenantId },
      select: { id: true },
    });
    if (!po) return NextResponse.json({ message: 'Orden de compra no encontrada.' }, { status: 404 });

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        purchaseOrderId,
        pendingAssignment: false,
        matchMethod: 'MANUAL',
        syncStatus: 'PENDING_SYNC',
        syncError: null,
      },
    });
  }

  // Encolar en SQS para sincronizar a NetSuite
  const sqsClient = new SQSClient({
    region: process.env.APP_AWS_REGION || 'us-east-2',
    credentials: {
      accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
    },
  });

  await sqsClient.send(new SendMessageCommand({
    QueueUrl: process.env.SQS_INVOICES_URL,
    MessageBody: JSON.stringify({ invoiceId, userId: invoice.userId, purchaseOrderId: standalone ? null : purchaseOrderId }),
  })).catch(e => console.error('[PendingAssignment] SQS error:', e));

  return NextResponse.json({
    message: standalone
      ? 'Factura enviada sin OC (standalone). Se sincronizará a NetSuite en breve.'
      : 'OC asignada. La factura será sincronizada en breve.',
  });
}
