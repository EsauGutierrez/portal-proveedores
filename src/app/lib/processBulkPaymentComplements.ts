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

interface ParsedCfdi {
  complementUUID: string | null;
  invoiceUUID: string | null;
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

  // UUID del complemento
  const timbre = comprobante['cfdi:Complemento']?.['tfd:TimbreFiscalDigital']?.['$']
    || comprobante['cfdi:Complemento']?.['TimbreFiscalDigital']?.['$'];
  const complementUUID = timbre?.UUID || null;

  // Nodo Pagos (pago10 = CFDI 3.3, pago20 = CFDI 4.0)
  const complemento = comprobante['cfdi:Complemento'] || {};
  const pagosNode = complemento['pago10:Pagos'] || complemento['pago20:Pagos'] || complemento['Pagos'];
  const pagoRaw = pagosNode?.['pago10:Pago'] || pagosNode?.['pago20:Pago'] || pagosNode?.['Pago'];
  const pago = toArray(pagoRaw)[0];
  const pagoAttrs = pago?.['$'] || {};

  // UUID de la factura relacionada (primer DoctoRelacionado)
  const doctoRaw = pago?.['pago10:DoctoRelacionado'] || pago?.['pago20:DoctoRelacionado'] || pago?.['DoctoRelacionado'];
  const docto = toArray(doctoRaw)[0];
  const invoiceUUID = docto?.['$']?.IdDocumento || null;

  // Monto: preferir el Monto del nodo Pago; fallback al Total del Comprobante
  const monto = parseFloat(pagoAttrs.Monto) || parseFloat(attrs.Total) || 0;

  // Fecha: preferir FechaPago del nodo Pago; fallback a Fecha del Comprobante
  const fechaStr = pagoAttrs.FechaPago || attrs.Fecha;
  const fecha = fechaStr ? new Date(fechaStr) : new Date();

  return {
    complementUUID,
    invoiceUUID,
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
  // Marcar como procesando
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
      // Ignorar archivos de metadata de macOS y carpetas especiales
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
        data: { status: 'FAILED', results: [{ filename: '—', complementUUID: null, invoiceUUID: null, status: 'error', error: 'Perfil de proveedor o tenant no encontrado.' }] },
      });
      return;
    }

    const rfcProveedor = user.supplierProfile.rfc.toUpperCase().replace(/[\s-]/g, '');
    const rfcsSubsidiarias = user.tenant.subsidiaries
      .map((s: any) => (s.rfc || '').toUpperCase().replace(/[\s-]/g, ''))
      .filter(Boolean);

    const nsCreds: NetSuiteCredentials | null = user.tenant.netsuiteAccountId ? {
      accountId: user.tenant.netsuiteAccountId,
      consumerKey: user.tenant.netsuiteConsumerKey!,
      consumerSecret: user.tenant.netsuiteConsumerSec!,
      tokenId: user.tenant.netsuiteTokenId!,
      tokenSecret: user.tenant.netsuiteTokenSecret!,
    } : null;

    const scriptId = (user.tenant as any).netsuiteScriptId || FALLBACK_SCRIPT_ID;
    const deployId = (user.tenant as any).netsuiteDeployId || FALLBACK_DEPLOY_ID;

    // Parsear todos los XMLs primero
    interface ParsedItem {
      base: string;
      group: { xml?: Buffer; pdf?: Buffer; xmlName?: string; pdfName?: string };
      cfdi: ParsedCfdi;
      invoice: any | null;
      parseError?: string;
    }

    const parsedItems: ParsedItem[] = [];

    for (const [base, group] of xmlGroups) {
      const xmlText = group.xml!.toString('utf-8');
      const cfdi = await parseCfdiPago(xmlText);

      if (!cfdi) {
        results.push({ filename: group.xmlName || base + '.xml', complementUUID: null, invoiceUUID: null, status: 'error', error: 'XML inválido o no es un CFDI.' });
        continue;
      }
      if (!cfdi.complementUUID) {
        results.push({ filename: group.xmlName || base + '.xml', complementUUID: null, invoiceUUID: null, status: 'error', error: 'El CFDI no tiene Timbre Fiscal Digital (UUID).' });
        continue;
      }
      if (!cfdi.invoiceUUID) {
        results.push({ filename: group.xmlName || base + '.xml', complementUUID: cfdi.complementUUID, invoiceUUID: null, status: 'error', error: 'No se encontró IdDocumento (UUID de factura relacionada) en el XML.' });
        continue;
      }
      if (cfdi.total <= 0) {
        results.push({ filename: group.xmlName || base + '.xml', complementUUID: cfdi.complementUUID, invoiceUUID: cfdi.invoiceUUID, status: 'error', error: `El monto del pago ($${cfdi.total}) debe ser mayor a cero.` });
        continue;
      }

      // Buscar factura en BD por UUID
      const invoice = await prisma.invoice.findFirst({
        where: { tenantId, folio: cfdi.invoiceUUID },
        include: {
          user: { include: { supplierProfile: { select: { rfc: true, netsuiteId: true } } } },
        },
      });

      parsedItems.push({ base, group, cfdi, invoice });
    }

    // Validaciones locales y recolección de netsuiteIds para batch query
    interface ValidItem extends ParsedItem {
      invoice: NonNullable<ParsedItem['invoice']>;
    }
    const validItems: ValidItem[] = [];

    for (const item of parsedItems) {
      const filename = item.group.xmlName || item.base + '.xml';
      const { cfdi, invoice } = item;

      if (!invoice) {
        results.push({ filename, complementUUID: cfdi.complementUUID, invoiceUUID: cfdi.invoiceUUID, status: 'error', error: `Factura con UUID ${cfdi.invoiceUUID} no encontrada en el sistema.` });
        continue;
      }
      if (invoice.syncStatus !== 'SYNCED' || !invoice.netsuiteId) {
        results.push({ filename, complementUUID: cfdi.complementUUID, invoiceUUID: cfdi.invoiceUUID, status: 'error', error: 'La factura aún no está sincronizada con NetSuite.' });
        continue;
      }

      // Validar RFC Emisor
      const rfcEmisorInvoice = (invoice.user?.supplierProfile?.rfc || '').toUpperCase().replace(/[\s-]/g, '');
      if (cfdi.rfcEmisor !== rfcProveedor || cfdi.rfcEmisor !== rfcEmisorInvoice) {
        results.push({ filename, complementUUID: cfdi.complementUUID, invoiceUUID: cfdi.invoiceUUID, status: 'error', error: `RFC emisor (${cfdi.rfcEmisor}) no coincide con el proveedor de la factura (${rfcEmisorInvoice}).` });
        continue;
      }

      // Validar RFC Receptor
      if (rfcsSubsidiarias.length > 0 && cfdi.rfcReceptor && !rfcsSubsidiarias.includes(cfdi.rfcReceptor)) {
        results.push({ filename, complementUUID: cfdi.complementUUID, invoiceUUID: cfdi.invoiceUUID, status: 'error', error: `RFC receptor (${cfdi.rfcReceptor}) no corresponde a ninguna empresa registrada.` });
        continue;
      }

      // Verificar duplicado
      const existing = await prisma.paymentComplement.findFirst({
        where: { tenantId, folio: cfdi.complementUUID! },
      });
      if (existing) {
        results.push({ filename, complementUUID: cfdi.complementUUID, invoiceUUID: cfdi.invoiceUUID, status: 'error', error: 'Este complemento ya fue registrado anteriormente (UUID duplicado).' });
        continue;
      }

      validItems.push(item as ValidItem);
    }

    // Verificación batch en NetSuite: un solo query con todos los IDs
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

    // Procesar cada item válido
    await Promise.allSettled(
      validItems.map(async (item) => {
        const filename = item.group.xmlName || item.base + '.xml';
        const { cfdi, invoice } = item;

        // Verificar que el VendorBill existe en NetSuite
        if (nsCreds && !nsValidIds.has(invoice.netsuiteId)) {
          const detail = nsVerifyError
            ? `Error al consultar NetSuite: ${nsVerifyError}`
            : `VendorBill ID ${invoice.netsuiteId} no encontrado en NetSuite.`;
          results.push({ filename, complementUUID: cfdi.complementUUID, invoiceUUID: cfdi.invoiceUUID, status: 'error', error: detail });
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
          results.push({ filename, complementUUID: cfdi.complementUUID, invoiceUUID: cfdi.invoiceUUID, status: 'success', netsuiteSyncStatus: 'PENDING_SYNC', paymentComplementId: complement.id });
          return;
        }

        // Intentar sincronización con NetSuite ANTES de crear registro local.
        // Si falla, no se crea nada en la BD.
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
            results.push({ filename, complementUUID: cfdi.complementUUID, invoiceUUID: cfdi.invoiceUUID, status: 'success', netsuiteSyncStatus: 'SYNCED', netsuitePaymentId: String(nsResponse.vendorPaymentId), paymentComplementId: complement.id });
          } else {
            const errMsg = (nsResponse?.error || 'Respuesta inesperada de NetSuite').substring(0, 255);
            results.push({ filename, complementUUID: cfdi.complementUUID, invoiceUUID: cfdi.invoiceUUID, status: 'error', error: `Error al sincronizar con NetSuite: ${errMsg}` });
          }
        } catch (nsErr: any) {
          const errMsg = (nsErr.message || 'Error de red').substring(0, 255);
          results.push({ filename, complementUUID: cfdi.complementUUID, invoiceUUID: cfdi.invoiceUUID, status: 'error', error: `Error al sincronizar con NetSuite: ${errMsg}` });
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
      data: { status: 'FAILED', results: [{ filename: '—', complementUUID: null, invoiceUUID: null, status: 'error', error: `Error interno: ${err.message}` }] as any },
    });
  }
}
