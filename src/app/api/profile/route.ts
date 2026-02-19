// app/api/profile/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

export async function GET(request: Request) {
  try {
    // 1. Obtener y verificar el token de autorización
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'No autorizado: Token no proporcionado.' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];

    let decodedToken: { userId: string };
    try {
      decodedToken = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    } catch (error) {
      return NextResponse.json({ message: 'No autorizado: Token inválido.' }, { status: 401 });
    }
    const { userId } = decodedToken;

    // 2. Buscar al usuario y su perfil de proveedor asociado
    const userProfile = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        // CAMBIO: Ahora incluimos los documentos del proveedor
        supplierProfile: {
          include: {
            subsidiary: true,
            documents: true, // <-- Se añade esta línea
          },
        },
      },
    });

    if (!userProfile) {
      return NextResponse.json({ message: 'Perfil no encontrado.' }, { status: 404 });
    }

    // 3. Excluimos la contraseña de la respuesta
    const { password, ...profileData } = userProfile;

    return NextResponse.json(profileData, { status: 200 });

  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json(
      { message: 'Error al obtener los datos del perfil.' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'No autorizado: Token no proporcionado.' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];

    let decodedToken: { userId: string };
    try {
      decodedToken = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    } catch (error) {
      return NextResponse.json({ message: 'No autorizado: Token inválido.' }, { status: 401 });
    }
    const { userId } = decodedToken;

    const data = await request.json();
    const { companyName, rfc, taxAddress } = data;

    if (!companyName || !rfc || !taxAddress) {
      return NextResponse.json({ message: 'Faltan datos requeridos (Razón Social, RFC, Dirección Fiscal).' }, { status: 400 });
    }

    const updatedProfile = await prisma.supplierProfile.update({
      where: { userId },
      data: {
        companyName,
        rfc,
        taxAddress,
      },
    });

    return NextResponse.json(updatedProfile, { status: 200 });

  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json(
      { message: 'Error al actualizar los datos del perfil.' },
      { status: 500 }
    );
  }
}
