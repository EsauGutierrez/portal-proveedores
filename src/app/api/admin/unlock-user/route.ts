import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

// PATCH /api/admin/unlock-user — desbloquea una cuenta bloqueada por intentos fallidos
// Solo accesible por TENANT_ADMIN y SUPERADMIN
export async function PATCH(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    let decoded: { userId: string; role: string; tenantId?: string };
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET!) as typeof decoded;
    } catch {
      return NextResponse.json({ message: 'Token inválido.' }, { status: 401 });
    }

    if (decoded.role !== 'TENANT_ADMIN' && decoded.role !== 'SUPERADMIN') {
      return NextResponse.json({ message: 'Sin permisos.' }, { status: 403 });
    }

    const { userId } = await request.json();
    if (!userId) {
      return NextResponse.json({ message: 'userId requerido.' }, { status: 400 });
    }

    // TENANT_ADMIN solo puede desbloquear usuarios de su propio tenant
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, tenantId: true, email: true },
    });

    if (!target) {
      return NextResponse.json({ message: 'Usuario no encontrado.' }, { status: 404 });
    }

    if (decoded.role === 'TENANT_ADMIN' && target.tenantId !== decoded.tenantId) {
      return NextResponse.json({ message: 'Sin permisos.' }, { status: 403 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });

    return NextResponse.json({ message: `Cuenta ${target.email} desbloqueada correctamente.` });
  } catch (error) {
    console.error('Error al desbloquear usuario:', error);
    return NextResponse.json({ message: 'Error interno.' }, { status: 500 });
  }
}
