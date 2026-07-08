// app/api/profile/change-password/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import bcrypt from 'bcrypt';
import { requireAuth } from '../../../lib/auth';
import { isValidPassword, PASSWORD_POLICY_MESSAGE } from '../../../lib/passwordPolicy';

export async function POST(request: Request) {
  const { decoded, error } = requireAuth(request);
  if (error) return error;
  const { userId } = decoded;

  try {
    const body = await request.json();
    const { password } = body;

    if (!password || !isValidPassword(password)) {
      return NextResponse.json({ message: PASSWORD_POLICY_MESSAGE }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Actualizar la contraseña y marcar que ya no es el primer login
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        firstLogin: false,
      },
    });

    return NextResponse.json({ message: 'Contraseña actualizada con éxito.' }, { status: 200 });

  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    return NextResponse.json({ message: 'Error interno al procesar el cambio de contraseña.' }, { status: 500 });
  }
}
