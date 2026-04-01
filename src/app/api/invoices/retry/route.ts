// app/api/invoices/retry/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string; role: string };

    const { invoiceId } = await request.json();
    if (!invoiceId) {
      return NextResponse.json({ message: 'Falta invoiceId.' }, { status: 400 });
    }

    // Verificar que la factura existe y pertenece al usuario (o es admin)
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, syncStatus: true, userId: true }
    });

    if (!invoice) {
      return NextResponse.json({ message: 'Factura no encontrada.' }, { status: 404 });
    }

    const isOwner = invoice.userId === decoded.userId;
    const isAdmin = ['SUPERADMIN', 'TENANT_ADMIN'].includes(decoded.role);
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ message: 'Sin permisos para reintentar esta factura.' }, { status: 403 });
    }

    // Resetear estado a PENDING_SYNC
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { syncStatus: 'PENDING_SYNC', syncError: null }
    });

    // Reencolar en SQS
    const sqsClient = new SQSClient({
      region: process.env.AWS_REGION || 'us-east-2',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

    await sqsClient.send(new SendMessageCommand({
      QueueUrl: (process.env.AWS_SQS_INVOICES_URL || process.env.SQS_INVOICES_URL)?.trim(),
      MessageBody: JSON.stringify({ invoiceId })
    }));

    console.log(`[Retry] Factura ${invoiceId} reencolada por usuario ${decoded.userId}`);
    return NextResponse.json({ message: 'Factura reencolada para sincronización.' }, { status: 200 });

  } catch (error) {
    console.error('[Retry] Error:', error);
    return NextResponse.json({ message: 'Error al reintentar la sincronización.' }, { status: 500 });
  }
}
