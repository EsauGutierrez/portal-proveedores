// app/api/invoices/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { parseStringPromise } from 'xml2js'; // Se añade la importación para leer XML
import { uploadFileToS3, getPresignedUrl } from '../../lib/s3';
const prisma = new PrismaClient();

// Helper para formatear moneda
const formatCurrency = (number: number | string) => {
  const num = typeof number === 'number' ? number : parseFloat(String(number).replace(/,/g, ''));
  if (isNaN(num)) return number;
  return new Intl.NumberFormat('en-US', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

// --- Función GET para obtener las facturas del usuario autenticado ---
export async function GET(request: Request) {
  try {
    // 1. Autenticación y Autorización
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'No autorizado: Token no proporcionado.' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];

    let decodedToken: { userId: string };
    try {
      decodedToken = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    } catch (error) {
      return NextResponse.json({ message: 'No autorizado: Token inválido.' }, { status: 401 });
    }
    const { userId } = decodedToken;

    // 2. Búsqueda en la base de datos
    const invoices = await prisma.invoice.findMany({
      where: { userId: userId },
      include: {
        reception: {
          include: {
            purchaseOrder: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 3. Formateo de datos para el frontend
    const formattedInvoices = await Promise.all(invoices.map(async (invoice) => {
      let pdfPresignedUrl = '';
      let xmlPresignedUrl = '';

      try {
        if (invoice.pdfUrl) {
          pdfPresignedUrl = await getPresignedUrl(invoice.pdfUrl);
        }
        if (invoice.xmlUrl) {
          xmlPresignedUrl = await getPresignedUrl(invoice.xmlUrl);
        }
      } catch (e) {
        console.error("Error generando presigned url para factura", invoice.folio);
      }

      return {
        id: invoice.id,
        folio: invoice.folio,
        fecha: invoice.fecha.toISOString(),
        subsidiaria: invoice.reception.purchaseOrder.subsidiaria,
        subtotal: formatCurrency(invoice.subtotal),
        total: formatCurrency(invoice.total),
        ordenDeCompra: invoice.reception.purchaseOrder.folio,
        recepcion: invoice.reception.folio,
        pdfUrl: pdfPresignedUrl || invoice.pdfUrl,
        xmlUrl: xmlPresignedUrl || invoice.xmlUrl,
      };
    }));

    return NextResponse.json(formattedInvoices, { status: 200 });

  } catch (error) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json({ message: 'Error al obtener las facturas.' }, { status: 500 });
  }
}

// --- Función POST para crear una factura (con validación de XML) ---
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const receptionId = formData.get('receptionId') as string;
    const userId = formData.get('userId') as string;
    const xmlFile = formData.get('xmlFile') as File;
    const pdfFile = formData.get('pdfFile') as File;

    if (!receptionId || !userId || !xmlFile || !pdfFile) {
      return NextResponse.json({ message: 'Faltan datos requeridos.' }, { status: 400 });
    }

    // --- LÓGICA DE VALIDACIÓN DEL XML ---
    const xmlText = await xmlFile.text();
    const xmlData = await parseStringPromise(xmlText, { explicitArray: false, trim: true });

    const comprobante = xmlData['cfdi:Comprobante'];
    if (!comprobante) {
      return NextResponse.json({ message: 'El archivo XML no es un CFDI válido.' }, { status: 400 });
    }

    const emisor = comprobante['cfdi:Emisor'].$;
    const receptor = comprobante['cfdi:Receptor'].$;
    const xmlSubtotal = parseFloat(comprobante.$.SubTotal);
    const xmlTotal = parseFloat(comprobante.$.Total);
    const folioFiscal = comprobante['cfdi:Complemento']['tfd:TimbreFiscalDigital'].$.UUID;

    const userProfile = await prisma.user.findUnique({
      where: { id: userId },
      include: { supplierProfile: { include: { subsidiary: true } } }
    });

    const reception = await prisma.reception.findUnique({
      where: { id: receptionId },
      include: { articles: true }
    });

    if (!userProfile?.supplierProfile || !reception) {
      return NextResponse.json({ message: 'No se encontró el proveedor o la recepción asociada.' }, { status: 404 });
    }

    const supplier = userProfile.supplierProfile;
    const subsidiary = supplier.subsidiary;

    const receptionSubtotal = reception.articles.reduce((sum, article) => sum + parseFloat(article.subtotal as any), 0);
    const receptionTotal = reception.articles.reduce((sum, article) => sum + parseFloat(article.total as any), 0);

    const errors: string[] = [];
    if (emisor.Rfc !== supplier.rfc) {
      errors.push(`El RFC del emisor en el XML (${emisor.Rfc}) no coincide con el del proveedor (${supplier.rfc}).`);
    }
    if (receptor.Rfc !== subsidiary.rfc) {
      errors.push(`El RFC del receptor en el XML (${receptor.Rfc}) no coincide con el de la subsidiaria (${subsidiary.rfc}).`);
    }
    if (emisor.Nombre !== supplier.companyName) {
      errors.push(`La razón social del emisor en el XML no coincide.`);
    }
    if (receptor.Nombre !== subsidiary.businessName) {
      errors.push(`La razón social del receptor en el XML no coincide.`);
    }
    if (Math.abs(xmlSubtotal - receptionSubtotal) > 0.01) {
      errors.push(`El subtotal del XML ($${xmlSubtotal}) no coincide con el de la recepción ($${receptionSubtotal.toFixed(2)}).`);
    }
    if (Math.abs(xmlTotal - receptionTotal) > 0.01) {
      errors.push(`El total del XML ($${xmlTotal}) no coincide con el de la recepción ($${receptionTotal.toFixed(2)}).`);
    }

    if (errors.length > 0) {
      return NextResponse.json({ message: 'El archivo XML contiene errores de validación.', errors }, { status: 400 });
    }
    // --- FIN DE LA LÓGICA DE VALIDACIÓN ---

    // --- SUBIDA A AWS S3 ---
    let pdfUrl = '';
    let xmlUrl = '';

    try {
      // Subimos primero los archivos a S3. 
      // Si fallan, no guardamos el registro inconsistente en la base de datos.
      pdfUrl = await uploadFileToS3(pdfFile, `invoices/${userId}/${receptionId}`);
      xmlUrl = await uploadFileToS3(xmlFile, `invoices/${userId}/${receptionId}`);
    } catch (uploadError) {
      return NextResponse.json({ message: 'Error al subir los archivos a S3.', error: (uploadError as Error).message }, { status: 500 });
    }

    const newInvoice = await prisma.invoice.create({
      data: {
        folio: folioFiscal,
        fecha: new Date(comprobante.$.Fecha),
        subtotal: xmlSubtotal,
        total: xmlTotal,
        pdfUrl: pdfUrl,
        xmlUrl: xmlUrl,
        syncStatus: 'PENDING_SYNC',
        user: { connect: { id: userId } },
        reception: { connect: { id: receptionId } },
      },
    });

    return NextResponse.json({ message: 'Factura validada y recibida correctamente.', invoice: newInvoice }, { status: 201 });

  } catch (error) {
    console.error('Error al procesar la factura:', error);
    return NextResponse.json({ message: 'Error interno al procesar la factura.', error: (error as Error).message }, { status: 500 });
  }
}
