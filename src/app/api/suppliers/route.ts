// app/api/suppliers/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

// Función para obtener proveedores, filtrando por estado
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // Permite filtrar por ej: /api/suppliers?status=PENDING

    const suppliers = await prisma.supplierProfile.findMany({
      where: {
        // Si se proporciona un estado, filtra por él. Si no, devuelve todos.
        status: status ? { equals: status as any } : undefined,
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        // CAMBIO: Se incluyen los documentos de cada proveedor
        documents: true,
      },
      orderBy: {
        createdAt: 'asc', // Muestra los más antiguos primero
      },
    });

    return NextResponse.json(suppliers, { status: 200 });

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
    const { email, name } = body;

    if (!email || !name) {
      return NextResponse.json({ message: 'Email y Nombre son requeridos' }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ message: 'Este correo ya está registrado en el sistema.' }, { status: 409 });
    }

    // Buscamos una subsidiaria para asociar al proveedor por defecto (la primera del tenant)
    const subsidiary = await prisma.subsidiary.findFirst({
      where: { tenantId: decodedToken.tenantId }
    });

    if (!subsidiary) {
      return NextResponse.json({ message: 'No hay subsidiarias configuradas para esta empresa. Crea una primero.' }, { status: 400 });
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
          companyName: name, // Placeholder hasta que lo complete
          rfc: `INVITE-${Date.now()}`, // Placeholder temporal
          taxAddress: 'Pendiente de completar',
          status: 'PENDING',
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
