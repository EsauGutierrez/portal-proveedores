// app/api/documents/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { uploadFileToS3 } from '../../lib/s3';
const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    // 1. Autenticación del usuario
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    const { userId } = decodedToken;

    // 2. Obtener datos del formulario
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const documentType = formData.get('documentType') as string;

    if (!file || !documentType) {
      return NextResponse.json({ message: 'Faltan datos requeridos (archivo y tipo de documento).' }, { status: 400 });
    }

    // 3. Obtener el perfil del proveedor del usuario logueado
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { supplierProfile: true },
    });

    if (!user?.supplierProfile) {
      return NextResponse.json({ message: 'Perfil de proveedor no encontrado.' }, { status: 404 });
    }
    const supplierProfileId = user.supplierProfile.id;

    // 4. Lógica para subir el archivo a un servicio de almacenamiento AWS S3
    console.log(`Subiendo archivo ${file.name} para el documento ${documentType} a S3...`);
    let fileUrl = '';

    try {
      fileUrl = await uploadFileToS3(file, `documents/${supplierProfileId}`);
    } catch (uploadError) {
      return NextResponse.json({ message: 'Error al subir el documento a S3.' }, { status: 500 });
    }

    // 5. Guardar o actualizar el registro del documento en la base de datos
    const document = await prisma.supplierDocument.upsert({
      where: {
        supplierProfileId_documentType: {
          supplierProfileId,
          documentType,
        },
      },
      update: {
        fileName: file.name,
        fileUrl,
        status: 'UPLOADED',
        uploadedAt: new Date(),
      },
      create: {
        documentType,
        fileName: file.name,
        fileUrl,
        status: 'UPLOADED',
        supplierProfile: {
          connect: { id: supplierProfileId },
        },
      },
    });

    return NextResponse.json(document, { status: 201 });

  } catch (error) {
    console.error('Error al cargar el documento:', error);
    return NextResponse.json({ message: 'Error al procesar la carga del documento.' }, { status: 500 });
  }
}
