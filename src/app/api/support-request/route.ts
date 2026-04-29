import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { sendEmail } from '../../../lib/mailer';

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET!);

    if (decoded.role !== 'SUPPLIER') {
      return NextResponse.json({ message: 'Solo los proveedores pueden enviar solicitudes de ayuda.' }, { status: 403 });
    }

    const { type, documentFolio, subject, description } = await request.json();

    if (!type || !subject || !description) {
      return NextResponse.json({ message: 'Tipo, asunto y descripción son obligatorios.' }, { status: 400 });
    }

    // Obtener datos del proveedor y el supportEmail del tenant
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        supplierProfile: {
          select: { companyName: true, rfc: true },
        },
        tenant: {
          select: { supportEmail: true, name: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ message: 'Usuario no encontrado.' }, { status: 404 });
    }

    const supportEmail = user.tenant?.supportEmail;
    if (!supportEmail) {
      return NextResponse.json(
        { message: 'No hay correo de soporte configurado para tu empresa. Contacta al administrador.' },
        { status: 422 }
      );
    }

    const typeLabel: Record<string, string> = {
      OC: 'Orden de Compra',
      FACTURA: 'Factura',
      OTRO: 'Otro',
    };

    const supplierName = user.supplierProfile?.companyName || user.name || 'Proveedor';
    const supplierRfc  = user.supplierProfile?.rfc || 'N/A';
    const supplierEmail = user.email || 'N/A';
    const tenantName   = user.tenant?.name || 'N/A';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%); padding: 28px 32px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 20px;">🆘 Nueva Solicitud de Ayuda</h1>
          <p style="color: #bfdbfe; margin: 6px 0 0; font-size: 14px;">Portal de Proveedores — ${tenantName}</p>
        </div>
        <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 10px 0; color: #6b7280; font-size: 13px; width: 140px;">Proveedor</td>
              <td style="padding: 10px 0; color: #111827; font-size: 13px; font-weight: 600;">${supplierName}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 10px 0; color: #6b7280; font-size: 13px;">RFC</td>
              <td style="padding: 10px 0; color: #111827; font-size: 13px;">${supplierRfc}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 10px 0; color: #6b7280; font-size: 13px;">Correo</td>
              <td style="padding: 10px 0; color: #111827; font-size: 13px;">${supplierEmail}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 10px 0; color: #6b7280; font-size: 13px;">Tipo</td>
              <td style="padding: 10px 0; color: #111827; font-size: 13px;">${typeLabel[type] || type}</td>
            </tr>
            ${documentFolio ? `
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 10px 0; color: #6b7280; font-size: 13px;">Documento</td>
              <td style="padding: 10px 0; color: #111827; font-size: 13px;">${documentFolio}</td>
            </tr>` : ''}
            <tr>
              <td style="padding: 10px 0; color: #6b7280; font-size: 13px;">Asunto</td>
              <td style="padding: 10px 0; color: #111827; font-size: 13px; font-weight: 600;">${subject}</td>
            </tr>
          </table>
          <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px;">
            <p style="margin: 0 0 6px; color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Descripción</p>
            <p style="margin: 0; color: #374151; font-size: 14px; white-space: pre-wrap;">${description}</p>
          </div>
          <p style="margin-top: 24px; color: #9ca3af; font-size: 12px;">Este correo fue generado automáticamente desde el Portal de Proveedores.</p>
        </div>
      </div>
    `;

    // Nodemailer acepta múltiples destinatarios separados por coma
    await sendEmail({
      to: supportEmail,
      subject: `[Soporte Proveedores] ${subject} — ${supplierName}`,
      html,
    });

    return NextResponse.json({ success: true, message: 'Tu solicitud fue enviada correctamente.' });
  } catch (error: any) {
    console.error('Error support-request:', error);
    return NextResponse.json({ message: 'Error al enviar la solicitud.', error: error.message }, { status: 500 });
  }
}
