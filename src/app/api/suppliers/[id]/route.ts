// app/api/suppliers/[id]/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

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
    const { status, companyName, rfc, contactName } = body;

    let dataToUpdate: any = {};
    if (status) dataToUpdate.status = status;
    if (companyName) dataToUpdate.companyName = companyName;
    if (rfc) dataToUpdate.rfc = rfc.toUpperCase().trim();

    // Actualizamos primero el perfil del proveedor
    const updatedProfile = await prisma.supplierProfile.update({
      where: { id },
      data: dataToUpdate,
      include: { user: true }
    });

    // Si se envió un nuevo nombre de contacto, actualizamos al usuario
    if (contactName && updatedProfile.userId) {
      await prisma.user.update({
        where: { id: updatedProfile.userId },
        data: { name: contactName }
      });
      updatedProfile.user.name = contactName;
    }

    return NextResponse.json(
      { message: 'Proveedor actualizado correctamente.', supplierProfile: updatedProfile },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating supplier profile:', error);
    return NextResponse.json({ message: 'Error interno al actualizar proveedor.' }, { status: 500 });
  }
}
