// app/api/suppliers/[id]/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// GET: Obtener los datos de un perfil de proveedor específico por su ID
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supplierProfile = await prisma.supplierProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        documents: true,
      },
    });

    if (!supplierProfile) {
      return NextResponse.json({ message: 'Proveedor no encontrado.' }, { status: 404 });
    }

    return NextResponse.json(supplierProfile);
  } catch (error) {
    console.error('Error fetching supplier profile:', error);
    return NextResponse.json({ message: 'Error al obtener el perfil del proveedor.' }, { status: 500 });
  }
}

// PATCH: Actualizar datos de un proveedor o inhabilitarlo
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, companyName, rfc, contactName, email, password } = body;

    // Primero obtenemos el perfil para conocer el userId y tenantId asociados
    const currentProfile = await prisma.supplierProfile.findUnique({
      where: { id },
      select: { userId: true, tenantId: true }
    });

    if (!currentProfile || !currentProfile.userId) {
      return NextResponse.json({ message: 'Proveedor o usuario no encontrado.' }, { status: 404 });
    }

    let userDataToUpdate: any = {};
    if (contactName) userDataToUpdate.name = contactName;

    if (email) {
      const normalizedEmail = email.trim().toLowerCase();

      const existingEmailUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true }
      });

      if (existingEmailUser && existingEmailUser.id !== currentProfile.userId) {
        return NextResponse.json(
          { message: `El correo '${normalizedEmail}' ya está siendo usado por otro usuario.` },
          { status: 409 }
        );
      }
      userDataToUpdate.email = normalizedEmail;
    }

    if (password && password.trim() !== '') {
      userDataToUpdate.password = await bcrypt.hash(password, 10);
    }

    let dataToUpdate: any = {};
    if (status) dataToUpdate.status = status;
    if (companyName) dataToUpdate.companyName = companyName;

    if (rfc) {
      const normalizedRfc = rfc.toUpperCase().trim();

      // XAXX010101000 y XEXX010101000 son RFC genéricos del SAT — pueden repetirse
      const isGenericRfc = ['XAXX010101000', 'XEXX010101000'].includes(normalizedRfc);

      if (!isGenericRfc) {
        const existingRfc = await prisma.supplierProfile.findFirst({
          where: {
            tenantId: currentProfile.tenantId,
            rfc: normalizedRfc,
            NOT: { id }
          },
          select: { id: true }
        });

        if (existingRfc) {
          return NextResponse.json(
            { message: `El RFC '${normalizedRfc}' ya está registrado para otro proveedor en este tenant.` },
            { status: 409 }
          );
        }
      }

      dataToUpdate.rfc = normalizedRfc;
    }

    const transactionQueries = [];

    if (Object.keys(userDataToUpdate).length > 0) {
      transactionQueries.push(
        prisma.user.update({
          where: { id: currentProfile.userId },
          data: userDataToUpdate
        })
      );
    }

    if (Object.keys(dataToUpdate).length > 0) {
      transactionQueries.push(
        prisma.supplierProfile.update({
          where: { id },
          data: dataToUpdate,
          include: { user: true }
        })
      );
    }

    const results = await prisma.$transaction([
      ...transactionQueries,
      prisma.supplierProfile.findUnique({ where: { id }, include: { user: true } })
    ]);

    const finalProfile = results[results.length - 1];

    return NextResponse.json(
      { message: 'Proveedor actualizado correctamente.', supplierProfile: finalProfile },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error updating supplier profile:', error);

    // Prisma unique constraint violation
    if (error?.code === 'P2002') {
      const field = error?.meta?.target?.join(', ') ?? 'campo';
      return NextResponse.json(
        { message: `Ya existe un registro con el mismo valor en: ${field}.` },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { message: error?.message ?? 'Error interno al actualizar proveedor.' },
      { status: 500 }
    );
  }
}
