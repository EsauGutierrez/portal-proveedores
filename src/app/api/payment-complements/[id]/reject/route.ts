// app/api/payment-complements/[id]/reject/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import jwt from 'jsonwebtoken';
import { sendEmail } from '../../../../lib/mailer';

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
    const { rejectionReason } = await request.json();

    if (!rejectionReason?.trim()) {
      return NextResponse.json({ message: 'El motivo del rechazo es requerido.' }, { status: 400 });
    }

    const complement = await prisma.paymentComplement.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!complement) {
      return NextResponse.json({ message: 'Complemento no encontrado.' }, { status: 404 });
    }

    if (decoded.tenantId && complement.tenantId !== decoded.tenantId) {
      return NextResponse.json({ message: 'Acceso denegado.' }, { status: 403 });
    }

    const updated = await prisma.paymentComplement.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason: rejectionReason.trim(),
        rejectedAt: new Date(),
        approvedAt: null,
      },
    });

    const providerEmail = complement.user?.email;
    const providerName = complement.user?.name || 'Proveedor';

    if (providerEmail) {
      await sendEmail({
        to: providerEmail,
        subject: 'Complemento de pago rechazado',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #991b1b 0%, #ef4444 100%); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 22px;">❌ Complemento de Pago Rechazado</h1>
            </div>
            <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
              <p style="color: #374151;">Hola, <strong>${providerName}</strong></p>
              <p style="color: #6b7280;">Tu complemento de pago <strong>folio ${complement.folio}</strong> ha sido rechazado por el siguiente motivo:</p>
              <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; border-radius: 4px; margin: 16px 0;">
                <p style="color: #991b1b; margin: 0;">${rejectionReason}</p>
              </div>
              <p style="color: #6b7280; font-size: 14px;">Por favor, corrige el documento y súbelo nuevamente desde el portal.</p>
            </div>
          </div>
        `,
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error reject payment-complement:', error);
    return NextResponse.json({ message: 'Error al procesar la solicitud.' }, { status: 500 });
  }
}
