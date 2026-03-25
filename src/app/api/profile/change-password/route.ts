// app/api/profile/change-password/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    const { userId } = decodedToken;

    const body = await request.json();
    const { password } = body;

    if (!password || password.length < 8) {
      return NextResponse.json({ message: 'La contraseña debe tener al menos 8 caracteres.' }, { status: 400 });
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
