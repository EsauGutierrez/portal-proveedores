// app/api/subsidiaries/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// GET: Obtener todas las subsidiarias
export async function GET() {
  try {
    const subsidiaries = await prisma.subsidiary.findMany({
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(subsidiaries);
  } catch (error) {
    console.error('Error fetching subsidiaries:', error);
    return NextResponse.json({ message: 'Error al obtener las subsidiarias' }, { status: 500 });
  }
}

// POST: Crear una nueva subsidiaria
export async function POST(request: Request) {
  try {
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

    // Simulación de subida de logo
    let logoUrl = 'https://placehold.co/100x40/E2E8F0/4A5568?text=Logo';
    if (logo) {
      // En una app real, aquí iría la lógica para subir a AWS S3 y obtener la URL
      console.log('Subiendo logo:', logo.name);
      logoUrl = `https://storage.example.com/logos/${Date.now()}-${logo.name}`;
    }

    const newSubsidiary = await prisma.subsidiary.create({
      data: {
        name,
        rfc,
        businessName,
        taxRegime,
        taxAddress,
        logoUrl,
      },
    });

    return NextResponse.json(newSubsidiary, { status: 201 });
  } catch (error) {
    console.error('Error creating subsidiary:', error);
    return NextResponse.json({ message: 'Error al crear la subsidiaria' }, { status: 500 });
  }
}
