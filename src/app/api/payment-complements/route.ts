// app/api/payment-complements/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';
import jwt from 'jsonwebtoken';
import { parseStringPromise } from 'xml2js';
import { uploadFileToS3, getPresignedUrl } from '../../lib/s3';
import { invokeRestlet, querySuiteQL } from '../../lib/netsuite';

const FALLBACK_SCRIPT_ID = process.env.NETSUITE_SCRIPT_ID || '3878';
const FALLBACK_DEPLOY_ID = process.env.NETSUITE_DEPLOY_ID || '1';

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
    const invoiceId = formData.get('invoiceId') as string | null;
    const xmlFile = formData.get('xmlFile') as File | null;
    const pdfFile = formData.get('pdfFile') as File | null;

    if (!xmlFile) {
      return NextResponse.json({ message: 'El archivo XML es requerido.' }, { status: 400 });
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
    // Para TipoDeComprobante="P" el SAT exige Total="0" en el Comprobante;
    // el monto real está en pago20:Totales/@MontoTotalPagos
    const complementoNode0 = comprobante['cfdi:Complemento'] || comprobante['Complemento'];
    const pagosNode0 = complementoNode0?.['pago20:Pagos'] || complementoNode0?.['pago:Pagos'] || complementoNode0?.['Pagos'];
    const montoTotalPagos = parseFloat(pagosNode0?.['pago20:Totales']?.['$']?.MontoTotalPagos
      || pagosNode0?.['Totales']?.['$']?.MontoTotalPagos
      || '0');
    const total = attrs.TipoDeComprobante === 'P'
      ? montoTotalPagos
      : (parseFloat(attrs.Total) || 0);
    if (total <= 0) {
      return NextResponse.json({ message: `El total del CFDI ($${total}) debe ser mayor a cero.` }, { status: 422 });
    }

    const rfcEmisor = (emisorAttrs.Rfc || '').toUpperCase().replace(/\s/g, '').replace(/-/g, '');
    const rfcReceptor = (receptorAttrs.Rfc || '').toUpperCase().replace(/\s/g, '').replace(/-/g, '');
    if (!rfcEmisor) {
      return NextResponse.json({ message: 'El CFDI no contiene RFC del Emisor.' }, { status: 422 });
    }

    // ── Extraer UUID de la factura relacionada (DoctoRelacionado) ─────────────
    const complementoNode = comprobante['cfdi:Complemento'] || comprobante['Complemento'];
    const pagosNode = complementoNode?.['pago20:Pagos'] || complementoNode?.['pago:Pagos'] || complementoNode?.['Pagos'];
    const pagoNode = pagosNode?.['pago20:Pago'] || pagosNode?.['pago:Pago'] || pagosNode?.['Pago'];
    const pagoArr = Array.isArray(pagoNode) ? pagoNode : pagoNode ? [pagoNode] : [];
    const doctos = pagoArr.flatMap((p: any) => {
      const d = p['pago20:DoctoRelacionado'] || p['pago:DoctoRelacionado'] || p['DoctoRelacionado'];
      return Array.isArray(d) ? d : d ? [d] : [];
    });
    const relatedInvoiceUUID = doctos[0]?.['$']?.IdDocumento as string | undefined;
    const allRelatedUUIDs = new Set(
      doctos.map((d: any) => (d['$']?.IdDocumento || '').toUpperCase()).filter(Boolean)
    );

    // ── Buscar factura: por invoiceId manual o por UUID extraído del XML ──────
    const invoiceQuery = invoiceId
      ? { id: invoiceId, userId: decoded.userId }
      : relatedInvoiceUUID
        ? { folio: relatedInvoiceUUID, userId: decoded.userId }
        : null;

    if (!invoiceQuery) {
      return NextResponse.json(
        { message: 'No se pudo determinar la factura relacionada. Verifica que el XML sea un Complemento de Pago válido con DoctoRelacionado.' },
        { status: 422 }
      );
    }

    const invoice = await prisma.invoice.findFirst({
      where: invoiceQuery,
      include: {
        tenant: { include: { subsidiaries: { select: { rfc: true } } } },
        user: { include: { supplierProfile: { select: { id: true, rfc: true, netsuiteId: true } } } },
      },
    });

    if (!invoice) {
      const uuidBuscado = relatedInvoiceUUID || invoiceId;
      return NextResponse.json(
        { message: `No se encontró una factura registrada con UUID ${uuidBuscado}. Asegúrate de que la factura ya esté cargada en el portal.` },
        { status: 404 }
      );
    }

    // Validar que la factura encontrada esté referenciada en el XML (DoctoRelacionado)
    if (allRelatedUUIDs.size > 0 && !allRelatedUUIDs.has(invoice.folio.toUpperCase())) {
      return NextResponse.json(
        { message: `La factura ${invoice.folio.slice(-8)} no está referenciada en este complemento de pago. Verifica que el XML corresponda a las facturas seleccionadas.` },
        { status: 422 }
      );
    }

    // La factura debe estar sincronizada con NetSuite para poder crear el VendorPayment
    if (invoice.syncStatus !== 'SYNCED' || !invoice.netsuiteId) {
      return NextResponse.json(
        { message: 'La factura aún no está sincronizada con NetSuite. Espera a que el proceso de sync finalice antes de subir el complemento.' },
        { status: 422 }
      );
    }

    // Validar que el complemento no exceda el saldo pendiente de la factura (con tolerancia configurada)
    const existingComplementsAgg = await prisma.paymentComplement.aggregate({
      where: { invoiceId: invoice.id },
      _sum: { total: true },
    });
    const alreadyPaid = Number(existingComplementsAgg._sum.total ?? 0);
    let pendingBalance = Number(invoice.total) - alreadyPaid;

    // Verificar el bill en NetSuite: (a) que aún EXISTA (pudo haberse eliminado en el ERP),
    // y (b) su saldo REAL (foreignamountunpaid), que considera pagos hechos fuera del portal.
    // Best-effort: si NetSuite no responde, se conserva el cálculo local y no se bloquea.
    let billMissingInNetsuite = false;
    try {
      const t: any = invoice.tenant;
      if (t?.netsuiteAccountId && t.netsuiteConsumerKey && t.netsuiteConsumerSec && t.netsuiteTokenId && t.netsuiteTokenSecret) {
        const billId = parseInt(String(invoice.netsuiteId), 10);
        if (!isNaN(billId)) {
          const rows = await querySuiteQL(
            `SELECT id, ABS(foreignamountunpaid) AS unpaid FROM transaction WHERE id = ${billId} AND type = 'VendBill'`,
            { accountId: t.netsuiteAccountId, consumerKey: t.netsuiteConsumerKey, consumerSecret: t.netsuiteConsumerSec, tokenId: t.netsuiteTokenId, tokenSecret: t.netsuiteTokenSecret }
          );
          if (rows && rows.length > 0) {
            if (rows[0].unpaid != null) {
              // Tomar el más conservador: el bill puede estar ya pagado en NetSuite aunque
              // el portal no lo registre, o haber complementos en el portal aún sin sincronizar.
              pendingBalance = Math.min(pendingBalance, Number(rows[0].unpaid));
            }
          } else {
            // La consulta corrió pero el bill no existe → fue eliminado en NetSuite.
            billMissingInNetsuite = true;
          }
        }
      }
    } catch (balanceErr: any) {
      console.warn('[COMPLEMENTO] No se pudo verificar el bill en NetSuite:', balanceErr?.message);
    }

    if (billMissingInNetsuite) {
      // Marcar la factura para que el flujo normal (reenviar/reconciliar) la recupere.
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { syncStatus: 'FAILED', syncError: 'La factura ya no existe en NetSuite (pudo haber sido eliminada). Debe re-registrarse antes de subir su complemento.' },
      });
      return NextResponse.json(
        { message: 'La factura vinculada ya no existe en NetSuite (pudo haber sido eliminada). Re-registra la factura antes de subir el complemento de pago.' },
        { status: 409 }
      );
    }

    const invoiceTolerance = Number(invoice.tenant?.invoiceTolerance ?? 0.5);
    if (total > pendingBalance + invoiceTolerance) {
      return NextResponse.json(
        {
          message: `El total del complemento ($${total.toFixed(2)}) excede el saldo pendiente de la factura ($${pendingBalance.toFixed(2)} MXN). Tolerancia configurada: $${invoiceTolerance.toFixed(2)} MXN.`,
        },
        { status: 422 }
      );
    }

    // RFC del Emisor debe coincidir con el RFC del proveedor registrado
    // Se omite la validación cuando el RFC del proveedor es genérico (XAXX/XEXX)
    const rfcProveedor = (invoice.user?.supplierProfile?.rfc || '').toUpperCase().replace(/\s/g, '').replace(/-/g, '');
    const isGenericSupplier = rfcProveedor.startsWith('XAXX') || rfcProveedor.startsWith('XEXX');
    if (rfcProveedor.startsWith('INVITE')) {
      // RFC temporal de invitación: actualizarlo automáticamente con el RFC del CFDI
      const spId = invoice.user?.supplierProfile?.id;
      if (spId && rfcEmisor) {
        await prisma.supplierProfile.update({
          where: { id: spId },
          data: { rfc: rfcEmisor },
        });
        console.log(`[RFC] Actualizado RFC temporal ${rfcProveedor} → ${rfcEmisor} para complemento de pago`);
      }
    } else if (!isGenericSupplier && rfcEmisor !== rfcProveedor) {
      return NextResponse.json(
        { message: `El RFC del emisor en el CFDI (${rfcEmisor}) no coincide con tu RFC registrado (${rfcProveedor}).` },
        { status: 422 }
      );
    }

    // RFC del Receptor debe coincidir con alguna subsidiaria del tenant
    // Se omite la validación cuando el RFC receptor es genérico (XAXX/XEXX)
    const isGenericRfc = (rfc: string) => rfc.startsWith('XAXX') || rfc.startsWith('XEXX');
    if (rfcReceptor && !isGenericRfc(rfcReceptor)) {
      const rfcsSubsidiarias = (invoice.tenant?.subsidiaries || [])
        .map((s: any) => (s.rfc || '').toUpperCase().replace(/\s/g, '').replace(/-/g, ''))
        .filter((r: string) => r && !isGenericRfc(r));
      if (rfcsSubsidiarias.length > 0 && !rfcsSubsidiarias.includes(rfcReceptor)) {
        return NextResponse.json(
          { message: `El RFC del receptor en el CFDI (${rfcReceptor}) no corresponde a ninguna empresa registrada.` },
          { status: 422 }
        );
      }
    }

    const folio = uuid;
    const fecha = attrs.Fecha ? new Date(attrs.Fecha) : new Date();

    // Verificar folio duplicado (mismo UUID + misma factura)
    const existing = await prisma.paymentComplement.findFirst({
      where: { tenantId: invoice.tenantId, folio, invoiceId: invoice.id },
    });
    if (existing) {
      return NextResponse.json({ message: 'Este complemento de pago ya fue registrado para esta factura (UUID duplicado).' }, { status: 409 });
    }

    // ── Subir archivos a S3 ────────────────────────────────────────────────────
    const xmlKey = await uploadFileToS3(xmlFile, `payment-complements/${decoded.userId}/${invoice.id}`);
    let pdfKey: string | null = null;
    if (pdfFile && pdfFile.size > 0) {
      pdfKey = await uploadFileToS3(pdfFile, `payment-complements/${decoded.userId}/${invoice.id}`);
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
        invoiceId: invoice.id,
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
