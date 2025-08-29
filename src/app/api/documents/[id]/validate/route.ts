// app/api/documents/[id]/validate/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient, DocumentStatus } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Autenticar y autorizar al administrador
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string, role: string };

    if (decodedToken.role !== 'ADMIN') {
      return NextResponse.json({ message: 'Acceso denegado: Se requiere rol de administrador.' }, { status: 403 });
    }

    // 2. Obtener datos de la petición
    const documentId = params.id;
    const body = await request.json();
    const { status } = body;

    // 3. Validar el nuevo estado
    if (!status || !Object.values(DocumentStatus).includes(status)) {
      return NextResponse.json({ message: 'El estado proporcionado es inválido.' }, { status: 400 });
    }

    // 4. Actualizar el estado del documento en la base de datos
    const updatedDocument = await prisma.supplierDocument.update({
      where: { id: documentId },
      data: { status },
    });

    return NextResponse.json(updatedDocument, { status: 200 });

  } catch (error) {
    console.error('Error al validar el documento:', error);
    if ((error as any).code === 'P2025') {
        return NextResponse.json({ message: 'Documento no encontrado.' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Error al procesar la solicitud.' }, { status: 500 });
  }
}
