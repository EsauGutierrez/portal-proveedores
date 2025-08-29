// app/api/subsidiaries/[id]/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// PATCH: Actualizar campos específicos de una subsidiaria, como su estado.
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    const body = await request.json();
    const { isActive } = body;

    // Validación para asegurar que solo se actualice el estado
    if (typeof isActive !== 'boolean') {
      return NextResponse.json(
        { message: 'El campo "isActive" es requerido y debe ser un valor booleano.' },
        { status: 400 }
      );
    }

    const updatedSubsidiary = await prisma.subsidiary.update({
      where: { id },
      data: { isActive },
    });

    return NextResponse.json(updatedSubsidiary);
  } catch (error) {
    console.error('Error updating subsidiary:', error);
    // Manejo de error si la subsidiaria no se encuentra
    if ((error as any).code === 'P2025') {
        return NextResponse.json({ message: 'Subsidiaria no encontrada.' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Error al actualizar la subsidiaria' }, { status: 500 });
  }
}
