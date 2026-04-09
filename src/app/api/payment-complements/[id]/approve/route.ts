// app/api/payment-complements/[id]/approve/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { Resend } from 'resend';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

let resend: Resend | null = null;
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
}

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

    const complement = await prisma.paymentComplement.findUnique({
      where: { id },
      include: { user: true, invoice: true },
    });

    if (!complement) {
      return NextResponse.json({ message: 'Complemento no encontrado.' }, { status: 404 });
    }

    const updated = await prisma.paymentComplement.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        rejectionReason: null,
        rejectedAt: null,
      },
    });

    const providerEmail = complement.user?.email;
    const providerName = complement.user?.name || 'Proveedor';

    if (resend && providerEmail) {
      await resend.emails.send({
        from: 'Portal de Proveedores <noreply@imr.com.mx>',
        to: providerEmail,
        subject: 'Complemento de pago aprobado',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #166534 0%, #16a34a 100%); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 22px;">✅ Complemento de Pago Aprobado</h1>
            </div>
            <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
              <p style="color: #374151;">Hola, <strong>${providerName}</strong></p>
              <p style="color: #6b7280;">Tu complemento de pago <strong>folio ${complement.folio}</strong> ha sido <span style="color:#16a34a; font-weight:bold;">aprobado</span>.</p>
            </div>
          </div>
        `,
      });
    } else {
      console.log('📧 [SIMULADO] Email de aprobación de complemento:', {
        to: providerEmail,
        folio: complement.folio,
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error approve payment-complement:', error);
    return NextResponse.json({ message: 'Error al procesar la solicitud.' }, { status: 500 });
  }
}
