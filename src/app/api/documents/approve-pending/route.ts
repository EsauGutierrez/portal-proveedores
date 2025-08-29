// app/api/documents/approve-pending/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

// Esta API crea un registro de documento con estado 'APPROVED' sin necesidad de un archivo.
export async function POST(request: Request) {
  try {
    // 1. Autenticar y autorizar al administrador
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string, role: string };

    if (decodedToken.role !== 'ADMIN') {
      return NextResponse.json({ message: 'Acceso denegado.' }, { status: 403 });
    }

    // 2. Obtener datos de la petición
    const body = await request.json();
    const { supplierProfileId, documentType } = body;

    if (!supplierProfileId || !documentType) {
      return NextResponse.json({ message: 'Faltan datos requeridos.' }, { status: 400 });
    }

    // 3. Crear el registro del documento con estado APROBADO
    const document = await prisma.supplierDocument.create({
      data: {
        documentType,
        fileName: 'Aprobado sin archivo',
        fileUrl: '', // URL vacía ya que no hay archivo
        status: 'APPROVED',
        supplierProfile: {
          connect: { id: supplierProfileId },
        },
      },
    });

    return NextResponse.json(document, { status: 201 });

  } catch (error) {
    console.error('Error al aprobar documento pendiente:', error);
    if ((error as any).code === 'P2002') {
        return NextResponse.json({ message: 'Este tipo de documento ya existe para el proveedor.' }, { status: 409 });
    }
    return NextResponse.json({ message: 'Error al procesar la solicitud.' }, { status: 500 });
  }
}
