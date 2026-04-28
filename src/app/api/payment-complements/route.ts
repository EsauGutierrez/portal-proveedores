// app/api/payment-complements/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { parseStringPromise } from 'xml2js';
import { uploadFileToS3, getPresignedUrl } from '../../lib/s3';
import { invokeRestlet } from '../../lib/netsuite';

const FALLBACK_SCRIPT_ID = process.env.NETSUITE_SCRIPT_ID || '3878';
const FALLBACK_DEPLOY_ID = process.env.NETSUITE_DEPLOY_ID || '1';

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
        netsuiteSyncStatus: c.netsuiteSyncStatus,
        netsuiteSyncError: c.netsuiteSyncError,
        netsuitePaymentId: c.netsuitePaymentId,
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

// POST: Subir un nuevo complemento de pago con validación fiscal y sync automático a NetSuite
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

    // Cargar factura con datos del proveedor y tenant para validación y sync
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, userId: decoded.userId },
      include: {
        tenant: {
          include: {
            subsidiaries: { select: { rfc: true } },
          },
        },
        user: {
          include: {
            supplierProfile: { select: { rfc: true, netsuiteId: true } },
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json({ message: 'Factura no encontrada.' }, { status: 404 });
    }

    // La factura debe estar sincronizada con NetSuite para poder crear el VendorPayment
    if (invoice.syncStatus !== 'SYNCED' || !invoice.netsuiteId) {
      return NextResponse.json(
        { message: 'La factura aún no está sincronizada con NetSuite. Espera a que el proceso de sync finalice antes de subir el complemento.' },
        { status: 422 }
      );
    }

    // ── Validación fiscal del CFDI ─────────────────────────────────────────────
    let xmlText: string;
    try {
      xmlText = await xmlFile.text();
    } catch {
      return NextResponse.json({ message: 'No se pudo leer el archivo XML.' }, { status: 400 });
    }

    let parsed: any;
    try {
      parsed = await parseStringPromise(xmlText, { explicitArray: false });
    } catch {
      return NextResponse.json({ message: 'El archivo XML no tiene un formato CFDI válido.' }, { status: 422 });
    }

    const comprobante = parsed['cfdi:Comprobante'] || parsed['Comprobante'];
    if (!comprobante) {
      return NextResponse.json({ message: 'El XML no es un CFDI válido (falta nodo Comprobante).' }, { status: 422 });
    }

    const attrs = comprobante['$'] || {};
    const emisorAttrs = (comprobante['cfdi:Emisor'] || comprobante['Emisor'] || {})['$'] || {};
    const receptorAttrs = (comprobante['cfdi:Receptor'] || comprobante['Receptor'] || {})['$'] || {};

    // UUID del Timbre Fiscal Digital (identificador único del CFDI)
    const timbre = comprobante['cfdi:Complemento']?.['tfd:TimbreFiscalDigital']?.['$']
      || comprobante['cfdi:Complemento']?.['TimbreFiscalDigital']?.['$'];
    const uuid = timbre?.UUID;
    if (!uuid) {
      return NextResponse.json({ message: 'El CFDI no tiene Timbre Fiscal Digital (UUID). Solo se aceptan CFDIs timbrados.' }, { status: 422 });
    }

    // Total del complemento
    const total = parseFloat(attrs.Total) || 0;
    if (total <= 0) {
      return NextResponse.json({ message: `El total del CFDI ($${total}) debe ser mayor a cero.` }, { status: 422 });
    }

    // RFC del Emisor debe coincidir con el RFC del proveedor registrado
    const rfcEmisor = (emisorAttrs.Rfc || '').toUpperCase().replace(/\s/g, '').replace(/-/g, '');
    const rfcProveedor = (invoice.user?.supplierProfile?.rfc || '').toUpperCase().replace(/\s/g, '').replace(/-/g, '');
    if (!rfcEmisor) {
      return NextResponse.json({ message: 'El CFDI no contiene RFC del Emisor.' }, { status: 422 });
    }
    if (rfcEmisor !== rfcProveedor) {
      return NextResponse.json(
        { message: `El RFC del emisor en el CFDI (${rfcEmisor}) no coincide con tu RFC registrado (${rfcProveedor}).` },
        { status: 422 }
      );
    }

    // RFC del Receptor debe coincidir con alguna subsidiaria del tenant
    const rfcReceptor = (receptorAttrs.Rfc || '').toUpperCase().replace(/\s/g, '').replace(/-/g, '');
    if (rfcReceptor) {
      const rfcsSubsidiarias = (invoice.tenant?.subsidiaries || [])
        .map((s: any) => (s.rfc || '').toUpperCase().replace(/\s/g, '').replace(/-/g, ''))
        .filter(Boolean);
      if (rfcsSubsidiarias.length > 0 && !rfcsSubsidiarias.includes(rfcReceptor)) {
        return NextResponse.json(
          { message: `El RFC del receptor en el CFDI (${rfcReceptor}) no corresponde a ninguna empresa registrada.` },
          { status: 422 }
        );
      }
    }

    const folio = uuid;
    const fecha = attrs.Fecha ? new Date(attrs.Fecha) : new Date();

    // Verificar folio duplicado
    const existing = await prisma.paymentComplement.findFirst({
      where: { tenantId: invoice.tenantId, folio },
    });
    if (existing) {
      return NextResponse.json({ message: 'Este complemento de pago ya fue registrado (UUID duplicado).' }, { status: 409 });
    }

    // ── Subir archivos a S3 ────────────────────────────────────────────────────
    const xmlKey = await uploadFileToS3(xmlFile, `payment-complements/${decoded.userId}/${invoiceId}`);
    let pdfKey: string | null = null;
    if (pdfFile && pdfFile.size > 0) {
      pdfKey = await uploadFileToS3(pdfFile, `payment-complements/${decoded.userId}/${invoiceId}`);
    }

    // ── Guardar en BD ─────────────────────────────────────────────────────────
    const complement = await prisma.paymentComplement.create({
      data: {
        folio,
        fecha,
        total,
        xmlUrl: xmlKey,
        pdfUrl: pdfKey,
        status: 'APPROVED',
        approvedAt: new Date(),
        userId: decoded.userId,
        invoiceId,
        tenantId: invoice.tenantId,
        netsuiteSyncStatus: 'PENDING_SYNC',
      },
    });

    // ── Sincronización a NetSuite ──────────────────────────────────────────────
    const vendorNsId  = invoice.user?.supplierProfile?.netsuiteId;
    const vendorBillNsId = invoice.netsuiteId;
    const tenant = invoice.tenant;

    if (vendorNsId && tenant?.netsuiteAccountId) {
      const nsCreds = {
        accountId:      tenant.netsuiteAccountId,
        consumerKey:    tenant.netsuiteConsumerKey!,
        consumerSecret: tenant.netsuiteConsumerSec!,
        tokenId:        tenant.netsuiteTokenId!,
        tokenSecret:    tenant.netsuiteTokenSecret!,
      };

      let complementXmlUrl = '';
      let complementPdfUrl = '';
      try {
        complementXmlUrl = await getPresignedUrl(xmlKey);
        if (pdfKey) complementPdfUrl = await getPresignedUrl(pdfKey);
      } catch {}

      try {
        const scriptId = tenant.netsuiteScriptId || FALLBACK_SCRIPT_ID;
        const deployId = tenant.netsuiteDeployId || FALLBACK_DEPLOY_ID;
        const nsResponse = await invokeRestlet(scriptId, deployId, nsCreds, 'POST', {
          action:            'createVendorPayment',
          vendorNetsuiteId:  vendorNsId,
          vendorBillId:      vendorBillNsId,
          amount:            total.toString(),
          trandate:          fecha.toISOString(),
          uuidComplemento:   folio,
          complementoXMLUrl: complementXmlUrl,
          complementoPDFUrl: complementPdfUrl,
        });

        if (nsResponse?.success) {
          await prisma.paymentComplement.update({
            where: { id: complement.id },
            data: {
              netsuiteSyncStatus: 'SYNCED',
              netsuitePaymentId:  String(nsResponse.vendorPaymentId),
              netsuiteSyncError:  null,
            },
          });
          return NextResponse.json({ ...complement, netsuiteSyncStatus: 'SYNCED', netsuitePaymentId: nsResponse.vendorPaymentId }, { status: 201 });
        } else {
          const errMsg = nsResponse?.error || 'Respuesta inesperada de NetSuite';
          await prisma.paymentComplement.update({
            where: { id: complement.id },
            data: { netsuiteSyncStatus: 'FAILED', netsuiteSyncError: errMsg.substring(0, 255) },
          });
          return NextResponse.json(
            { ...complement, netsuiteSyncStatus: 'FAILED', message: `Complemento registrado pero falló la sincronización con NetSuite: ${errMsg}` },
            { status: 201 }
          );
        }
      } catch (nsError: any) {
        await prisma.paymentComplement.update({
          where: { id: complement.id },
          data: { netsuiteSyncStatus: 'FAILED', netsuiteSyncError: nsError.message?.substring(0, 255) },
        });
        return NextResponse.json(
          { ...complement, netsuiteSyncStatus: 'FAILED', message: `Complemento registrado pero falló la sincronización con NetSuite: ${nsError.message}` },
          { status: 201 }
        );
      }
    } else {
      // Sin credenciales NS configuradas — quedar en PENDING_SYNC para retry posterior
      console.warn(`[PaymentComplement] Sin credenciales NS para tenant ${invoice.tenantId}. vendorNsId=${vendorNsId}`);
      return NextResponse.json(complement, { status: 201 });
    }
  } catch (error) {
    console.error('Error POST payment-complements:', error);
    return NextResponse.json({ message: 'Error al subir el complemento.' }, { status: 500 });
  }
}
