// lib/processBulkPaymentComplements.ts
import AdmZip from 'adm-zip';
import { parseStringPromise } from 'xml2js';
import { PrismaClient } from '@prisma/client';
import { downloadFileFromS3, uploadBufferToS3, getPresignedUrl } from './s3';
import { querySuiteQL, invokeRestlet, NetSuiteCredentials } from './netsuite';

const prisma = new PrismaClient();

const FALLBACK_SCRIPT_ID = process.env.NETSUITE_SCRIPT_ID || '3878';
const FALLBACK_DEPLOY_ID = process.env.NETSUITE_DEPLOY_ID || '1';

export interface BulkFileResult {
  filename: string;
  complementUUID: string | null;
  invoiceUUID: string | null;
  status: 'success' | 'error';
  error?: string;
  netsuiteSyncStatus?: string;
  netsuitePaymentId?: string;
  paymentComplementId?: string;
}

function toArray<T>(val: T | T[] | undefined): T[] {
  if (val === undefined || val === null) return [];
  return Array.isArray(val) ? val : [val];
}

const isGenericRfc = (rfc: string) => rfc.startsWith('XAXX') || rfc.startsWith('XEXX');

interface ParsedCfdi {
  complementUUID: string | null;
  invoiceUUIDs: string[];
  rfcEmisor: string;
  rfcReceptor: string;
  total: number;
  fecha: Date;
}

async function parseCfdiPago(xmlText: string): Promise<ParsedCfdi | null> {
  let parsed: any;
  try {
    parsed = await parseStringPromise(xmlText, { explicitArray: false });
  } catch {
    return null;
  }

  const comprobante = parsed['cfdi:Comprobante'] || parsed['Comprobante'];
  if (!comprobante) return null;

  const attrs = comprobante['$'] || {};
  const emisorAttrs = (comprobante['cfdi:Emisor'] || comprobante['Emisor'] || {})['$'] || {};
  const receptorAttrs = (comprobante['cfdi:Receptor'] || comprobante['Receptor'] || {})['$'] || {};

  // UUID del complemento (Timbre Fiscal Digital)
  const timbre = comprobante['cfdi:Complemento']?.['tfd:TimbreFiscalDigital']?.['$']
    || comprobante['cfdi:Complemento']?.['TimbreFiscalDigital']?.['$'];
  const complementUUID = timbre?.UUID || null;

  // Nodo Pagos (pago10 = CFDI 3.3, pago20 = CFDI 4.0)
  const complemento = comprobante['cfdi:Complemento'] || {};
  const pagosNode = complemento['pago10:Pagos'] || complemento['pago20:Pagos'] || complemento['Pagos'];

  // Todos los nodos Pago (puede haber más de uno)
  const pagoRaw = pagosNode?.['pago10:Pago'] || pagosNode?.['pago20:Pago'] || pagosNode?.['Pago'];
  const pagoArr = toArray(pagoRaw);
  const pagoAttrs = pagoArr[0]?.['$'] || {};

  // Todos los UUID de facturas relacionadas (todos los DoctoRelacionado de todos los Pago)
  const doctos = pagoArr.flatMap((p: any) => {
    const d = p['pago10:DoctoRelacionado'] || p['pago20:DoctoRelacionado'] || p['DoctoRelacionado'];
    return toArray(d);
  });
  const invoiceUUIDs = doctos
    .map((d: any) => (d?.['$']?.IdDocumento || '').toUpperCase())
    .filter(Boolean);

  // Total: para TipoDeComprobante="P" el SAT requiere Total="0"; el monto real está en MontoTotalPagos
  const montoTotalPagos = parseFloat(
    pagosNode?.['pago20:Totales']?.['$']?.MontoTotalPagos
    || pagosNode?.['pago10:Totales']?.['$']?.MontoTotalPagos
    || pagosNode?.['Totales']?.['$']?.MontoTotalPagos
    || '0'
  );
  const monto = attrs.TipoDeComprobante === 'P'
    ? montoTotalPagos
    : (parseFloat(pagoAttrs.Monto) || parseFloat(attrs.Total) || 0);

  // Fecha: preferir FechaPago del primer Pago; fallback a Fecha del Comprobante
  const fechaStr = pagoAttrs.FechaPago || attrs.Fecha;
  const fecha = fechaStr ? new Date(fechaStr) : new Date();

  return {
    complementUUID,
    invoiceUUIDs,
    rfcEmisor: (emisorAttrs.Rfc || '').toUpperCase().replace(/[\s-]/g, ''),
    rfcReceptor: (receptorAttrs.Rfc || '').toUpperCase().replace(/[\s-]/g, ''),
    total: monto,
    fecha,
  };
}

export async function processBulkPaymentComplements(
  bulkLogId: string,
  s3ZipKey: string,
  userId: string,
  tenantId: string
): Promise<void> {
  await prisma.bulkPaymentComplementLog.update({
    where: { id: bulkLogId },
    data: { status: 'PROCESSING' },
  });

  const results: BulkFileResult[] = [];

  try {
    // Descargar ZIP de S3
    const zipBuffer = await downloadFileFromS3(s3ZipKey);
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();

    // Agrupar archivos por nombre base (sin extensión)
    const fileMap = new Map<string, { xml?: Buffer; pdf?: Buffer; xmlName?: string; pdfName?: string }>();
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const entryName = entry.entryName;
      if (entryName.startsWith('__MACOSX/') || entryName.includes('/.')) continue;
      const name = entryName.replace(/^.*[\\/]/, '');
      if (name.startsWith('._') || name === '.DS_Store' || name.startsWith('.')) continue;

      const ext = name.split('.').pop()?.toLowerCase();
      const base = name.replace(/\.[^.]+$/, '');
      if (!fileMap.has(base)) fileMap.set(base, {});
      const group = fileMap.get(base)!;
      if (ext === 'xml') {
        group.xml = entry.getData();
        group.xmlName = name;
      } else if (ext === 'pdf') {
        group.pdf = entry.getData();
        group.pdfName = name;
      }
    }

    const xmlGroups = [...fileMap.entries()].filter(([, g]) => g.xml);

    await prisma.bulkPaymentComplementLog.update({
      where: { id: bulkLogId },
      data: { totalFiles: xmlGroups.length },
    });

    if (xmlGroups.length === 0) {
      await prisma.bulkPaymentComplementLog.update({
        where: { id: bulkLogId },
        data: { status: 'FAILED', results: [] },
      });
      return;
    }

    // Cargar datos del tenant y proveedor
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        supplierProfile: { select: { rfc: true, netsuiteId: true } },
        tenant: {
          include: { subsidiaries: { select: { rfc: true } } },
        },
      },
    });

    if (!user?.supplierProfile || !user.tenant) {
      await prisma.bulkPaymentComplementLog.update({
        where: { id: bulkLogId },
        data: {
          status: 'FAILED',
          results: [{ filename: '—', complementUUID: null, invoiceUUID: null, status: 'error', error: 'Perfil de proveedor o tenant no encontrado.' }],
        },
      });
      return;
    }

    const rfcProveedor = user.supplierProfile.rfc.toUpperCase().replace(/[\s-]/g, '');
    const rfcsSubsidiarias = user.tenant.subsidiaries
      .map((s: any) => (s.rfc || '').toUpperCase().replace(/[\s-]/g, ''))
      .filter((r: string) => r && !isGenericRfc(r));

    const nsCreds: NetSuiteCredentials | null = user.tenant.netsuiteAccountId ? {
      accountId: user.tenant.netsuiteAccountId,
      consumerKey: user.tenant.netsuiteConsumerKey!,
      consumerSecret: user.tenant.netsuiteConsumerSec!,
      tokenId: user.tenant.netsuiteTokenId!,
      tokenSecret: user.tenant.netsuiteTokenSecret!,
    } : null;

    const scriptId = (user.tenant as any).netsuiteScriptId || FALLBACK_SCRIPT_ID;
    const deployId = (user.tenant as any).netsuiteDeployId || FALLBACK_DEPLOY_ID;

    // ── Fase 1: Parsear XMLs y resolver facturas ──────────────────────────────
    interface ParsedItem {
      base: string;
      group: { xml?: Buffer; pdf?: Buffer; xmlName?: string; pdfName?: string };
      cfdi: ParsedCfdi;
      invoices: any[];
    }

    const parsedItems: ParsedItem[] = [];

    for (const [base, group] of xmlGroups) {
      const filename = group.xmlName || base + '.xml';
      const xmlText = group.xml!.toString('utf-8');
      const cfdi = await parseCfdiPago(xmlText);

      if (!cfdi) {
        results.push({ filename, complementUUID: null, invoiceUUID: null, status: 'error', error: 'XML inválido o no es un CFDI.' });
        continue;
      }
      if (!cfdi.complementUUID) {
        results.push({ filename, complementUUID: null, invoiceUUID: null, status: 'error', error: 'El CFDI no tiene Timbre Fiscal Digital (UUID).' });
        continue;
      }
      if (cfdi.invoiceUUIDs.length === 0) {
        results.push({ filename, complementUUID: cfdi.complementUUID, invoiceUUID: null, status: 'error', error: 'No se encontró IdDocumento (UUID de factura relacionada) en el XML.' });
        continue;
      }
      if (cfdi.total <= 0) {
        results.push({ filename, complementUUID: cfdi.complementUUID, invoiceUUID: null, status: 'error', error: `El monto del pago ($${cfdi.total}) debe ser mayor a cero.` });
        continue;
      }

      // Buscar TODAS las facturas referenciadas en el XML
      const invoices = await prisma.invoice.findMany({
        where: { tenantId, folio: { in: cfdi.invoiceUUIDs } },
        include: {
          user: { include: { supplierProfile: { select: { rfc: true, netsuiteId: true } } } },
        },
      });

      // Reportar UUIDs no encontrados en el sistema
      const foundUUIDs = new Set(invoices.map((inv: any) => (inv.folio || '').toUpperCase()));
      for (const uuid of cfdi.invoiceUUIDs) {
        if (!foundUUIDs.has(uuid)) {
          results.push({ filename, complementUUID: cfdi.complementUUID, invoiceUUID: uuid, status: 'error', error: `Factura con UUID ${uuid} no encontrada en el sistema.` });
        }
      }

      if (invoices.length > 0) {
        parsedItems.push({ base, group, cfdi, invoices });
      }
    }

    // ── Fase 2: Validaciones por factura ──────────────────────────────────────
    // Un ValidItem = un par (XML, factura) que pasó todas las validaciones
    interface ValidItem {
      base: string;
      group: { xml?: Buffer; pdf?: Buffer; xmlName?: string; pdfName?: string };
      cfdi: ParsedCfdi;
      invoice: NonNullable<any>;
    }
    const validItems: ValidItem[] = [];

    for (const item of parsedItems) {
      const filename = item.group.xmlName || item.base + '.xml';
      const { cfdi } = item;

      for (const invoice of item.invoices) {
        const invoiceUUID = (invoice.folio || '').toUpperCase();

        if (invoice.syncStatus !== 'SYNCED' || !invoice.netsuiteId) {
          results.push({ filename, complementUUID: cfdi.complementUUID, invoiceUUID, status: 'error', error: 'La factura aún no está sincronizada con NetSuite.' });
          continue;
        }

        // Validar RFC Emisor — bypass para RFC genérico (XAXX/XEXX)
        const rfcEmisorInvoice = (invoice.user?.supplierProfile?.rfc || '').toUpperCase().replace(/[\s-]/g, '');
        if (!isGenericRfc(rfcProveedor) && !isGenericRfc(rfcEmisorInvoice)) {
          if (cfdi.rfcEmisor !== rfcProveedor || cfdi.rfcEmisor !== rfcEmisorInvoice) {
            results.push({ filename, complementUUID: cfdi.complementUUID, invoiceUUID, status: 'error', error: `RFC emisor (${cfdi.rfcEmisor}) no coincide con el proveedor de la factura (${rfcEmisorInvoice}).` });
            continue;
          }
        }

        // Validar RFC Receptor — bypass para RFC genérico (XAXX/XEXX)
        if (cfdi.rfcReceptor && !isGenericRfc(cfdi.rfcReceptor) && rfcsSubsidiarias.length > 0 && !rfcsSubsidiarias.includes(cfdi.rfcReceptor)) {
          results.push({ filename, complementUUID: cfdi.complementUUID, invoiceUUID, status: 'error', error: `RFC receptor (${cfdi.rfcReceptor}) no corresponde a ninguna empresa registrada.` });
          continue;
        }

        // Validar que el complemento no exceda el saldo pendiente de la factura (con tolerancia configurada)
        const existingAgg = await prisma.paymentComplement.aggregate({
          where: { invoiceId: invoice.id },
          _sum: { total: true },
        });
        const alreadyPaid = Number(existingAgg._sum.total ?? 0);
        const pendingBalance = Number(invoice.total) - alreadyPaid;
        const invoiceTolerance = Number((user.tenant as any).invoiceTolerance ?? 0.5);
        if (cfdi.total > pendingBalance + invoiceTolerance) {
          results.push({
            filename,
            complementUUID: cfdi.complementUUID,
            invoiceUUID,
            status: 'error',
            error: `El total del complemento ($${cfdi.total.toFixed(2)}) excede el saldo pendiente de la factura ($${pendingBalance.toFixed(2)} MXN). Tolerancia: $${invoiceTolerance.toFixed(2)} MXN.`,
          });
          continue;
        }

        // Verificar duplicado por (folio + invoiceId) — mismo UUID puede existir para distintas facturas
        const existing = await prisma.paymentComplement.findFirst({
          where: { tenantId, folio: cfdi.complementUUID!, invoiceId: invoice.id },
        });
        if (existing) {
          results.push({ filename, complementUUID: cfdi.complementUUID, invoiceUUID, status: 'error', error: 'Este complemento ya fue registrado para esta factura (UUID duplicado).' });
          continue;
        }

        validItems.push({ base: item.base, group: item.group, cfdi, invoice });
      }
    }

    // ── Fase 3: Verificación batch en NetSuite ────────────────────────────────
    const nsValidIds = new Set<string>();
    let nsVerifyError: string | null = null;
    if (nsCreds && validItems.length > 0) {
      const nsIds = [...new Set(validItems.map(i => i.invoice.netsuiteId).filter(Boolean))];
      const BATCH_SIZE = 100;
      for (let i = 0; i < nsIds.length; i += BATCH_SIZE) {
        const batch = nsIds.slice(i, i + BATCH_SIZE);
        const numericIds = batch.map(id => parseInt(id!, 10)).filter(n => !isNaN(n));
        if (numericIds.length === 0) continue;
        try {
          const inClause = numericIds.join(', ');
          console.log(`[BulkWorker] SuiteQL verify: SELECT id FROM transaction WHERE id IN (${inClause})`);
          const nsResult = await querySuiteQL(
            `SELECT id FROM transaction WHERE id IN (${inClause})`,
            nsCreds
          );
          console.log(`[BulkWorker] SuiteQL respuesta:`, JSON.stringify(nsResult));
          (Array.isArray(nsResult) ? nsResult : []).forEach((r: any) => nsValidIds.add(String(r.id)));
        } catch (err: any) {
          nsVerifyError = err?.message || String(err);
          console.error('[BulkWorker] Error en batch SuiteQL:', nsVerifyError);
        }
      }
    }

    // ── Fase 4: Crear complementos y sincronizar ──────────────────────────────
    await Promise.allSettled(
      validItems.map(async (item) => {
        const filename = item.group.xmlName || item.base + '.xml';
        const { cfdi, invoice } = item;
        const invoiceUUID = (invoice.folio || '').toUpperCase();

        // Verificar que el VendorBill existe en NetSuite
        if (nsCreds && !nsValidIds.has(invoice.netsuiteId)) {
          const detail = nsVerifyError
            ? `Error al consultar NetSuite: ${nsVerifyError}`
            : `VendorBill ID ${invoice.netsuiteId} no encontrado en NetSuite.`;
          results.push({ filename, complementUUID: cfdi.complementUUID, invoiceUUID, status: 'error', error: detail });
          return;
        }

        // Subir XML a S3
        const xmlKey = await uploadBufferToS3(
          item.group.xml!,
          `payment-complements/bulk/${userId}/${invoice.id}/${Date.now()}-${item.group.xmlName || item.base + '.xml'}`,
          'application/xml'
        );

        // Subir PDF si existe
        let pdfKey: string | null = null;
        if (item.group.pdf) {
          pdfKey = await uploadBufferToS3(
            item.group.pdf,
            `payment-complements/bulk/${userId}/${invoice.id}/${Date.now()}-${item.group.pdfName || item.base + '.pdf'}`,
            'application/pdf'
          );
        }

        // Sin credenciales NetSuite: crear complemento pendiente de sync
        if (!nsCreds) {
          const complement = await prisma.paymentComplement.create({
            data: {
              folio: cfdi.complementUUID!,
              fecha: cfdi.fecha,
              total: cfdi.total,
              xmlUrl: xmlKey,
              pdfUrl: pdfKey,
              status: 'APPROVED',
              approvedAt: new Date(),
              userId,
              invoiceId: invoice.id,
              tenantId,
              netsuiteSyncStatus: 'PENDING_SYNC',
            },
          });
          results.push({ filename, complementUUID: cfdi.complementUUID, invoiceUUID, status: 'success', netsuiteSyncStatus: 'PENDING_SYNC', paymentComplementId: complement.id });
          return;
        }

        // Sincronizar con NetSuite ANTES de crear registro local
        try {
          let xmlUrl = '';
          let pdfUrl = '';
          try {
            xmlUrl = await getPresignedUrl(xmlKey);
            if (pdfKey) pdfUrl = await getPresignedUrl(pdfKey);
          } catch { /* presigned URL no crítica */ }

          const vendorNsId = invoice.user?.supplierProfile?.netsuiteId;
          const nsResponse = await invokeRestlet(scriptId, deployId, nsCreds, 'POST', {
            action: 'createVendorPayment',
            vendorNetsuiteId: vendorNsId,
            vendorBillId: invoice.netsuiteId,
            amount: String(cfdi.total),
            trandate: cfdi.fecha.toISOString(),
            uuidComplemento: cfdi.complementUUID,
            complementoXMLUrl: xmlUrl,
            complementoPDFUrl: pdfUrl,
          });

          if (nsResponse?.success) {
            const complement = await prisma.paymentComplement.create({
              data: {
                folio: cfdi.complementUUID!,
                fecha: cfdi.fecha,
                total: cfdi.total,
                xmlUrl: xmlKey,
                pdfUrl: pdfKey,
                status: 'APPROVED',
                approvedAt: new Date(),
                userId,
                invoiceId: invoice.id,
                tenantId,
                netsuiteSyncStatus: 'SYNCED',
                netsuitePaymentId: String(nsResponse.vendorPaymentId),
              },
            });
            results.push({ filename, complementUUID: cfdi.complementUUID, invoiceUUID, status: 'success', netsuiteSyncStatus: 'SYNCED', netsuitePaymentId: String(nsResponse.vendorPaymentId), paymentComplementId: complement.id });
          } else {
            const errMsg = (nsResponse?.error || 'Respuesta inesperada de NetSuite').substring(0, 255);
            results.push({ filename, complementUUID: cfdi.complementUUID, invoiceUUID, status: 'error', error: `Error al sincronizar con NetSuite: ${errMsg}` });
          }
        } catch (nsErr: any) {
          const errMsg = (nsErr.message || 'Error de red').substring(0, 255);
          results.push({ filename, complementUUID: cfdi.complementUUID, invoiceUUID, status: 'error', error: `Error al sincronizar con NetSuite: ${errMsg}` });
        }
      })
    );

    const successCount = results.filter(r => r.status === 'success').length;
    const failedCount = results.filter(r => r.status === 'error').length;
    const finalStatus = failedCount === 0 ? 'COMPLETED' : successCount === 0 ? 'FAILED' : 'COMPLETED_WITH_ERRORS';

    await prisma.bulkPaymentComplementLog.update({
      where: { id: bulkLogId },
      data: {
        status: finalStatus,
        totalFiles: results.length,
        successCount,
        failedCount,
        results: results as any,
      },
    });
  } catch (err: any) {
    console.error('[BulkWorker] Error fatal:', err);
    await prisma.bulkPaymentComplementLog.update({
      where: { id: bulkLogId },
      data: {
        status: 'FAILED',
        results: [{ filename: '—', complementUUID: null, invoiceUUID: null, status: 'error', error: `Error interno: ${err.message}` }] as any,
      },
    });
  }
}
