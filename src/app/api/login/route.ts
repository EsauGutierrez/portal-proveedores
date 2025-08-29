// app/api/login/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // 1. Validación de entrada
    if (!email || !password) {
      return NextResponse.json(
        { message: 'El correo y la contraseña son requeridos.' },
        { status: 400 }
      );
    }

    // 2. Buscar al usuario en la base de datos
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        supplierProfile: true, // Incluimos el perfil para verificar si está activo
      },
    });

    // 3. Validar si el usuario existe y tiene contraseña
    if (!user || !user.password) {
      return NextResponse.json(
        { message: 'Credenciales inválidas.' },
        { status: 401 } // Unauthorized
      );
    }
    
    // 4. Lógica de autorización basada en el rol
    if (user.role === 'SUPPLIER') {
        // Si es un proveedor, verificar que su perfil esté ACTIVO
        if (user.supplierProfile?.status !== 'ACTIVE') {
            // Si el proveedor no está activo, devolvemos un código de error específico
            // y el ID de su perfil para que el frontend sepa a dónde redirigir.
            return NextResponse.json(
                { 
                  errorCode: 'PENDING_APPROVAL',
                  message: 'Tu cuenta está pendiente de aprobación.',
                  supplierProfileId: user.supplierProfile?.id 
                },
                { status: 403 } // Forbidden
            );
        }
    }
    // Si el rol es 'ADMIN', no se necesita ninguna verificación adicional del perfil.

    // 5. Comparar la contraseña proporcionada con la guardada (hasheada)
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return NextResponse.json(
        { message: 'Credenciales inválidas.' },
        { status: 401 }
      );
    }

    // 6. Generar un JSON Web Token (JWT)
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role, // Incluimos el rol en el token
      },
      process.env.JWT_SECRET!,
      {
        expiresIn: '1d',
      }
    );

    // 7. Devolver el token y la información del usuario (sin la contraseña)
    const { password: _, ...userWithoutPassword } = user;

    return NextResponse.json(
      {
        user: userWithoutPassword,
        token,
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Error en el inicio de sesión:', error);
    return NextResponse.json(
      { message: 'Error en el inicio de sesión.' },
      { status: 500 }
    );
  }
}
