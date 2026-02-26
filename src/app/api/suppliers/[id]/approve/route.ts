// app/api/suppliers/[id]/approve/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { Resend } from 'resend';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

// Evitamos que falle inmediatamente si no hay API Key de Resend en el entorno
let resend: Resend | null = null;
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
}

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

    // 5. Enviar el correo de bienvenida usando Resend (solo si está configurado)
    if (resend) {
      await resend.emails.send({
        from: 'Portal Proveedores <onboarding@resend.dev>', // Email autorizado de prueba en Resend
        to: [supplierProfile.user.email!],
        subject: '¡Bienvenido! Tu cuenta ha sido aprobada',
        html: `
          <h1>¡Bienvenido a nuestro portal, ${supplierProfile.user.name}!</h1>
          <p>Tu solicitud de registro ha sido aprobada. Para completar la activación de tu cuenta, por favor, establece tu contraseña haciendo clic en el siguiente enlace:</p>
          <a href="${setPasswordUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Establecer Contraseña</a>
          <p>Este enlace es válido por 24 horas.</p>
          <p>Si no solicitaste este registro, puedes ignorar este correo.</p>
        `,
      });
      console.log('Correo de aprobación enviado a:', supplierProfile.user.email);
    } else {
      console.warn('ADVERTENCIA: API Key de Resend no configurada. Simulación de envío de correo.');
      console.log('URL para establecer contraseña (copiar y pegar):', setPasswordUrl);
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
