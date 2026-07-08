// app/api/operators/[id]/assignments/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import jwt from 'jsonwebtoken';

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

// GET /api/operators/[id]/assignments — ver proveedores asignados
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = requireAdmin(request);
  if (!admin) return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });

  const { id } = await params;

  const assignments = await prisma.operatorAssignment.findMany({
    where: { operatorId: id, tenantId: admin.tenantId },
    include: {
      supplierProfile: {
        select: { id: true, companyName: true, rfc: true, status: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(assignments);
}

// POST /api/operators/[id]/assignments — asignar proveedor al cargador
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = requireAdmin(request);
  if (!admin) return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });

  const { id: operatorId } = await params;
  const { supplierProfileId } = await request.json();

  if (!supplierProfileId) {
    return NextResponse.json({ message: 'supplierProfileId es requerido.' }, { status: 400 });
  }

  // Validar que el cargador pertenece al tenant
  const operator = await prisma.user.findFirst({
    where: { id: operatorId, tenantId: admin.tenantId, role: 'CARGADOR' },
  });
  if (!operator) return NextResponse.json({ message: 'Cargador no encontrado.' }, { status: 404 });

  // Validar que el proveedor pertenece al tenant
  const supplier = await prisma.supplierProfile.findFirst({
    where: { id: supplierProfileId, tenantId: admin.tenantId },
  });
  if (!supplier) return NextResponse.json({ message: 'Proveedor no encontrado.' }, { status: 404 });

  const assignment = await prisma.operatorAssignment.upsert({
    where: { operatorId_supplierProfileId: { operatorId, supplierProfileId } },
    create: { operatorId, supplierProfileId, tenantId: admin.tenantId },
    update: {},
    include: {
      supplierProfile: { select: { id: true, companyName: true, rfc: true } },
    },
  });

  return NextResponse.json(assignment, { status: 201 });
}

// DELETE /api/operators/[id]/assignments — quitar proveedor del cargador
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = requireAdmin(request);
  if (!admin) return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });

  const { id: operatorId } = await params;
  const { supplierProfileId } = await request.json();

  await prisma.operatorAssignment.deleteMany({
    where: { operatorId, supplierProfileId, tenantId: admin.tenantId },
  });

  return NextResponse.json({ message: 'Asignación eliminada.' });
}
