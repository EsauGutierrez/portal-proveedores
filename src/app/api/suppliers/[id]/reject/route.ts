// app/api/suppliers/[id]/reject/route.ts

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
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET!) as { role: string };

    if (decodedToken.role !== 'ADMIN' && decodedToken.role !== 'TENANT_ADMIN') {
      return NextResponse.json({ message: 'Acceso denegado.' }, { status: 403 });
    }

    const { id: supplierProfileId } = await params;
    const body = await request.json();
    const { rejectionReason } = body;

    if (!rejectionReason || rejectionReason.trim().length === 0) {
      return NextResponse.json({ message: 'El motivo del rechazo es requerido.' }, { status: 400 });
    }

    const supplierProfile = await prisma.supplierProfile.findUnique({
      where: { id: supplierProfileId },
      include: { user: true },
    });

    if (!supplierProfile) {
      return NextResponse.json({ message: 'Proveedor no encontrado.' }, { status: 404 });
    }

    if (supplierProfile.status === 'REJECTED') {
      return NextResponse.json({ message: 'Este proveedor ya ha sido rechazado.' }, { status: 400 });
    }

    await prisma.supplierProfile.update({
      where: { id: supplierProfileId },
      data: { status: 'REJECTED' },
    });

    const providerEmail = supplierProfile.user?.email;
    const providerName = supplierProfile.user?.name || 'Proveedor';
    const companyName = supplierProfile.companyName || 'Tu empresa';

    if (providerEmail) {
      await sendEmail({
        to: providerEmail,
        subject: '⚠️ Solicitud de registro rechazada',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 20px; color: white; border-radius: 8px 8px 0 0;">
              <h2 style="margin: 0;">⚠️ Solicitud Rechazada</h2>
            </div>
            <div style="padding: 20px; background: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 0 0 8px 8px;">
              <p>Hola <strong>${providerName}</strong>,</p>
              <p>Lamentamos informarte que la solicitud de registro de <strong>${companyName}</strong> en el portal de proveedores ha sido rechazada.</p>
              <div style="background: white; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0 0 8px 0; color: #666; font-size: 13px;"><strong>Motivo del rechazo:</strong></p>
                <p style="margin: 0; color: #333; font-size: 14px;">${rejectionReason.trim()}</p>
              </div>
              <p>Si tienes preguntas o crees que esto es un error, contacta al equipo de administración.</p>
              <p style="color: #999; font-size: 12px; margin-top: 20px; border-top: 1px solid #e0e0e0; padding-top: 10px;">
                Este es un mensaje automático del Portal de Proveedores.
              </p>
            </div>
          </div>
        `,
      });
    }

    return NextResponse.json({ message: 'Proveedor rechazado y notificado.' }, { status: 200 });

  } catch (error) {
    console.error('Error al rechazar el proveedor:', error);
    return NextResponse.json({ message: 'Error al procesar la solicitud.' }, { status: 500 });
  }
}
