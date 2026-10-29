// Envío de los documentos adicionales de una factura a NetSuite.
// Cada adjunto se sube al File Cabinet y se adjunta al Vendor Bill (subtab Communication >
// Files) mediante la acción `createInvoiceAttachment` del RESTlet. Es "best-effort":
// nunca lanza ni cambia el estatus de la factura; cada adjunto lleva su propio
// estatus y el RESTlet es idempotente (reconoce el archivo por el ID del adjunto en su nombre), así que reintentar es seguro.

import { prisma } from './prisma';
import { invokeRestlet, NetSuiteCredentials } from './netsuite';
import { getPresignedUrl } from './s3';

type RestletCaller = typeof invokeRestlet;

export type AttachmentSyncSummary = {
  total: number;
  synced: number;
  failed: number;
  skipped?: string;
};

const MAX_ERROR_LENGTH = 500;

const truncate = (msg: string) => msg.substring(0, MAX_ERROR_LENGTH);

async function markFailed(attachmentId: string, message: string) {
  await prisma.invoiceAttachment.update({
    where: { id: attachmentId },
    data: { netsuiteSyncStatus: 'FAILED', netsuiteSyncError: truncate(message) },
  });
}

/**
 * Sincroniza con NetSuite los adjuntos de la factura que aún no están enviados
 * (o que se enviaron contra un Vendor Bill distinto al actual).
 * `restlet` es inyectable para poder probar sin llamar a NetSuite.
 */
export async function syncInvoiceAttachments(
  invoiceId: string,
  restlet: RestletCaller = invokeRestlet,
): Promise<AttachmentSyncSummary> {
  const summary: AttachmentSyncSummary = { total: 0, synced: 0, failed: 0 };

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        netsuiteId: true,
        tenant: {
          select: {
            netsuiteAccountId: true,
            netsuiteConsumerKey: true,
            netsuiteConsumerSec: true,
            netsuiteTokenId: true,
            netsuiteTokenSecret: true,
            netsuiteScriptId: true,
            netsuiteDeployId: true,
          },
        },
        attachments: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!invoice) return { ...summary, skipped: 'Factura no encontrada.' };

    const pending = invoice.attachments.filter(
      (a) => a.netsuiteSyncStatus !== 'SYNCED' || a.netsuiteBillId !== invoice.netsuiteId,
    );
    summary.total = pending.length;
    if (pending.length === 0) return summary;

    if (!invoice.netsuiteId) {
      return { ...summary, skipped: 'La factura aún no está sincronizada con NetSuite.' };
    }

    const t = invoice.tenant;
    if (!t.netsuiteAccountId || !t.netsuiteConsumerKey || !t.netsuiteConsumerSec || !t.netsuiteTokenId || !t.netsuiteTokenSecret
        || !t.netsuiteScriptId || !t.netsuiteDeployId) {
      const message = 'Este tenant no tiene configuradas las credenciales o el Script/Deploy ID de NetSuite.';
      for (const a of pending) await markFailed(a.id, message);
      return { ...summary, failed: pending.length };
    }
    const creds: NetSuiteCredentials = {
      accountId: t.netsuiteAccountId,
      consumerKey: t.netsuiteConsumerKey,
      consumerSecret: t.netsuiteConsumerSec,
      tokenId: t.netsuiteTokenId,
      tokenSecret: t.netsuiteTokenSecret,
    };

    // En serie: respeta los límites de gobernanza de NetSuite y deja un log claro por adjunto.
    for (const attachment of pending) {
      try {
        const fileUrl = await getPresignedUrl(attachment.fileUrl);
        if (!fileUrl) throw new Error('No se pudo generar la URL de descarga del archivo.');

        const response = await restlet(t.netsuiteScriptId, t.netsuiteDeployId, creds, 'POST', {
          action: 'createInvoiceAttachment',
          vendorBillId: invoice.netsuiteId,
          portalAttachmentId: attachment.id,
          documentName: attachment.name,
          fileName: attachment.fileName,
          fileUrl,
        });

        if (response?.success) {
          await prisma.invoiceAttachment.update({
            where: { id: attachment.id },
            data: {
              netsuiteSyncStatus: 'SYNCED',
              netsuiteRecordId: String(response.recordId),
              netsuiteBillId: invoice.netsuiteId,
              netsuiteSyncError: null,
              netsuiteSyncedAt: new Date(),
            },
          });
          summary.synced++;
        } else {
          await markFailed(attachment.id, `Error ERP: ${response?.error || JSON.stringify(response)}`);
          summary.failed++;
        }
      } catch (err: any) {
        const isTimeout = err?.name === 'NetSuiteTimeout' || err?.name === 'AbortError';
        const reason = isTimeout
          ? 'Se agotó el tiempo de espera con NetSuite. El documento pudo haberse registrado; reintenta el envío para verificarlo.'
          : `No se pudo conectar con NetSuite: ${err?.message || 'error desconocido'}.`;
        console.error(`[InvoiceAttachments] Error enviando adjunto ${attachment.id} (factura ${invoiceId}):`, err);
        await markFailed(attachment.id, reason).catch(() => {});
        summary.failed++;
      }
    }

    console.log(`[InvoiceAttachments] Factura ${invoiceId}: ${summary.synced} enviados, ${summary.failed} fallidos de ${summary.total}.`);
    return summary;
  } catch (error: any) {
    console.error(`[InvoiceAttachments] Error inesperado sincronizando adjuntos de la factura ${invoiceId}:`, error);
    return { ...summary, skipped: 'Error inesperado al sincronizar los documentos adicionales.' };
  }
}
