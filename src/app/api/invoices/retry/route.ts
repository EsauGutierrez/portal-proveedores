// app/api/invoices/retry/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import jwt from 'jsonwebtoken';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string; role: string; tenantId?: string };

    const { invoiceId } = await request.json();
    if (!invoiceId) {
      return NextResponse.json({ message: 'Falta invoiceId.' }, { status: 400 });
    }

    // Verificar que la factura existe y pertenece al usuario (o es admin)
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, syncStatus: true, userId: true, tenantId: true }
    });

    if (!invoice) {
      return NextResponse.json({ message: 'Factura no encontrada.' }, { status: 404 });
    }

    const isOwner = invoice.userId === decoded.userId;
    const isAdmin = ['SUPERADMIN', 'TENANT_ADMIN'].includes(decoded.role);
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ message: 'Sin permisos para reintentar esta factura.' }, { status: 403 });
    }
    // Aislamiento por tenant: un TENANT_ADMIN solo puede reintentar facturas de su propio tenant.
    if (decoded.role === 'TENANT_ADMIN' && invoice.tenantId !== decoded.tenantId) {
      return NextResponse.json({ message: 'Sin permisos para reintentar esta factura.' }, { status: 403 });
    }

    // Resetear estado a PENDING_SYNC
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { syncStatus: 'PENDING_SYNC', syncError: null }
    });

    // Reencolar en SQS.
    // IMPORTANTE: Amplify/Lambda reservan las variables con prefijo AWS_ y no permiten
    // configurarlas, por eso la app usa APP_AWS_* para sus credenciales (igual que el
    // upload en /api/invoices). Se deja fallback a AWS_* para funcionar también en local.
    const sqsClient = new SQSClient({
      region: process.env.APP_AWS_REGION || process.env.AWS_REGION || 'us-east-2',
      credentials: {
        accessKeyId: (process.env.APP_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID)!,
        secretAccessKey: (process.env.APP_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY)!,
      },
    });

    try {
      await sqsClient.send(new SendMessageCommand({
        QueueUrl: (process.env.SQS_INVOICES_URL || process.env.AWS_SQS_INVOICES_URL)?.trim(),
        MessageBody: JSON.stringify({ invoiceId })
      }));
    } catch (sqsError: any) {
      // Si falla el encolado, revertimos el estado para que la factura no quede colgada
      // en "En validación" sin que nada la procese, y devolvemos un error claro.
      console.error('[Retry] Error enviando a SQS:', sqsError);
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: { syncStatus: 'FAILED', syncError: `No se pudo reencolar la factura: ${sqsError?.message || 'error de SQS'}` },
      });
      return NextResponse.json({ message: 'No se pudo reencolar la factura para sincronización. Intenta de nuevo.' }, { status: 502 });
    }

    console.log(`[Retry] Factura ${invoiceId} reencolada por usuario ${decoded.userId}`);
    return NextResponse.json({ message: 'Factura reencolada para sincronización.' }, { status: 200 });

  } catch (error) {
    console.error('[Retry] Error:', error);
    return NextResponse.json({ message: 'Error al reintentar la sincronización.' }, { status: 500 });
  }
}
