// app/api/login/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { rateLimit, getClientIP, rateLimitResponse } from '../../lib/rateLimit';

const prisma = new PrismaClient();

export async function POST(request: Request) {
  // Rate limit: 10 intentos por IP cada 15 minutos
  const ip = getClientIP(request);
  const rl = rateLimit(`login:${ip}`, 10, 15 * 60 * 1000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterSec);

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
        supplierProfile: true, // Incluimos el perfil si es proveedor
        tenant: true,          // Y también incluimos su Tenant para saber a qué empresa pertenece
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
      // Bloquear solo proveedores RECHAZADOS
      if (user.supplierProfile?.status === 'REJECTED') {
        return NextResponse.json(
          { message: 'Tu cuenta ha sido rechazada. Contacta a tu administrador.' },
          { status: 403 }
        );
      }

      // Verificar que el Tenant de este proveedor esté activo
      if (user.tenant && !user.tenant.isActive) {
        return NextResponse.json(
          { message: 'El acceso al portal de esta empresa está suspendido.' },
          { status: 403 }
        );
      }
    } else if (user.role === 'TENANT_ADMIN') {
      // Si es administrador del cliente, verificar que su empresa (Tenant) siga activa
      if (!user.tenant?.isActive) {
        return NextResponse.json(
          { message: 'La cuenta de tu empresa está suspendida. Contacta a soporte.' },
          { status: 403 }
        );
      }
    }
    // Si el rol es 'SUPERADMIN', tiene acceso global y no se hacen estas verificaciones.

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
        role: user.role,
        tenantId: user.tenantId,
        supplierProfileId: user.supplierProfile?.id || null,
        supplierStatus: user.supplierProfile?.status || null,
        requireDocuments: user.supplierProfile?.requireDocuments || false,
        firstLogin: user.firstLogin,
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
