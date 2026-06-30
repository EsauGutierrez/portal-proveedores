// app/api/documents/[id]/reject/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { sendEmail } from '../../../../lib/mailer';

const prisma = new PrismaClient();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET!) as { role: string; tenantId?: string };

    if (decodedToken.role !== 'ADMIN' && decodedToken.role !== 'TENANT_ADMIN') {
      return NextResponse.json({ message: 'Acceso denegado.' }, { status: 403 });
    }

    const documentId = (await params).id;
    const body = await request.json();
    const { rejectionReason } = body;

    if (!rejectionReason || rejectionReason.trim().length === 0) {
      return NextResponse.json({ message: 'El motivo del rechazo es requerido.' }, { status: 400 });
    }

    // Obtener documento con datos del proveedor
    const supplierDoc = await prisma.supplierDocument.findUnique({
      where: { id: documentId },
      include: { supplierProfile: { include: { user: true } } }
    });

    if (!supplierDoc) {
      return NextResponse.json({ message: 'Documento no encontrado.' }, { status: 404 });
    }

    if (decodedToken.tenantId && supplierDoc.supplierProfile?.tenantId !== decodedToken.tenantId) {
      return NextResponse.json({ message: 'Acceso denegado.' }, { status: 403 });
    }

    // Actualizar documento
    const updatedDocument = await prisma.supplierDocument.update({
      where: { id: documentId },
      data: {
        status: 'REJECTED',
        rejectionReason: rejectionReason.trim(),
        rejectedAt: new Date(),
      },
    });

    // Notificar al proveedor
    const providerEmail = supplierDoc.supplierProfile?.user?.email;
    const providerName = supplierDoc.supplierProfile?.user?.name || 'Proveedor';
    const companyName = supplierDoc.supplierProfile?.companyName || 'Tu empresa';

    if (providerEmail) {
      await sendEmail({
        to: providerEmail,
        subject: `⚠️ Documento Rechazado: ${supplierDoc.documentType}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 20px; color: white; border-radius: 8px 8px 0 0;">
              <h2 style="margin: 0;">⚠️ Documento Rechazado</h2>
            </div>
            <div style="padding: 20px; background: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 0 0 8px 8px;">
              <p>Hola <strong>${providerName}</strong>,</p>
              <p>El documento <strong>${supplierDoc.documentType}</strong> de <strong>${companyName}</strong> ha sido rechazado y requiere correcciones.</p>
              <div style="background: white; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0 0 8px 0; color: #666; font-size: 13px;"><strong>Motivo del rechazo:</strong></p>
                <p style="margin: 0; color: #333; font-size: 14px;">${rejectionReason}</p>
              </div>
              <p>Por favor, sube un nuevo documento que cumpla con los requisitos solicitados.</p>
              <div style="text-align: center; margin: 24px 0;">
                <a href="${process.env.NEXT_PUBLIC_APP_URL || `${request.headers.get('x-forwarded-proto') || 'https'}://${request.headers.get('host')}`}" style="background: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                  Ir al Portal
                </a>
              </div>
              <p style="color: #999; font-size: 12px; margin-top: 20px; border-top: 1px solid #e0e0e0; padding-top: 10px;">
                Si tienes preguntas, contacta al equipo de administración.
              </p>
            </div>
          </div>
        `,
      });
    }

    return NextResponse.json(updatedDocument, { status: 200 });

  } catch (error) {
    console.error('Error al rechazar el documento:', error);
    if ((error as any).code === 'P2025') {
      return NextResponse.json({ message: 'Documento no encontrado.' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Error al procesar la solicitud.' }, { status: 500 });
  }
}
