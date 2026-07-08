// app/api/operators/[id]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireAuth } from '../../../lib/auth';

// PATCH /api/operators/[id] — actualizar nombre y/o email
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { decoded, error } = requireAuth(request, ['TENANT_ADMIN', 'SUPERADMIN']);
  if (error) return error;

  const { id } = await params;
  const { name, email } = await request.json();

  const operator = await prisma.user.findFirst({
    where: { id, tenantId: decoded.tenantId, role: 'CARGADOR' },
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
  const { decoded, error } = requireAuth(request, ['TENANT_ADMIN', 'SUPERADMIN']);
  if (error) return error;

  const { id } = await params;

  const operator = await prisma.user.findFirst({
    where: { id, tenantId: decoded.tenantId, role: 'CARGADOR' },
  });
  if (!operator) return NextResponse.json({ message: 'Cargador no encontrado.' }, { status: 404 });

  await prisma.operatorAssignment.deleteMany({ where: { operatorId: id } });
  await prisma.user.delete({ where: { id } });

  return NextResponse.json({ message: 'Cargador eliminado.' });
}
