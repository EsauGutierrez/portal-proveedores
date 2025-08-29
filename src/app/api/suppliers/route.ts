// app/api/suppliers/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

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
