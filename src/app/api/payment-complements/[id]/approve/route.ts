// app/api/payment-complements/[id]/approve/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { invokeRestlet } from '../../../../lib/netsuite';
import { getPresignedUrl } from '../../../../lib/s3';
import { sendEmail } from '../../../../lib/mailer';

const prisma = new PrismaClient();

const FALLBACK_SCRIPT_ID = process.env.NETSUITE_SCRIPT_ID || '3878';
const FALLBACK_DEPLOY_ID = process.env.NETSUITE_DEPLOY_ID || '1';

export async function PATCH(
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

    if (decoded.role !== 'ADMIN' && decoded.role !== 'TENANT_ADMIN') {
      return NextResponse.json({ message: 'Acceso denegado.' }, { status: 403 });
    }

    const { id } = await params;

    // Cargar complemento con factura y datos del proveedor
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
          },
        },
      },
    });

    if (!complement) {
      return NextResponse.json({ message: 'Complemento no encontrado.' }, { status: 404 });
    }

    // 1. Aprobar en BD
    const updated = await prisma.paymentComplement.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        rejectionReason: null,
        rejectedAt: null,
      },
    });

    // 2. Sincronizar a NetSuite si tenemos los IDs necesarios
    const vendorNsId     = complement.user?.supplierProfile?.netsuiteId;
    const vendorBillNsId = complement.invoice?.netsuiteId;
    const tenant         = complement.tenant;

    if (vendorNsId && vendorBillNsId && tenant?.netsuiteAccountId) {
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
        console.warn('[Approve] No se pudieron generar presigned URLs para el complemento:', urlErr);
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

      try {
        const scriptId = tenant?.netsuiteScriptId || FALLBACK_SCRIPT_ID;
        const deployId = tenant?.netsuiteDeployId || FALLBACK_DEPLOY_ID;
        console.log(`[Approve] Enviando VendorPayment a NetSuite para complemento ${id}`, nsPayload);
        const nsResponse = await invokeRestlet(scriptId, deployId, nsCreds, 'POST', nsPayload);

        if (nsResponse?.success) {
          console.log(`[Approve] VendorPayment creado en NS. ID: ${nsResponse.vendorPaymentId}`);
          await prisma.paymentComplement.update({
            where: { id },
            data: {
              netsuiteSyncStatus: 'SYNCED',
              netsuitePaymentId:  String(nsResponse.vendorPaymentId),
              netsuiteSyncError:  null,
            },
          });
        } else {
          const errMsg = nsResponse?.error || 'Respuesta inesperada de NetSuite';
          console.error(`[Approve] NetSuite rechazó el VendorPayment:`, errMsg);
          await prisma.paymentComplement.update({
            where: { id },
            data: {
              netsuiteSyncStatus: 'FAILED',
              netsuiteSyncError:  errMsg.substring(0, 255),
            },
          });
        }
      } catch (nsError: any) {
        console.error(`[Approve] Error al llamar a NetSuite:`, nsError.message);
        await prisma.paymentComplement.update({
          where: { id },
          data: {
            netsuiteSyncStatus: 'FAILED',
            netsuiteSyncError:  nsError.message?.substring(0, 255),
          },
        });
      }
    } else {
      // Faltan datos de NS — dejar en PENDING_SYNC para retry manual
      console.warn(`[Approve] No se puede sincronizar a NS todavía. vendorNsId=${vendorNsId}, vendorBillNsId=${vendorBillNsId}`);
    }

    // 3. Notificar al proveedor por email
    const providerEmail = complement.user?.email;
    const providerName  = complement.user?.name || 'Proveedor';

    if (providerEmail) {
      await sendEmail({
        to: providerEmail,
        subject: 'Complemento de pago aprobado',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #166534 0%, #16a34a 100%); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 22px;">✅ Complemento de Pago Aprobado</h1>
            </div>
            <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
              <p style="color: #374151;">Hola, <strong>${providerName}</strong></p>
              <p style="color: #6b7280;">Tu complemento de pago <strong>folio ${complement.folio}</strong> ha sido <span style="color:#16a34a; font-weight:bold;">aprobado</span> y registrado en el sistema.</p>
            </div>
          </div>
        `,
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error approve payment-complement:', error);
    return NextResponse.json({ message: 'Error al procesar la solicitud.' }, { status: 500 });
  }
}
