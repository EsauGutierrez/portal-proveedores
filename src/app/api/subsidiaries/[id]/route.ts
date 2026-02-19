// app/api/subsidiaries/[id]/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// PATCH: Actualizar campos específicos de una subsidiaria, como su estado.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

// PUT: Actualizar toda la información de la subsidiaria
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const formData = await request.formData();

    const name = formData.get('name') as string;
    const rfc = formData.get('rfc') as string;
    const businessName = formData.get('businessName') as string;
    const taxRegime = formData.get('taxRegime') as string;
    const taxAddress = formData.get('taxAddress') as string;
    const logo = formData.get('logo') as File | null;

    if (!name || !rfc || !businessName || !taxRegime || !taxAddress) {
      return NextResponse.json({ message: 'Todos los campos son requeridos' }, { status: 400 });
    }

    let updateData: any = {
      name,
      rfc,
      businessName,
      taxRegime,
      taxAddress,
    };

    if (logo && typeof logo !== 'string') {
      console.log('Subiendo nuevo logo:', logo.name);
      updateData.logoUrl = `https://storage.example.com/logos/${Date.now()}-${logo.name}`;
    }

    const updatedSubsidiary = await prisma.subsidiary.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updatedSubsidiary);
  } catch (error) {
    console.error('Error updating subsidiary details:', error);
    if ((error as any).code === 'P2025') {
      return NextResponse.json({ message: 'Subsidiaria no encontrada.' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Error al actualizar la subsidiaria' }, { status: 500 });
  }
}
