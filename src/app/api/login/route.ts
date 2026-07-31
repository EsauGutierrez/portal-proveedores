// app/api/login/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { rateLimit, getClientIP, rateLimitResponse } from '../../lib/rateLimit';

// Umbrales de bloqueo por cuenta (escalonado)
function getLockoutDuration(failedAttempts: number): number | null {
  if (failedAttempts >= 20) return 24 * 60 * 60 * 1000; // 24 horas
  if (failedAttempts >= 10) return 60 * 60 * 1000;       // 1 hora
  if (failedAttempts >= 5)  return 15 * 60 * 1000;       // 15 minutos
  return null;
}

export async function POST(request: Request) {
  // Capa 1: Rate limit por IP (frena scraping masivo desde una sola IP)
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
        supplierProfile: true,
        tenant: true,
        operatorAssignments: {
          select: { supplierProfileId: true },
        },
      },
    });

    // 3. Validar si el usuario existe y tiene contraseña
    if (!user || !user.password) {
      return NextResponse.json(
        { message: 'Credenciales inválidas.' },
        { status: 401 }
      );
    }

    // Capa 2: Lockout por cuenta — inmune a rotación de IPs
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const retryAfterSec = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
      const minutes = Math.ceil(retryAfterSec / 60);
      return NextResponse.json(
        { message: `Cuenta bloqueada temporalmente por múltiples intentos fallidos. Intenta de nuevo en ${minutes} minuto(s).` },
        { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
      );
    }

    // 4. Lógica de autorización basada en el rol
    const now = new Date();
    const expiresAt = user.tenant?.subscriptionExpiresAt ? new Date(user.tenant.subscriptionExpiresAt) : null;
    const gracePeriodEnd = expiresAt ? new Date(expiresAt.getTime() + 7 * 24 * 60 * 60 * 1000) : null;
    const isExpired = expiresAt !== null && now > expiresAt;
    const isInGrace = isExpired && gracePeriodEnd !== null && now <= gracePeriodEnd;
    const isPastGrace = isExpired && !isInGrace;

    if (user.role === 'SUPPLIER') {
      if (user.supplierProfile?.status === 'REJECTED') {
        return NextResponse.json(
          { message: 'Tu cuenta ha sido rechazada. Contacta a tu administrador.' },
          { status: 403 }
        );
      }

      if (user.tenant && !user.tenant.isActive) {
        return NextResponse.json(
          { message: 'El acceso al portal de esta empresa está suspendido.' },
          { status: 403 }
        );
      }

      if (isExpired) {
        const contactInfo = user.tenant?.supportEmail
          ? `Para más información contacta a: ${user.tenant.supportEmail}`
          : 'Por favor contacta a tu administrador para más información.';
        return NextResponse.json(
          { message: `El servicio se encuentra temporalmente en mantenimiento. ${contactInfo}`, errorCode: 'SERVICE_UNAVAILABLE' },
          { status: 403 }
        );
      }
    } else if (user.role === 'CARGADOR') {
      if (!user.tenant?.isActive) {
        return NextResponse.json(
          { message: 'El acceso al portal de esta empresa está suspendido.' },
          { status: 403 }
        );
      }
    } else if (user.role === 'TENANT_ADMIN') {
      if (!user.tenant?.isActive) {
        return NextResponse.json(
          { message: 'La cuenta de tu empresa está suspendida. Contacta a soporte.' },
          { status: 403 }
        );
      }

      if (isPastGrace) {
        return NextResponse.json(
          { message: 'El acceso ha sido suspendido por vencimiento de suscripción. Por favor contacta a IMR para renovar.', errorCode: 'SUBSCRIPTION_EXPIRED' },
          { status: 403 }
        );
      }
    }
    // Si el rol es 'SUPERADMIN', tiene acceso global y no se hacen estas verificaciones.

    // 5. Comparar la contraseña proporcionada con la guardada (hasheada)
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      const newCount = user.failedLoginAttempts + 1;
      const lockMs = getLockoutDuration(newCount);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: newCount,
          lockedUntil: lockMs ? new Date(Date.now() + lockMs) : undefined,
        },
      });

      if (lockMs) {
        const minutes = Math.ceil(lockMs / 60000);
        return NextResponse.json(
          { message: `Demasiados intentos fallidos. Cuenta bloqueada por ${minutes} minuto(s).` },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { message: 'Credenciales inválidas.' },
        { status: 401 }
      );
    }

    // Contraseña correcta: limpiar contador de intentos fallidos
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    // 6. Generar un JSON Web Token (JWT)
    const assignedSupplierIds = user.role === 'CARGADOR'
      ? user.operatorAssignments.map(a => a.supplierProfileId)
      : [];

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
        bulkUploadForSuppliers: user.tenant?.bulkUploadForSuppliers || false,
        bulkPaymentForSuppliers: user.tenant?.bulkPaymentForSuppliers || false,
        firstLogin: user.firstLogin,
        subscriptionWarning: isInGrace,
        assignedSupplierIds,
        tokenVersion: user.tokenVersion,
      },
      process.env.JWT_SECRET!,
      {
        // TTL corto + tokenVersion: reduce la ventana de una sesión robada y permite
        // invalidar todos los tokens de un usuario (logout global) sin más infraestructura.
        expiresIn: '8h',
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
