// app/api/operators/[id]/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

function requireAdmin(request: Request): { userId: string; tenantId: string } | null {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET!) as any;
    if (!['TENANT_ADMIN', 'SUPERADMIN'].includes(decoded.role)) return null;
    return { userId: decoded.userId, tenantId: decoded.tenantId };
  } catch {
    return null;
  }
}

// PATCH /api/operators/[id] — actualizar nombre y/o email
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = requireAdmin(request);
  if (!admin) return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });

  const { id } = await params;
  const { name, email } = await request.json();

  const operator = await prisma.user.findFirst({
    where: { id, tenantId: admin.tenantId, role: 'CARGADOR' },
  });
  if (!operator) return NextResponse.json({ message: 'Cargador no encontrado.' }, { status: 404 });

  // Verificar que el nuevo email no esté en uso por otro usuario
  if (email && email !== operator.email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ message: 'Ese email ya está en uso por otro usuario.' }, { status: 409 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
    },
    select: { id: true, name: true, email: true },
  });

  return NextResponse.json(updated);
}

// DELETE /api/operators/[id] — eliminar cargador y sus asignaciones
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = requireAdmin(request);
  if (!admin) return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });

  const { id } = await params;

  const operator = await prisma.user.findFirst({
    where: { id, tenantId: admin.tenantId, role: 'CARGADOR' },
  });
  if (!operator) return NextResponse.json({ message: 'Cargador no encontrado.' }, { status: 404 });

  await prisma.operatorAssignment.deleteMany({ where: { operatorId: id } });
  await prisma.user.delete({ where: { id } });

  return NextResponse.json({ message: 'Cargador eliminado.' });
}
