// app/api/invoices/bulk/route.ts
// Carga masiva de facturas desde un ZIP o múltiples archivos XML+PDF
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import jwt from 'jsonwebtoken';
import JSZip from 'jszip';
import { parseStringPromise } from 'xml2js';
import { uploadFileToS3 } from '../../../lib/s3';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

// Extrae pares XML+PDF de un ZIP, respetando cualquier estructura de carpetas
async function extractPairsFromZip(zipBuffer: Buffer): Promise<{ xmlContent: string; pdfBuffer: Buffer | null; xmlName: string; folderPath: string }[]> {
  const zip = await JSZip.loadAsync(zipBuffer);
  const xmlFiles: Record<string, string> = {};
  const pdfFiles: Record<string, Buffer> = {};

  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    const lower = path.toLowerCase();
    if (lower.endsWith('.xml')) {
      xmlFiles[path] = await file.async('string');
    } else if (lower.endsWith('.pdf')) {
      pdfFiles[path] = Buffer.from(await file.async('arraybuffer'));
    }
  }

  const pairs: { xmlContent: string; pdfBuffer: Buffer | null; xmlName: string; folderPath: string }[] = [];

  for (const [xmlPath, xmlContent] of Object.entries(xmlFiles)) {
    const parts = xmlPath.split('/');
    const xmlFileName = parts[parts.length - 1];
    const folderPath = parts.slice(0, -1).join('/');
    const baseName = xmlFileName.replace(/\.xml$/i, '');

    // Buscar PDF con mismo nombre base en la misma carpeta
    const pdfPath = folderPath ? `${folderPath}/${baseName}.pdf` : `${baseName}.pdf`;
    const pdfPathAlt = folderPath ? `${folderPath}/${baseName}.PDF` : `${baseName}.PDF`;
    const pdfBuffer = pdfFiles[pdfPath] || pdfFiles[pdfPathAlt] || null;

    pairs.push({ xmlContent, pdfBuffer, xmlName: baseName, folderPath });
  }

  return pairs;
}

// Extrae hint de OC o RFC del path de carpetas
function extractFolderHints(folderPath: string): { ocHint: string | null; rfcHint: string | null } {
  const parts = folderPath.split('/').filter(Boolean);
  let ocHint: string | null = null;
  let rfcHint: string | null = null;

  for (const part of parts) {
    // RFC mexicano: 3-4 letras + 6 dígitos fecha + 3 alfanuméricos
    if (/^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/i.test(part)) {
      rfcHint = part.toUpperCase();
    }
    // Folio de OC: cualquier string que parezca un folio (contiene dígitos)
    else if (/\d/.test(part)) {
      ocHint = part;
    }
  }
  return { ocHint, rfcHint };
}

// Parsing del CFDI XML
function parseCFDI(xmlContent: string): { uuid: string; emisorRfc: string; total: number; fecha: Date; subtotal: number; tax: number } | null {
  try {
    // parseStringPromise is async but we need sync here — use sync parse
    let data: any;
    // We'll do a simple regex extraction for the critical fields
    const uuidMatch = xmlContent.match(/UUID="([^"]+)"/i);
    const rfcMatch = xmlContent.match(/cfdi:Emisor[^>]*Rfc="([^"]+)"/i);
    const totalMatch = xmlContent.match(/\bTotal="([^"]+)"/i);
    const subtotalMatch = xmlContent.match(/\bSubTotal="([^"]+)"/i);
    const fechaMatch = xmlContent.match(/\bFecha="([^"]+)"/i);
    const ivaMatch = xmlContent.match(/TotalImpuestosTrasladados="([^"]+)"/i);

    if (!uuidMatch || !rfcMatch || !totalMatch || !fechaMatch) return null;

    return {
      uuid: uuidMatch[1],
      emisorRfc: rfcMatch[1].toUpperCase(),
      total: parseFloat(totalMatch[1]) || 0,
      subtotal: parseFloat(subtotalMatch?.[1] || '0') || 0,
      tax: parseFloat(ivaMatch?.[1] || '0') || 0,
      fecha: new Date(fechaMatch[1]),
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });

  let decoded: any;
  try {
    decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET!);
  } catch {
    return NextResponse.json({ message: 'Token inválido.' }, { status: 401 });
  }

  // Verificar que tiene permiso de carga masiva
  const isCargador = decoded.role === 'CARGADOR';
  const isSupplier = decoded.role === 'SUPPLIER';
  const isTenantAdmin = ['TENANT_ADMIN', 'SUPERADMIN'].includes(decoded.role);

  if (!isCargador && !isTenantAdmin) {
    if (isSupplier) {
      // Verificar si el tenant tiene bulk upload habilitado para suppliers
      const tenant = await prisma.tenant.findUnique({
        where: { id: decoded.tenantId },
        select: { bulkUploadForSuppliers: true },
      });
      if (!tenant?.bulkUploadForSuppliers) {
        return NextResponse.json({ message: 'La carga masiva no está habilitada para proveedores.' }, { status: 403 });
      }
    } else {
      return NextResponse.json({ message: 'Sin permiso para carga masiva.' }, { status: 403 });
    }
  }

  const formData = await request.formData();
  const zipFile = formData.get('zipFile') as File | null;
  const supplierUserId = formData.get('supplierUserId') as string | null;

  if (!zipFile) return NextResponse.json({ message: 'Se requiere un archivo ZIP.' }, { status: 400 });

  // Crear el BulkUploadJob
  const job = await prisma.bulkUploadJob.create({
    data: {
      uploadedBy: decoded.userId,
      tenantId: decoded.tenantId,
      status: 'PROCESSING',
    },
  });

  // Extraer pares del ZIP
  const zipBuffer = Buffer.from(await zipFile.arrayBuffer());
  let pairs: Awaited<ReturnType<typeof extractPairsFromZip>>;
  try {
    pairs = await extractPairsFromZip(zipBuffer);
  } catch {
    await prisma.bulkUploadJob.update({ where: { id: job.id }, data: { status: 'COMPLETED_WITH_ERRORS' } });
    return NextResponse.json({ message: 'Error al leer el archivo ZIP. Verifica que sea un ZIP válido.' }, { status: 400 });
  }

  if (pairs.length === 0) {
    await prisma.bulkUploadJob.update({ where: { id: job.id }, data: { status: 'COMPLETED' } });
    return NextResponse.json({ message: 'El ZIP no contiene archivos XML.', jobId: job.id }, { status: 400 });
  }

  await prisma.bulkUploadJob.update({ where: { id: job.id }, data: { totalFiles: pairs.length } });

  const results: { xmlName: string; uuid: string | null; status: 'success' | 'pending' | 'error'; message: string; invoiceId?: string }[] = [];

  const sqsClient = new SQSClient({
    region: process.env.APP_AWS_REGION || 'us-east-2',
    credentials: {
      accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
    },
  });

  for (const pair of pairs) {
    const cfdi = parseCFDI(pair.xmlContent);

    if (!cfdi) {
      results.push({ xmlName: pair.xmlName, uuid: null, status: 'error', message: 'XML inválido o no es un CFDI.' });
      continue;
    }

    // Determinar el userId del proveedor
    let invoiceUserId = supplierUserId || decoded.userId;
    const { ocHint, rfcHint } = extractFolderHints(pair.folderPath);

    // Si hay hint de RFC en la carpeta, buscar el proveedor
    if (rfcHint && isCargador) {
      const profile = await prisma.supplierProfile.findFirst({
        where: { rfc: rfcHint, tenantId: decoded.tenantId },
        select: { userId: true },
      });
      if (profile) invoiceUserId = profile.userId;
    }

    // Matching en cascada: buscar OC
    let purchaseOrderId: string | null = null;
    let matchMethod: 'AUTO' | 'MANUAL' | null = null;
    let pendingAssignment = false;

    // 1. Hint de OC por nombre de carpeta
    if (ocHint) {
      const po = await prisma.purchaseOrder.findFirst({
        where: { tenantId: decoded.tenantId, folio: { contains: ocHint } },
        select: { id: true },
      });
      if (po) { purchaseOrderId = po.id; matchMethod = 'AUTO'; }
    }

    // 2. Buscar por RFC del emisor + rango de monto si no se encontró aún
    if (!purchaseOrderId) {
      const supplierProfile = await prisma.supplierProfile.findFirst({
        where: { rfc: cfdi.emisorRfc, tenantId: decoded.tenantId },
        select: { userId: true },
      });
      if (supplierProfile) {
        const tolerance = 0.5;
        const po = await prisma.purchaseOrder.findFirst({
          where: {
            tenantId: decoded.tenantId,
            userId: supplierProfile.userId,
            total: {
              gte: cfdi.total - tolerance,
              lte: cfdi.total + tolerance,
            },
          },
          select: { id: true },
        });
        if (po) { purchaseOrderId = po.id; matchMethod = 'AUTO'; }
      }
    }

    // 3. Sin OC → queda pendiente de asignación manual
    if (!purchaseOrderId) {
      pendingAssignment = true;
    }

    // Subir archivos a S3
    let pdfUrl: string | null = null;
    let xmlUrl: string | null = null;

    try {
      const folder = `invoices/bulk/${decoded.userId}/${job.id}`;
      const xmlBlob = new Blob([pair.xmlContent], { type: 'text/xml' });
      const xmlFileObj = new File([xmlBlob], `${pair.xmlName}.xml`, { type: 'text/xml' });
      xmlUrl = await uploadFileToS3(xmlFileObj, folder);

      if (pair.pdfBuffer) {
        const pdfBlob = new Blob([pair.pdfBuffer], { type: 'application/pdf' });
        const pdfFileObj = new File([pdfBlob], `${pair.xmlName}.pdf`, { type: 'application/pdf' });
        pdfUrl = await uploadFileToS3(pdfFileObj, folder);
      }
    } catch {
      results.push({ xmlName: pair.xmlName, uuid: cfdi.uuid, status: 'error', message: 'Error al subir archivos a S3.' });
      continue;
    }

    // Crear la factura en BD
    try {
      const invoice = await prisma.invoice.create({
        data: {
          folio: cfdi.uuid,
          fecha: cfdi.fecha,
          subtotal: cfdi.subtotal,
          tax: cfdi.tax,
          total: cfdi.total,
          pdfUrl: pdfUrl || undefined,
          xmlUrl: xmlUrl || undefined,
          syncStatus: pendingAssignment ? 'PENDING_ASSIGNMENT' : 'PENDING_SYNC',
          pendingAssignment,
          matchMethod: matchMethod ?? undefined,
          bulkJob: { connect: { id: job.id } },
          tenant: { connect: { id: decoded.tenantId } },
          user: { connect: { id: invoiceUserId } },
          ...(decoded.userId !== invoiceUserId ? { uploadedByUser: { connect: { id: decoded.userId } } } : {}),
          ...(purchaseOrderId ? { purchaseOrder: { connect: { id: purchaseOrderId } } } : {}),
        } as any,
      });

      // Encolar en SQS solo si tiene OC asignada
      if (!pendingAssignment) {
        await sqsClient.send(new SendMessageCommand({
          QueueUrl: process.env.SQS_INVOICES_URL,
          MessageBody: JSON.stringify({ invoiceId: invoice.id, userId: invoiceUserId, purchaseOrderId }),
        })).catch(e => console.error('[Bulk] SQS error:', e));
      }

      results.push({
        xmlName: pair.xmlName,
        uuid: cfdi.uuid,
        status: pendingAssignment ? 'pending' : 'success',
        message: pendingAssignment ? 'Sin OC asignada — pendiente de asignación manual.' : `OC encontrada (match: ${matchMethod}).`,
        invoiceId: invoice.id,
      });
    } catch (e: any) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        results.push({ xmlName: pair.xmlName, uuid: cfdi.uuid, status: 'error', message: 'Este CFDI ya fue registrado anteriormente.' });
      } else {
        results.push({ xmlName: pair.xmlName, uuid: cfdi.uuid, status: 'error', message: `Error interno: ${e.message}` });
      }
    }
  }

  // Actualizar contadores del job
  const succeeded = results.filter(r => r.status === 'success').length;
  const pending = results.filter(r => r.status === 'pending').length;
  const failed = results.filter(r => r.status === 'error').length;

  await prisma.bulkUploadJob.update({
    where: { id: job.id },
    data: {
      processed: results.length,
      succeeded,
      pending,
      failed,
      status: failed > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
    },
  });

  return NextResponse.json({ jobId: job.id, total: pairs.length, succeeded, pending, failed, results }, { status: 200 });
}
