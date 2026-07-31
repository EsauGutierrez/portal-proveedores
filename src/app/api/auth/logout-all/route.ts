// POST /api/auth/logout-all
// Invalida TODOS los JWT activos del usuario autenticado (incluida la sesión
// actual), incrementando su tokenVersion. Útil si el usuario sospecha que su
// cuenta fue comprometida (dispositivo perdido, sesión abierta en equipo ajeno, etc.).
// No requiere contraseña porque solo actúa sobre el propio usuario del token.

import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireAuth } from '../../../lib/auth';

export async function POST(request: Request) {
  const { decoded, error } = await requireAuth(request);
  if (error) return error;

  await prisma.user.update({
    where: { id: decoded.userId },
    data: { tokenVersion: { increment: 1 } },
  });

  return NextResponse.json({ message: 'Se cerraron todas tus sesiones activas.' }, { status: 200 });
}
