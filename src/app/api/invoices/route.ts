// app/api/invoices/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { parseStringPromise } from 'xml2js'; // Se añade la importación para leer XML
import { uploadFileToS3, getPresignedUrl } from '../../lib/s3';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

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
            purchaseOrder: {
              include: {
                subsidiary: true,
              },
            },
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
        subsidiaria: invoice.reception.purchaseOrder.subsidiary.name,
        subtotal: formatCurrency(invoice.subtotal.toString()),
        total: formatCurrency(invoice.total.toString()),
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

    // --- EXTRACCIÓN BÁSICA DEL XML ---
    const xmlText = await xmlFile.text();
    const xmlData = await parseStringPromise(xmlText, { explicitArray: false, trim: true });

    const comprobante = xmlData['cfdi:Comprobante'];
    if (!comprobante) {
      return NextResponse.json({ message: 'El archivo XML no es un CFDI válido.' }, { status: 400 });
    }

    const xmlSubtotal = parseFloat(comprobante.$.SubTotal) || 0;
    const xmlTotal = parseFloat(comprobante.$.Total) || 0;

    // UUID is required to uniquely identify the invoice document on databases
    let folioFiscal = '';
    try {
      folioFiscal = comprobante['cfdi:Complemento']['tfd:TimbreFiscalDigital'].$.UUID;
    } catch (e) {
      return NextResponse.json({ message: 'No se encontró el UUID (TimbreFiscalDigital) en el XML.' }, { status: 400 });
    }

    // --- SUBIDA A AWS S3 ---
    let pdfUrl = '';
    let xmlUrl = '';
    try {
      pdfUrl = await uploadFileToS3(pdfFile, `invoices/${userId}/${receptionId}`);
      xmlUrl = await uploadFileToS3(xmlFile, `invoices/${userId}/${receptionId}`);
    } catch (uploadError) {
      return NextResponse.json({ message: 'Error al subir los archivos a AWS S3.', error: (uploadError as Error).message }, { status: 500 });
    }

    // --- GUARDADO INICIAL EN BASE DE DATOS COMO PENDING ---
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

    // --- ENVIAR MENSAJE A SQS PARA VALIDACIÓN ASÍNCRONA ---
    const sqsClient = new SQSClient({
      region: process.env.AWS_REGION || 'us-east-2',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
      }
    });

    try {
      await sqsClient.send(new SendMessageCommand({
        QueueUrl: process.env.AWS_SQS_INVOICES_URL,
        MessageBody: JSON.stringify({
          invoiceId: newInvoice.id,
          userId: userId,
          receptionId: receptionId
        })
      }));
      console.log(`Mensaje SQS enviado para la factura: ${newInvoice.id}`);
    } catch (sqsError) {
      console.error('Error enviando mensaje a SQS:', sqsError);
      // We still return 201 because the database was created successfully 
      // We can add a mechanism to retry failed messages later
    }

    return NextResponse.json({
      message: 'Archivos recibidos. La factura será validada en breve.',
      invoice: newInvoice
    }, { status: 201 });

  } catch (error) {
    console.error('Error al procesar la factura:', error);
    return NextResponse.json({ message: 'Error interno al procesar la factura.', error: (error as Error).message }, { status: 500 });
  }
}
