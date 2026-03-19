// app/api/subsidiaries/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { uploadFileToS3, getPresignedUrl } from '../../lib/s3';

const prisma = new PrismaClient();

// Expresión regular para validar formato RFC de Personas Morales (12 caracteres) o Físicas (13 caracteres)
const RFC_REGEX = /^([A-ZÑ&]{3,4})\d{6}([A-Z0-9]{3})$/i;

import jwt from 'jsonwebtoken';

// GET: Obtener las subsidiarias por Tenant
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Logica fallback para que el login/registro siga funcionando si consultan sin auth (opcional, pero mejor ser estricto)
      // De hecho, en portal-proveedores el front-end a veces no mandaba token al registrar, 
      // pero para protegerlo, si no hay token retornaremos vacío.
      return NextResponse.json([]);
    }

    const token = authHeader.split(' ')[1];
    let decodedToken: any;
    try {
      decodedToken = jwt.verify(token, process.env.JWT_SECRET!);
    } catch (err) {
      return NextResponse.json({ message: 'Token inválido' }, { status: 401 });
    }

    let queryWhere = {};

    // Si NO es Super Admin, limitamos la búsqueda al tenant en curso
    if (decodedToken.role !== 'SUPERADMIN' && decodedToken.tenantId) {
      queryWhere = { tenantId: decodedToken.tenantId };
    }

    const subsidiaries = await prisma.subsidiary.findMany({
      where: queryWhere,
      orderBy: { name: 'asc' },
    });

    // Generar presigned URLs para logos si la logoUrl es una key de S3
    const subsidiariesWithLogos = await Promise.all(
      subsidiaries.map(async (sub) => {
        if (sub.logoUrl && !sub.logoUrl.startsWith('http')) {
          const signedUrl = await getPresignedUrl(sub.logoUrl);
          return { ...sub, logoUrl: signedUrl };
        }
        return sub;
      })
    );

    return NextResponse.json(subsidiariesWithLogos);
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
    const tenantId = formData.get('tenantId') as string; // <-- Nuevo campo necesario para Multitenancy
    const logo = formData.get('logo') as File | null;

    if (!name || !rfc || !businessName || !taxRegime || !taxAddress || !tenantId) {
      return NextResponse.json({ message: 'Todos los campos y el tenantId son requeridos' }, { status: 400 });
    }

    const cleanRfc = rfc.trim().toUpperCase();

    // Validación: Formato estructural del RFC
    if (!RFC_REGEX.test(cleanRfc)) {
      return NextResponse.json({ message: 'El formato del RFC introducido no es válido. Debe contener 3 o 4 letras, seguidas de 6 números (YYMMDD) y 3 caracteres alfanuméricos (homoclave).' }, { status: 400 });
    }

    // Subida de logo a S3
    let logoUrl = 'https://placehold.co/200x80/E2E8F0/4A5568?text=Logo';
    if (logo && logo.size > 0) {
      try {
        logoUrl = await uploadFileToS3(logo, `subsidiaries/logos`);
      } catch (uploadErr) {
        console.error('Error subiendo logo a S3:', uploadErr);
      }
    }

    // Validación: Verificar que el RFC no exista ya en la base de datos
    const existingSubsidiary = await prisma.subsidiary.findFirst({
      where: { rfc: cleanRfc }
    });
    if (existingSubsidiary) {
      return NextResponse.json({ message: `El RFC ${cleanRfc} ya se encuentra registrado.` }, { status: 400 });
    }

    const newSubsidiary = await prisma.subsidiary.create({
      data: {
        name,
        rfc: cleanRfc,
        businessName,
        taxRegime,
        taxAddress,
        logoUrl,
        tenant: {
          connect: { id: tenantId }
        }
      },
    });

    return NextResponse.json(newSubsidiary, { status: 201 });
  } catch (error) {
    console.error('Error creating subsidiary:', error);
    return NextResponse.json({ message: 'Error al crear la subsidiaria' }, { status: 500 });
  }
}

// PUT: Editar una subsidiaria
export async function PUT(request: Request) {
  try {
    const formData = await request.formData();
    const id = formData.get('id') as string;
    const name = formData.get('name') as string;
    const rfc = formData.get('rfc') as string;
    const businessName = formData.get('businessName') as string;
    const taxRegime = formData.get('taxRegime') as string;
    const taxAddress = formData.get('taxAddress') as string;

    if (!id || !name || !rfc || !businessName || !taxRegime || !taxAddress) {
      return NextResponse.json({ message: 'Campos requeridos faltantes' }, { status: 400 });
    }

    const cleanRfc = rfc.trim().toUpperCase();

    // Validación: Formato estructural del RFC
    if (!RFC_REGEX.test(cleanRfc)) {
      return NextResponse.json({ message: 'El formato del RFC introducido no es válido. Debe contener 3 o 4 letras, seguidas de 6 números (YYMMDD) y 3 caracteres alfanuméricos (homoclave).' }, { status: 400 });
    }

    // Validación: Verificar que el RFC no exista en OTRA subsidiaria diferente
    const existingSubsidiary = await prisma.subsidiary.findFirst({
      where: {
        rfc: cleanRfc,
        id: { not: id } // Excluir la subsidiaria actual que estamos editando
      }
    });

    if (existingSubsidiary) {
      return NextResponse.json({ message: `El RFC ${cleanRfc} ya está siendo utilizado por otra subsidiaria.` }, { status: 400 });
    }

    const updatedSubsidiary = await prisma.subsidiary.update({
      where: { id },
      data: {
        name,
        rfc,
        businessName,
        taxRegime,
        taxAddress,
      },
    });

    return NextResponse.json(updatedSubsidiary);
  } catch (error) {
    console.error('Error updating subsidiary:', error);
    return NextResponse.json({ message: 'Error al actualizar la subsidiaria' }, { status: 500 });
  }
}

// DELETE: Eliminar una subsidiaria
export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ message: 'ID es requerido' }, { status: 400 });
    }

    await prisma.subsidiary.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Subsidiaria eliminada con éxito' });
  } catch (error) {
    console.error('Error deleting subsidiary:', error);
    return NextResponse.json({ message: 'Error al eliminar la subsidiaria' }, { status: 500 });
  }
}
