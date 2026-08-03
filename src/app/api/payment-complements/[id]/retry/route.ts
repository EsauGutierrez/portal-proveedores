// app/api/payment-complements/[id]/retry/route.ts
// Reintenta la sincronización a NetSuite para complementos con estado FAILED.

import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import jwt from 'jsonwebtoken';
import { invokeRestlet } from '../../../../lib/netsuite';
import { getPresignedUrl } from '../../../../lib/s3';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET!);

    const { id } = await params;

    const complement = await prisma.paymentComplement.findUnique({
      where: { id },
      include: {
        user: {
          include: {
            supplierProfile: { select: { netsuiteId: true } },
          },
        },
        invoice: { select: { folio: true, netsuiteId: true, tenantId: true } },
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
      },
    });

    if (!complement) {
      return NextResponse.json({ message: 'Complemento no encontrado.' }, { status: 404 });
    }

    // Autorización: el proveedor dueño puede reintentar su propio complemento, o un admin.
    const isOwner = complement.userId === decoded.userId;
    const isAdmin = decoded.role === 'ADMIN' || decoded.role === 'TENANT_ADMIN';
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ message: 'Acceso denegado.' }, { status: 403 });
    }
    // Aislamiento por tenant: un TENANT_ADMIN solo reintenta complementos de su propio tenant.
    if (decoded.role === 'TENANT_ADMIN' && complement.invoice?.tenantId !== decoded.tenantId) {
      return NextResponse.json({ message: 'Acceso denegado.' }, { status: 403 });
    }

    if (complement.netsuiteSyncStatus !== 'FAILED') {
      return NextResponse.json(
        { message: `Solo se pueden reintentar complementos con estado FAILED. Estado actual: ${complement.netsuiteSyncStatus}` },
        { status: 400 }
      );
    }

    const vendorNsId     = complement.user?.supplierProfile?.netsuiteId;
    const vendorBillNsId = complement.invoice?.netsuiteId;
    const tenant         = complement.tenant;

    if (!vendorNsId || !vendorBillNsId || !tenant?.netsuiteAccountId) {
      return NextResponse.json(
        { message: `Faltan datos de NetSuite para reintentar. vendorId=${vendorNsId}, billId=${vendorBillNsId}` },
        { status: 422 }
      );
    }

    // Cada tenant tiene su propia cuenta/bundle de NetSuite: no existe un
    // Script/Deploy ID "por defecto" válido para todos. Si falta, fallamos con
    // un mensaje claro en vez de usar silenciosamente el de otro cliente.
    if (!tenant.netsuiteScriptId || !tenant.netsuiteDeployId) {
      return NextResponse.json(
        { message: 'Este tenant no tiene configurado el Script ID / Deploy ID de NetSuite. Contacta a soporte para configurarlo en Ajustes de Empresa.' },
        { status: 422 }
      );
    }

    // Reset a PENDING_SYNC antes de reintentar
    await prisma.paymentComplement.update({
      where: { id },
      data: { netsuiteSyncStatus: 'PENDING_SYNC', netsuiteSyncError: null },
    });

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
      if (complement.xmlUrl) complementXmlUrl = await getPresignedUrl(complement.xmlUrl);
      if (complement.pdfUrl) complementPdfUrl = await getPresignedUrl(complement.pdfUrl);
    } catch (urlErr) {
      console.warn('[Retry] No se pudieron generar presigned URLs:', urlErr);
    }

    const nsPayload = {
      action:            'createVendorPayment',
      vendorNetsuiteId:  vendorNsId,
      vendorBillId:      vendorBillNsId,
      amount:            complement.total.toString(),
      trandate:          complement.fecha.toISOString(),
      uuidComplemento:   complement.folio,
      complementoXMLUrl: complementXmlUrl,
      complementoPDFUrl: complementPdfUrl,
    };

    const scriptId = tenant.netsuiteScriptId;
    const deployId = tenant.netsuiteDeployId;
    console.log(`[Retry] Reintentando VendorPayment para complemento ${id}`, nsPayload);
    const nsResponse = await invokeRestlet(scriptId, deployId, nsCreds, 'POST', nsPayload);

    if (nsResponse?.success) {
      console.log(`[Retry] VendorPayment creado. ID: ${nsResponse.vendorPaymentId}`);
      await prisma.paymentComplement.update({
        where: { id },
        data: {
          netsuiteSyncStatus: 'SYNCED',
          netsuitePaymentId:  String(nsResponse.vendorPaymentId),
          netsuiteSyncError:  null,
        },
      });
      return NextResponse.json({ success: true, message: 'Complemento sincronizado correctamente.', vendorPaymentId: nsResponse.vendorPaymentId });
    } else {
      const errMsg = nsResponse?.error || 'Respuesta inesperada de NetSuite';
      console.error(`[Retry] NetSuite rechazó el VendorPayment:`, errMsg);
      await prisma.paymentComplement.update({
        where: { id },
        data: {
          netsuiteSyncStatus: 'FAILED',
          netsuiteSyncError:  errMsg.substring(0, 255),
        },
      });
      return NextResponse.json({ success: false, message: `NetSuite rechazó la sincronización: ${errMsg}` }, { status: 502 });
    }
  } catch (error: any) {
    console.error('Error retry payment-complement:', error);
    return NextResponse.json({ message: 'Error al reintentar la sincronización.', error: error.message }, { status: 500 });
  }
}
