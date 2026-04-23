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
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where: { userId: userId },
        include: {
          receptions: {
            include: {
              purchaseOrder: {
                include: { subsidiary: true },
              },
            },
          },
          purchaseOrder: {
            include: { subsidiary: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.invoice.count({ where: { userId: userId } }),
    ]);

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

      let subsidiaryName = 'Desconocida';
      let poFolio = 'N/A';
      let receptionFolio = 'N/A';

      if (invoice.receptions && invoice.receptions.length > 0) {
        receptionFolio = invoice.receptions.map((r: any) => r.folio).join(', ');
        poFolio = invoice.receptions[0].purchaseOrder?.folio || 'N/A';
        subsidiaryName = invoice.receptions[0].purchaseOrder?.subsidiary?.name || 'Desconocida';
      } else if (invoice.purchaseOrder) {
        receptionFolio = (invoice.purchaseOrder as any).isConsignment ? 'Consignación' : 'Varias / Integra';
        poFolio = invoice.purchaseOrder.folio;
        subsidiaryName = invoice.purchaseOrder.subsidiary?.name || 'Desconocida';
      }

      return {
        id: invoice.id,
        folio: invoice.folio,
        fecha: invoice.fecha.toISOString(),
        subsidiaria: subsidiaryName,
        subtotal: formatCurrency(invoice.subtotal.toString()),
        tax: formatCurrency(invoice.tax.toString()),
        total: formatCurrency(invoice.total.toString()),
        ordenDeCompra: poFolio,
        recepcion: receptionFolio,
        syncStatus: invoice.syncStatus,
        pdfUrl: pdfPresignedUrl || invoice.pdfUrl,
        xmlUrl: xmlPresignedUrl || invoice.xmlUrl,
      };
    }));

    return NextResponse.json(
      { data: formattedInvoices, total, page, limit, totalPages: Math.ceil(total / limit) },
      { status: 200 }
    );

  } catch (error) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json({ message: 'Error al obtener las facturas.' }, { status: 500 });
  }
}

// --- Función POST para crear una factura (con validación de XML) ---
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const receptionIdsRaw = formData.get('receptionIds') as string | null; // JSON array string
    const receptionIds: string[] = receptionIdsRaw ? JSON.parse(receptionIdsRaw) : [];
    const purchaseOrderId = formData.get('purchaseOrderId') as string | null;
    const userId = formData.get('userId') as string;
    const xmlFile = formData.get('xmlFile') as File;
    const pdfFile = formData.get('pdfFile') as File;

    if ((!receptionIds.length && !purchaseOrderId) || !userId || !xmlFile || !pdfFile) {
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

    // --- VALIDACIÓN 1: RFC DEL EMISOR VS. PROVEEDOR REGISTRADO ---
    const xmlEmisorRfc: string = comprobante['cfdi:Emisor']?.$.Rfc || '';
    if (!xmlEmisorRfc) {
      return NextResponse.json({ message: 'El XML no contiene el RFC del emisor (cfdi:Emisor).' }, { status: 422 });
    }
    const supplierProfile = await prisma.supplierProfile.findFirst({
      where: { userId },
      select: { rfc: true },
    });
    if (supplierProfile && supplierProfile.rfc.toUpperCase() !== xmlEmisorRfc.toUpperCase()) {
      return NextResponse.json({
        message: `El RFC del emisor en el XML (${xmlEmisorRfc}) no coincide con el RFC registrado del proveedor (${supplierProfile.rfc}).`,
      }, { status: 422 });
    }

    // --- VALIDACIÓN 2: VIGENCIA DEL CERTIFICADO SAT ---
    let fechaTimbrado: Date | null = null;
    let noCertificadoSAT = '';
    try {
      const timbre = comprobante['cfdi:Complemento']['tfd:TimbreFiscalDigital'].$;
      fechaTimbrado = timbre.FechaTimbrado ? new Date(timbre.FechaTimbrado) : null;
      noCertificadoSAT = timbre.NoCertificadoSAT || '';
    } catch (_) { /* complemento ya fue validado arriba */ }

    if (!noCertificadoSAT) {
      return NextResponse.json({ message: 'El CFDI no contiene número de certificado SAT (NoCertificadoSAT).' }, { status: 422 });
    }
    if (!fechaTimbrado || isNaN(fechaTimbrado.getTime())) {
      return NextResponse.json({ message: 'El CFDI no contiene una FechaTimbrado válida.' }, { status: 422 });
    }
    const fechaComprobante = new Date(comprobante.$.Fecha);
    const diffHours = (fechaTimbrado.getTime() - fechaComprobante.getTime()) / 3_600_000;
    if (diffHours < 0) {
      return NextResponse.json({
        message: `La FechaTimbrado (${fechaTimbrado.toISOString()}) es anterior a la Fecha del comprobante. El CFDI no es válido.`,
      }, { status: 422 });
    }
    if (diffHours > 72) {
      return NextResponse.json({
        message: `El CFDI fue timbrado ${Math.round(diffHours)} horas después de su emisión. El SAT permite máximo 72 horas.`,
      }, { status: 422 });
    }
    if (fechaTimbrado > new Date()) {
      return NextResponse.json({ message: 'La FechaTimbrado del CFDI está en el futuro.' }, { status: 422 });
    }
    const certAgeYears = (Date.now() - fechaTimbrado.getTime()) / (365 * 24 * 3_600_000);
    if (certAgeYears > 4) {
      return NextResponse.json({
        message: `El certificado SAT (${noCertificadoSAT}) tiene más de 4 años de antigüedad y ya no es vigente.`,
      }, { status: 422 });
    }

    // --- VALIDACIÓN 3: DESGLOSE DE IVA POR CONCEPTO ---
    let xmlTax = 0;
    try {
      const impuestosGlobal = comprobante['cfdi:Impuestos'];
      if (impuestosGlobal) {
        const totalImpuestosTrasladados = parseFloat(impuestosGlobal.$.TotalImpuestosTrasladados || '0') || 0;
        xmlTax = totalImpuestosTrasladados;

        // 3a. SubTotal + IVA total debe igualar el Total declarado
        const calculatedTotal = xmlSubtotal + totalImpuestosTrasladados;
        if (Math.abs(calculatedTotal - xmlTotal) > 0.5) {
          return NextResponse.json({
            message: `El desglose de impuestos no cuadra: SubTotal ($${xmlSubtotal.toFixed(2)}) + IVA ($${totalImpuestosTrasladados.toFixed(2)}) = $${calculatedTotal.toFixed(2)}, pero el Total declarado es $${xmlTotal.toFixed(2)}.`,
          }, { status: 422 });
        }

        // 3b. Suma del IVA por concepto debe coincidir con TotalImpuestosTrasladados
        const conceptos = comprobante['cfdi:Conceptos']?.['cfdi:Concepto'];
        if (conceptos) {
          const conceptosArray = Array.isArray(conceptos) ? conceptos : [conceptos];
          let ivaConceptosSum = 0;
          for (const concepto of conceptosArray) {
            const traslados = concepto['cfdi:Impuestos']?.['cfdi:Traslados']?.['cfdi:Traslado'];
            if (traslados) {
              const trasladosArray = Array.isArray(traslados) ? traslados : [traslados];
              for (const t of trasladosArray) {
                if (t.$.Impuesto === '002') { // 002 = IVA en catálogo SAT
                  ivaConceptosSum += parseFloat(t.$.Importe || '0') || 0;
                }
              }
            }
          }
          if (Math.abs(ivaConceptosSum - totalImpuestosTrasladados) > 0.5) {
            return NextResponse.json({
              message: `La suma del IVA por concepto ($${ivaConceptosSum.toFixed(2)}) no coincide con el TotalImpuestosTrasladados ($${totalImpuestosTrasladados.toFixed(2)}).`,
            }, { status: 422 });
          }
        }
      }
    } catch (ivaError) {
      // Facturas exentas (tasa 0 o sin impuestos) son válidas; solo omitimos la validación de IVA
      console.log('[Invoices] CFDI sin sección de impuestos trasladados, se omite validación de IVA.');
    }

    // --- SUBIDA A AWS S3 ---
    let pdfUrl = '';
    let xmlUrl = '';
    try {
      const folderId = receptionIds[0] || purchaseOrderId;
      pdfUrl = await uploadFileToS3(pdfFile, `invoices/${userId}/${folderId}`);
      xmlUrl = await uploadFileToS3(xmlFile, `invoices/${userId}/${folderId}`);
    } catch (uploadError) {
      return NextResponse.json({ message: 'Error al subir los archivos a AWS S3.', error: (uploadError as Error).message }, { status: 500 });
    }

    // --- OBTENER EL TENANT ID ---
    let tenantIdStr = '';
    if (receptionIds.length) {
      const receptionContext = await prisma.reception.findUnique({
        where: { id: receptionIds[0] },
        select: { tenantId: true }
      });
      if (!receptionContext) {
        return NextResponse.json({ message: 'La recepción asociada no existe.' }, { status: 404 });
      }
      tenantIdStr = receptionContext.tenantId;
    } else if (purchaseOrderId) {
      const poContext = await prisma.purchaseOrder.findUnique({
        where: { id: purchaseOrderId },
        select: { tenantId: true }
      });
      if (!poContext) {
        return NextResponse.json({ message: 'La orden de compra asociada no existe.' }, { status: 404 });
      }
      tenantIdStr = poContext.tenantId;
    }

    // --- VALIDACIÓN DE SALDO PARA OC DE CONSIGNACIÓN ---
    if (purchaseOrderId) {
      const poForValidation = await (prisma.purchaseOrder as any).findUnique({
        where: { id: purchaseOrderId },
        select: {
          isConsignment: true,
          total: true,
          invoices: {
            where: { syncStatus: { not: 'FAILED' } },
            select: { total: true },
          },
        },
      });
      if (poForValidation?.isConsignment) {
        const alreadyInvoiced: number = (poForValidation.invoices as any[]).reduce(
          (sum: number, inv: any) => sum + Number(inv.total), 0
        );
        const saldoDisponible = Number(poForValidation.total) - alreadyInvoiced;
        if (xmlTotal > saldoDisponible + 0.01) {
          return NextResponse.json({
            message: `El total de la factura ($${xmlTotal.toFixed(2)}) excede el saldo disponible de la OC ($${saldoDisponible.toFixed(2)}).`,
          }, { status: 422 });
        }
      }
    }

    // --- GUARDADO INICIAL EN BASE DE DATOS COMO PENDING ---
    const newInvoice = await prisma.invoice.create({
      data: {
        folio: folioFiscal,
        fecha: new Date(comprobante.$.Fecha),
        subtotal: xmlSubtotal,
        tax: xmlTax,
        total: xmlTotal,
        pdfUrl: pdfUrl,
        xmlUrl: xmlUrl,
        syncStatus: 'PENDING_SYNC',
        tenant: { connect: { id: tenantIdStr } },
        user: { connect: { id: userId } },
        ...(purchaseOrderId ? { purchaseOrder: { connect: { id: purchaseOrderId } } } : {}),
        ...(receptionIds.length ? { receptions: { connect: receptionIds.map(id => ({ id })) } } : {}),
      } as any,
    });

    // --- ENVIAR MENSAJE A SQS PARA VALIDACIÓN ASÍNCRONA ---
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
          invoiceId: newInvoice.id,
          userId: userId,
          receptionIds: receptionIds,
          purchaseOrderId: purchaseOrderId || null
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
