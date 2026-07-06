// app/api/operators/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { requireAuth } from '../../lib/auth';
import { isValidPassword, PASSWORD_POLICY_MESSAGE } from '../../lib/passwordPolicy';

const prisma = new PrismaClient();

// GET /api/operators — listar cargadores del tenant
export async function GET(request: Request) {
  const { decoded, error } = requireAuth(request, ['TENANT_ADMIN', 'SUPERADMIN']);
  if (error) return error;

  const operators = await prisma.user.findMany({
    where: { tenantId: decoded.tenantId, role: 'CARGADOR' },
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
  const { decoded, error } = requireAuth(request, ['TENANT_ADMIN', 'SUPERADMIN']);
  if (error) return error;

  const { name, email, password } = await request.json();
  if (!name || !email || !password) {
    return NextResponse.json({ message: 'Nombre, email y contraseña son requeridos.' }, { status: 400 });
  }

  if (!isValidPassword(password)) {
    return NextResponse.json({ message: PASSWORD_POLICY_MESSAGE }, { status: 400 });
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
      tenantId: decoded.tenantId,
      firstLogin: false,
    },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  return NextResponse.json(operator, { status: 201 });
}
