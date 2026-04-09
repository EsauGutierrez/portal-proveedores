// app/api/payment-complements/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { parseStringPromise } from 'xml2js';
import { uploadFileToS3, getPresignedUrl } from '../../lib/s3';

const prisma = new PrismaClient();

// GET: Listar complementos de pago del proveedor autenticado
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    let decoded: any;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET!);
    } catch {
      return NextResponse.json({ message: 'Token inválido.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));

    const [complements, total] = await Promise.all([
      prisma.paymentComplement.findMany({
        where: { userId: decoded.userId },
        include: {
          invoice: { select: { folio: true, fecha: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.paymentComplement.count({ where: { userId: decoded.userId } }),
    ]);

    const formatted = await Promise.all(complements.map(async (c) => {
      const pdfUrl = c.pdfUrl && !c.pdfUrl.startsWith('http') ? await getPresignedUrl(c.pdfUrl) : c.pdfUrl;
      const xmlUrl = c.xmlUrl && !c.xmlUrl.startsWith('http') ? await getPresignedUrl(c.xmlUrl) : c.xmlUrl;
      return {
        id: c.id,
        folio: c.folio,
        fecha: c.fecha.toISOString().split('T')[0],
        total: Number(c.total),
        status: c.status,
        rejectionReason: c.rejectionReason,
        approvedAt: c.approvedAt,
        rejectedAt: c.rejectedAt,
        pdfUrl,
        xmlUrl,
        invoiceFolio: c.invoice?.folio,
        invoiceFecha: c.invoice?.fecha?.toISOString().split('T')[0],
        createdAt: c.createdAt,
      };
    }));

    return NextResponse.json(
      { data: formatted, total, page, limit, totalPages: Math.ceil(total / limit) }
    );
  } catch (error) {
    console.error('Error GET payment-complements:', error);
    return NextResponse.json({ message: 'Error al obtener los complementos.' }, { status: 500 });
  }
}

// POST: Subir un nuevo complemento de pago
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    let decoded: any;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET!);
    } catch {
      return NextResponse.json({ message: 'Token inválido.' }, { status: 401 });
    }

    if (decoded.role !== 'SUPPLIER') {
      return NextResponse.json({ message: 'Solo proveedores pueden subir complementos.' }, { status: 403 });
    }

    const formData = await request.formData();
    const invoiceId = formData.get('invoiceId') as string;
    const xmlFile = formData.get('xmlFile') as File | null;
    const pdfFile = formData.get('pdfFile') as File | null;

    if (!invoiceId || !xmlFile) {
      return NextResponse.json({ message: 'El ID de factura y el archivo XML son requeridos.' }, { status: 400 });
    }

    // Verificar que la factura pertenece a este usuario
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, userId: decoded.userId },
    });
    if (!invoice) {
      return NextResponse.json({ message: 'Factura no encontrada.' }, { status: 404 });
    }

    // Parsear XML para extraer folio, fecha y total
    let folio = `COMP-${Date.now()}`;
    let fecha = new Date();
    let total = 0;

    try {
      const xmlText = await xmlFile.text();
      const parsed = await parseStringPromise(xmlText, { explicitArray: false });
      const comprobante = parsed['cfdi:Comprobante'] || parsed['Comprobante'] || {};
      const attrs = comprobante['$'] || comprobante;

      folio = attrs.Folio || attrs.Serie
        ? `${attrs.Serie || ''}${attrs.Folio || ''}`.trim() || folio
        : folio;

      if (attrs.Fecha) {
        fecha = new Date(attrs.Fecha);
      }
      if (attrs.Total) {
        total = parseFloat(attrs.Total) || 0;
      }

      // UUID del timbre fiscal como folio único
      const timbre = comprobante['cfdi:Complemento']?.['tfd:TimbreFiscalDigital']?.['$']
        || comprobante['cfdi:Complemento']?.['TimbreFiscalDigital']?.['$'];
      if (timbre?.UUID) {
        folio = timbre.UUID;
      }
    } catch (xmlErr) {
      console.warn('No se pudo parsear el XML, usando valores por defecto:', xmlErr);
    }

    // Verificar que el folio no esté duplicado en el tenant
    const existingComplement = await prisma.paymentComplement.findFirst({
      where: { tenantId: invoice.tenantId, folio },
    });
    if (existingComplement) {
      return NextResponse.json({ message: 'Este complemento de pago ya fue registrado (folio duplicado).' }, { status: 409 });
    }

    // Subir archivos a S3
    const xmlKey = await uploadFileToS3(xmlFile, `payment-complements/${decoded.userId}/${invoiceId}`);
    let pdfKey: string | null = null;
    if (pdfFile && pdfFile.size > 0) {
      pdfKey = await uploadFileToS3(pdfFile, `payment-complements/${decoded.userId}/${invoiceId}`);
    }

    const complement = await prisma.paymentComplement.create({
      data: {
        folio,
        fecha,
        total,
        xmlUrl: xmlKey,
        pdfUrl: pdfKey,
        userId: decoded.userId,
        invoiceId,
        tenantId: invoice.tenantId,
      },
    });

    return NextResponse.json(complement, { status: 201 });
  } catch (error) {
    console.error('Error POST payment-complements:', error);
    return NextResponse.json({ message: 'Error al subir el complemento.' }, { status: 500 });
  }
}
