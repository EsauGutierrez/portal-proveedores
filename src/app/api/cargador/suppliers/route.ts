// app/api/cargador/suppliers/route.ts
// Devuelve los proveedores asignados al CARGADOR autenticado
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

export async function GET(request: Request) {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });

  let decoded: any;
  try {
    decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET!);
  } catch {
    return NextResponse.json({ message: 'Token inválido.' }, { status: 401 });
  }

  if (decoded.role !== 'CARGADOR') {
    return NextResponse.json({ message: 'Acceso restringido a CARGADOR.' }, { status: 403 });
  }

  const assignments = await prisma.operatorAssignment.findMany({
    where: { operatorId: decoded.userId },
    include: {
      supplierProfile: {
        select: {
          id: true,
          companyName: true,
          rfc: true,
          status: true,
          subsidiaryId: true,
          userId: true,
          subsidiary: { select: { name: true, logoUrl: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json(assignments.map(a => a.supplierProfile));
}
