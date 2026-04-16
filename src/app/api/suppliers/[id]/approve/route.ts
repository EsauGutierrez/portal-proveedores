// app/api/suppliers/[id]/approve/route.ts

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
    const { id: supplierProfileId } = await params;

    // 1. Buscar el perfil del proveedor y su usuario asociado
    const supplierProfile = await prisma.supplierProfile.findUnique({
      where: { id: supplierProfileId },
      include: { user: true },
    });

    if (!supplierProfile || !supplierProfile.user) {
      return NextResponse.json(
        { message: 'Proveedor no encontrado.' },
        { status: 404 }
      );
    }

    if (supplierProfile.status === 'ACTIVE') {
      return NextResponse.json(
        { message: 'Este proveedor ya ha sido aprobado.' },
        { status: 400 }
      );
    }

    // 2. Actualizar el estado del proveedor a 'ACTIVE'
    await prisma.supplierProfile.update({
      where: { id: supplierProfileId },
      data: { status: 'ACTIVE' },
    });

    // 3. Generar un token JWT para establecer la contraseña
    const token = jwt.sign(
      { userId: supplierProfile.user.id },
      process.env.JWT_SECRET!,
      { expiresIn: '24h' } // El enlace será válido por 24 horas
    );

    // 4. Construir el enlace para establecer la contraseña
    const setPasswordUrl = `${process.env.NEXT_PUBLIC_APP_URL}/crear-contrasena?token=${token}`;

    // 5. Enviar el correo de bienvenida (sin bloquear la respuesta si falla)
    try {
      await sendEmail({
        to: supplierProfile.user.email!,
        subject: '¡Bienvenido! Tu cuenta ha sido aprobada',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">¡Bienvenido al Portal!</h1>
            </div>
            <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
              <p style="color: #374151; font-size: 16px;">Hola, <strong>${supplierProfile.user.name}</strong></p>
              <p style="color: #6b7280;">Tu solicitud de registro ha sido aprobada. Para completar la activación de tu cuenta, establece tu contraseña haciendo clic en el siguiente enlace:</p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${setPasswordUrl}" style="background-color: #2563eb; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">
                  Establecer Contraseña
                </a>
              </div>
              <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px;">
                <p style="color: #92400e; margin: 0; font-size: 14px;">⚠️ Este enlace es válido por <strong>24 horas</strong>.</p>
              </div>
            </div>
          </div>
        `,
      });
    } catch (emailError) {
      console.error('Error enviando correo de bienvenida:', emailError);
    }

    return NextResponse.json(
      { message: 'Proveedor aprobado y correo de bienvenida enviado.' },
      { status: 200 }
    );

  } catch (error) {
    console.error('Error al aprobar el proveedor:', error);
    return NextResponse.json(
      { message: 'Error al procesar la solicitud.' },
      { status: 500 }
    );
  }
}
