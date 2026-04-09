// app/api/suppliers/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { rateLimit, getClientIP, rateLimitResponse } from '../../lib/rateLimit';

const prisma = new PrismaClient();

// Función para obtener proveedores, filtrando por estado
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // Permite filtrar por ej: /api/suppliers?status=PENDING

    const { searchParams: sp } = new URL(request.url);
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') || '100', 10)));

    const where = { status: status ? { equals: status as any } : undefined };

    const [suppliers, total] = await Promise.all([
      prisma.supplierProfile.findMany({
        where,
        include: {
          user: { select: { name: true, email: true } },
          documents: true,
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.supplierProfile.count({ where }),
    ]);

    return NextResponse.json(
      { data: suppliers, total, page, limit, totalPages: Math.ceil(total / limit) },
      { status: 200 }
    );

  } catch (error) {
    console.error('Error fetching suppliers:', error);
    return NextResponse.json(
      { message: 'Error al obtener los proveedores.' },
      { status: 500 }
    );
  }
}

// POST: Invitación de nuevo proveedor (solo Email y Nombre)
export async function POST(request: Request) {
  // Rate limit: 20 invitaciones por IP cada hora
  const ip = getClientIP(request);
  const rl = rateLimit(`invite-supplier:${ip}`, 20, 60 * 60 * 1000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterSec);

  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
    }
    const tokenAdmin = authHeader.split(' ')[1];
    const decodedToken = jwt.verify(tokenAdmin, process.env.JWT_SECRET!) as { userId: string, role: string, tenantId: string };

    if (decodedToken.role !== 'TENANT_ADMIN' && decodedToken.role !== 'ADMIN') {
      return NextResponse.json({ message: 'No tienes permisos para invitar proveedores' }, { status: 403 });
    }

    const body = await request.json();
    const { email, name, subsidiaryId, requireDocuments = false } = body;

    if (!email || !name) {
      return NextResponse.json({ message: 'Email y Nombre son requeridos' }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ message: 'Este correo ya está registrado en el sistema.' }, { status: 409 });
    }

    // Usar la subsidiaria indicada; si no se envió, tomar la primera del tenant como fallback
    let subsidiary = subsidiaryId
      ? await prisma.subsidiary.findFirst({ where: { id: subsidiaryId, tenantId: decodedToken.tenantId } })
      : await prisma.subsidiary.findFirst({ where: { tenantId: decodedToken.tenantId } });

    if (!subsidiary) {
      return NextResponse.json({ message: 'Subsidiaria no encontrada. Verifica la configuración.' }, { status: 400 });
    }

    // Crear usuario con password temporal aleatoria
    const tempPassword = Math.random().toString(36).slice(-10);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const newUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name,
          password: hashedPassword,
          role: 'SUPPLIER',
          tenant: { connect: { id: decodedToken.tenantId } },
          firstLogin: true // Forzará cambio de contraseña
        }
      });

      await tx.supplierProfile.create({
        data: {
          companyName: name,
          rfc: `INVITE-${Date.now()}`,
          taxAddress: 'Pendiente de completar',
          status: 'PENDING',
          requireDocuments: Boolean(requireDocuments),
          user: { connect: { id: user.id } },
          subsidiary: { connect: { id: subsidiary.id } },
          tenant: { connect: { id: decodedToken.tenantId } }
        }
      });

      return user;
    });

    // Generar token para el enlace de "Establecer contraseña"
    const inviteToken = jwt.sign(
      { userId: newUser.id },
      process.env.JWT_SECRET!,
      { expiresIn: '72h' }
    );

    // En una app real, aquí enviaríamos el correo con el inviteToken.
    // Por ahora devolvemos el token y la tempPassword para que el admin los vea.
    return NextResponse.json({
      message: 'Proveedor invitado exitosamente.',
      inviteToken,
      tempPassword, // En producción no se enviaría esto así
      userId: newUser.id
    }, { status: 201 });

  } catch (error) {
    console.error('Error inviting supplier:', error);
    return NextResponse.json({ message: 'Error al invitar al proveedor.' }, { status: 500 });
  }
}
