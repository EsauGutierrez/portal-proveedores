// app/api/invoices/pending-assignment/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import jwt from 'jsonwebtoken';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

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

// PATCH /api/invoices/pending-assignment — asignar OC manualmente y encolar
export async function PATCH(request: Request) {
  const decoded = getDecoded(request);
  if (!decoded) return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });
  if (!['CARGADOR', 'TENANT_ADMIN', 'SUPERADMIN'].includes(decoded.role)) {
    return NextResponse.json({ message: 'Sin permiso.' }, { status: 403 });
  }

  const { invoiceId, purchaseOrderId } = await request.json();
  if (!invoiceId || !purchaseOrderId) {
    return NextResponse.json({ message: 'invoiceId y purchaseOrderId son requeridos.' }, { status: 400 });
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId: decoded.tenantId, pendingAssignment: true },
  });
  if (!invoice) return NextResponse.json({ message: 'Factura no encontrada o ya asignada.' }, { status: 404 });

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
    MessageBody: JSON.stringify({ invoiceId, userId: invoice.userId, purchaseOrderId }),
  })).catch(e => console.error('[PendingAssignment] SQS error:', e));

  return NextResponse.json({ message: 'OC asignada. La factura será sincronizada en breve.' });
}
