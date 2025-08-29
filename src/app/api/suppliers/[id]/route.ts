// app/api/suppliers/[id]/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// GET: Obtener los datos de un perfil de proveedor específico por su ID
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;

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
