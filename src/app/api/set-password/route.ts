// app/api/set-password/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

// Definimos una interfaz para el contenido del token decodificado
interface DecodedToken {
  userId: string;
  iat: number;
  exp: number;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token, password } = body;

    // 1. Validación de entrada
    if (!token || !password) {
      return NextResponse.json(
        { message: 'El token y la nueva contraseña son requeridos.' },
        { status: 400 }
      );
    }

    // Validación de la fortaleza de la contraseña
    if (password.length < 8) {
      return NextResponse.json(
        { message: 'La contraseña debe tener al menos 8 caracteres.' },
        { status: 400 }
      );
    }

    // 2. Verificar el token JWT
    let decodedToken: DecodedToken;
    try {
      decodedToken = jwt.verify(token, process.env.JWT_SECRET!) as DecodedToken;
    } catch (error) {
      // Si el token es inválido o ha expirado, jwt.verify lanzará un error
      return NextResponse.json(
        { message: 'El enlace es inválido o ha expirado. Por favor, solicita uno nuevo.' },
        { status: 401 }
      );
    }

    const { userId } = decodedToken;

    // 3. Hashear (encriptar) la nueva contraseña
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 4. Actualizar la contraseña del usuario en la base de datos
    await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        password: hashedPassword,
      },
    });

    return NextResponse.json(
      { message: 'Contraseña actualizada exitosamente. Ahora puedes iniciar sesión.' },
      { status: 200 }
    );

  } catch (error) {
    console.error('Error al establecer la contraseña:', error);
    return NextResponse.json(
      { message: 'Error al procesar la solicitud.' },
      { status: 500 }
    );
  }
}
