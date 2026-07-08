// api/payment-complements/bulk/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import jwt from 'jsonwebtoken';
import { uploadFileToS3 } from '../../../lib/s3';

// POST: Iniciar carga masiva de complementos de pago (sube ZIP y encola en SQS)
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });
    }
    let decoded: any;
    try {
      decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET!);
    } catch {
      return NextResponse.json({ message: 'Token inválido.' }, { status: 401 });
    }
    const isCargador = decoded.role === 'CARGADOR';
    const isSupplier = decoded.role === 'SUPPLIER';
    if (!isSupplier && !isCargador) {
      return NextResponse.json({ message: 'Sin permiso para usar esta función.' }, { status: 403 });
    }

    const formData = await request.formData();
    const zipFile = formData.get('zipFile') as File | null;
    const supplierUserIdParam = formData.get('supplierUserId') as string | null;

    if (!zipFile) {
      return NextResponse.json({ message: 'Se requiere un archivo ZIP.' }, { status: 400 });
    }
    if (!zipFile.name.toLowerCase().endsWith('.zip')) {
      return NextResponse.json({ message: 'El archivo debe ser un ZIP.' }, { status: 400 });
    }

    // Para CARGADOR: debe indicar el proveedor y tener asignación válida
    if (isCargador) {
      if (!supplierUserIdParam) {
        return NextResponse.json({ message: 'El CARGADOR debe especificar el proveedor (supplierUserId).' }, { status: 400 });
      }
      const assignment = await prisma.operatorAssignment.findFirst({
        where: { operatorId: decoded.userId, supplierProfile: { userId: supplierUserIdParam } },
      });
      if (!assignment) {
        return NextResponse.json({ message: 'No tienes asignación para este proveedor.' }, { status: 403 });
      }
    }

    // Determinar el userId efectivo (a nombre de quién se sube)
    const effectiveUserId = isCargador && supplierUserIdParam ? supplierUserIdParam : decoded.userId;

    // Verificar que el usuario efectivo tiene un tenant
    const user = await prisma.user.findUnique({
      where: { id: effectiveUserId },
      select: { tenantId: true },
    });
    if (!user?.tenantId) {
      return NextResponse.json({ message: 'Usuario sin tenant asignado.' }, { status: 422 });
    }

    // Subir ZIP a S3
    const s3ZipKey = await uploadFileToS3(zipFile, `bulk-uploads/${decoded.userId}`);

    // Crear registro de log
    const bulkLog = await prisma.bulkPaymentComplementLog.create({
      data: {
        tenantId: user.tenantId,
        userId: decoded.userId,
        zipFilename: zipFile.name,
        s3ZipKey,
        status: 'PROCESSING',
        results: [],
      },
    });

    // Enviar a SQS para procesamiento en segundo plano
    const sqsClient = new SQSClient({
      region: process.env.APP_AWS_REGION || 'us-east-2',
      credentials: {
        accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
      },
    });

    try {
      await sqsClient.send(new SendMessageCommand({
        QueueUrl: process.env.SQS_INVOICES_URL,
        MessageBody: JSON.stringify({
          bulkLogId: bulkLog.id,
          s3ZipKey,
          userId: decoded.userId,
          tenantId: user.tenantId,
        }),
      }));
    } catch (sqsErr) {
      console.error('[BulkUpload] Error enviando a SQS:', sqsErr);
      // El log ya está creado; el admin puede retriggerear manualmente si es necesario
    }

    return NextResponse.json(
      { logId: bulkLog.id, message: 'ZIP recibido. El procesamiento se realizará en segundo plano.' },
      { status: 202 }
    );
  } catch (err) {
    console.error('[BulkUpload] Error:', err);
    return NextResponse.json({ message: 'Error interno al iniciar la carga masiva.' }, { status: 500 });
  }
}

// GET: Listar logs de cargas masivas del proveedor autenticado
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });
    }
    let decoded: any;
    try {
      decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET!);
    } catch {
      return NextResponse.json({ message: 'Token inválido.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));

    const [logs, total] = await Promise.all([
      prisma.bulkPaymentComplementLog.findMany({
        where: { userId: decoded.userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
        select: {
          id: true,
          zipFilename: true,
          status: true,
          totalFiles: true,
          successCount: true,
          failedCount: true,
          createdAt: true,
        },
      }),
      prisma.bulkPaymentComplementLog.count({ where: { userId: decoded.userId } }),
    ]);

    return NextResponse.json({ data: logs, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[BulkUpload GET] Error:', err);
    return NextResponse.json({ message: 'Error al obtener el historial.' }, { status: 500 });
  }
}
