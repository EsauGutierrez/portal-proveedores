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

    // Primero obtenemos el perfil para conocer el userId asociado
    const currentProfile = await prisma.supplierProfile.findUnique({
      where: { id },
      select: { userId: true }
    });

    if (!currentProfile || !currentProfile.userId) {
      return NextResponse.json({ message: 'Proveedor o usuario no encontrado.' }, { status: 404 });
    }

    let userDataToUpdate: any = {};
    if (contactName) userDataToUpdate.name = contactName;

    if (email) {
      const normalizedEmail = email.trim().toLowerCase();
      
      // Validar si el correo ya está en uso por otro usuario
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
    if (rfc) dataToUpdate.rfc = rfc.toUpperCase().trim();

    // Actualizamos el usuario (si es necesario) y el perfil en una transacción
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

    // Si no enviaron nada para perfil (ej. solo email), obligamos a pedir el nuevo estado del perfil
    const results = await prisma.$transaction([
      ...transactionQueries,
      prisma.supplierProfile.findUnique({ where: { id }, include: { user: true } })
    ]);

    const finalProfile = results[results.length - 1];

    return NextResponse.json(
      { message: 'Proveedor actualizado correctamente.', supplierProfile: finalProfile },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating supplier profile:', error);
    return NextResponse.json({ message: 'Error interno al actualizar proveedor.' }, { status: 500 });
  }
}
