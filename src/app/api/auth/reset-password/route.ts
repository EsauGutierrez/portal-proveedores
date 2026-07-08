// app/api/auth/reset-password/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import bcrypt from 'bcrypt';
import { rateLimit, getClientIP, rateLimitResponse } from '../../../lib/rateLimit';
import { isValidPassword, PASSWORD_POLICY_MESSAGE } from '../../../lib/passwordPolicy';

export async function POST(request: Request) {
  // Rate limit: 10 intentos por IP cada 15 minutos
  const ip = getClientIP(request);
  const rl = rateLimit(`reset-pwd:${ip}`, 10, 15 * 60 * 1000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterSec);

  try {
    const { token, newPassword } = await request.json();

    if (!token || !newPassword) {
      return NextResponse.json({ message: 'Token y nueva contraseña son requeridos.' }, { status: 400 });
    }

    if (!isValidPassword(newPassword)) {
      return NextResponse.json({ message: PASSWORD_POLICY_MESSAGE }, { status: 400 });
    }

    // Buscar usuario con este token que no haya expirado
    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpires: { gt: new Date() },
      },
    });

    if (!user) {
      return NextResponse.json({ message: 'El enlace no es válido o ha expirado. Solicita uno nuevo.' }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        firstLogin: false,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });

    return NextResponse.json({ message: 'Contraseña restablecida correctamente.' });
  } catch (error) {
    console.error('Error en reset-password:', error);
    return NextResponse.json({ message: 'Error al procesar la solicitud.' }, { status: 500 });
  }
}
