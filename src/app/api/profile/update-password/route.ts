// app/api/profile/update-password/route.ts
// Cambio de contraseña voluntario desde el Perfil (usuario ya logueado).
// Distinto de /api/profile/change-password, que es exclusivo del flujo de primer login forzado.

import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import bcrypt from 'bcrypt';
import { requireAuth } from '../../../lib/auth';
import { rateLimit, rateLimitResponse } from '../../../lib/rateLimit';
import { sendEmail } from '../../../lib/mailer';
import { isValidPassword, PASSWORD_POLICY_MESSAGE } from '../../../lib/passwordPolicy';

export async function POST(request: Request) {
  const { decoded, error } = await requireAuth(request);
  if (error) return error;

  // Rate limit por usuario: 5 intentos cada 15 minutos, evita fuerza bruta contra la contraseña actual
  const rl = rateLimit(`update-pwd:${decoded.userId}`, 5, 15 * 60 * 1000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterSec);

  try {
    const { currentPassword, newPassword, confirmPassword } = await request.json();

    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json({ message: 'Todos los campos son requeridos.' }, { status: 400 });
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json({ message: 'La nueva contraseña y su confirmación no coinciden.' }, { status: 400 });
    }

    if (!isValidPassword(newPassword)) {
      return NextResponse.json({ message: PASSWORD_POLICY_MESSAGE }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user || !user.password) {
      return NextResponse.json({ message: 'No se pudo verificar la cuenta.' }, { status: 400 });
    }

    const isCurrentValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentValid) {
      return NextResponse.json({ message: 'La contraseña actual es incorrecta.' }, { status: 401 });
    }

    const isSameAsCurrent = await bcrypt.compare(newPassword, user.password);
    if (isSameAsCurrent) {
      return NextResponse.json({ message: 'La nueva contraseña debe ser diferente a la actual.' }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // tokenVersion++ invalida cualquier JWT emitido antes de este cambio (incluida
    // la sesión actual, que el frontend cierra explícitamente tras esta respuesta).
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword, tokenVersion: { increment: 1 } },
    });

    if (user.email) {
      sendEmail({
        to: user.email,
        subject: 'Tu contraseña fue actualizada — Portal de Proveedores',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">Contraseña Actualizada</h1>
            </div>
            <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
              <p style="color: #374151; font-size: 16px;">Hola, <strong>${user.name || ''}</strong></p>
              <p style="color: #6b7280;">Tu contraseña en el Portal de Proveedores fue actualizada correctamente.</p>
              <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; margin-top: 20px;">
                <p style="color: #92400e; margin: 0; font-size: 14px;">⚠️ Si no reconoces este cambio, contacta a tu administrador de inmediato.</p>
              </div>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
              <p style="color: #9ca3af; font-size: 12px; text-align: center;">Portal de Proveedores — IMR Software</p>
            </div>
          </div>
        `,
      }).catch((err) => console.error('Error enviando email de aviso de cambio de contraseña:', err));
    }

    return NextResponse.json({ message: 'Contraseña actualizada con éxito.' }, { status: 200 });
  } catch (error) {
    console.error('Error al actualizar contraseña:', error);
    return NextResponse.json({ message: 'Error interno al procesar el cambio de contraseña.' }, { status: 500 });
  }
}
