// app/api/operators/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

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

// GET /api/operators — listar cargadores del tenant
export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });

  const operators = await prisma.user.findMany({
    where: { tenantId: admin.tenantId, role: 'CARGADOR' },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      operatorAssignments: {
        select: {
          id: true,
          supplierProfile: { select: { id: true, companyName: true, rfc: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(operators);
}

// POST /api/operators — crear cargador
export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin) return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });

  const { name, email, password } = await request.json();
  if (!name || !email || !password) {
    return NextResponse.json({ message: 'Nombre, email y contraseña son requeridos.' }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ message: 'Ya existe un usuario con ese email.' }, { status: 409 });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const operator = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role: 'CARGADOR',
      tenantId: admin.tenantId,
      firstLogin: false,
    },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  return NextResponse.json(operator, { status: 201 });
}
