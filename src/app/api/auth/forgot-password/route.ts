// app/api/auth/forgot-password/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import crypto from 'crypto';
import { rateLimit, getClientIP, rateLimitResponse } from '../../../lib/rateLimit';
import { sendEmail } from '../../../lib/mailer';

export async function POST(request: Request) {
  // Rate limit: 5 solicitudes por IP cada hora (anti-spam de emails)
  const ip = getClientIP(request);
  const rl = rateLimit(`forgot-pwd:${ip}`, 5, 60 * 60 * 1000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterSec);

  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ message: 'El correo es requerido.' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Siempre responder 200 por seguridad (no revelar si el email existe)
    if (!user) {
      return NextResponse.json({ message: 'Si el correo existe, recibirás un enlace de recuperación.' });
    }

    // Generar token de 32 bytes (64 hex chars)
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetToken,
        passwordResetExpires: resetExpires,
      },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ||
      `${request.headers.get('x-forwarded-proto') || 'https'}://${request.headers.get('host')}`;
    const resetLink = `${appUrl}/recuperar-contrasena?token=${resetToken}`;
    const userName = user.name || 'Usuario';

    await sendEmail({
      to: email,
      subject: 'Recuperación de contraseña — Portal de Proveedores',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Recuperación de Contraseña</h1>
          </div>
          <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
            <p style="color: #374151; font-size: 16px;">Hola, <strong>${userName}</strong></p>
            <p style="color: #6b7280;">Recibimos una solicitud para restablecer la contraseña de tu cuenta. Haz clic en el botón para crear una nueva contraseña:</p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${resetLink}" style="background-color: #2563eb; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">
                Restablecer contraseña
              </a>
            </div>
            <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; margin-bottom: 20px;">
              <p style="color: #92400e; margin: 0; font-size: 14px;">⚠️ Este enlace expira en <strong>1 hora</strong>. Si no solicitaste este cambio, ignora este mensaje.</p>
            </div>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">Portal de Proveedores — IMR Software</p>
          </div>
        </div>
      `,
    });

    return NextResponse.json({ message: 'Si el correo existe, recibirás un enlace de recuperación.' });
  } catch (error) {
    console.error('Error en forgot-password:', error);
    return NextResponse.json({ message: 'Error al procesar la solicitud.' }, { status: 500 });
  }
}
