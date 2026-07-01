// app/api/documents/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';
import jwt from 'jsonwebtoken';
import { uploadFileToS3, getPresignedUrl } from '../../lib/s3';
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png']);

async function validateUploadedFile(file: File): Promise<string | null> {
  if (file.size > MAX_FILE_SIZE) {
    return `El archivo no puede superar los ${MAX_FILE_SIZE_MB} MB.`;
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return 'Tipo de archivo no permitido. Solo se aceptan PDF, JPG y PNG.';
  }
  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '');
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return 'Extensión no permitida. Solo se aceptan .pdf, .jpg, .jpeg y .png.';
  }
  // Verificación de magic bytes para evitar spoofing de MIME type
  const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const isPDF  = header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46;
  const isJPEG = header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF;
  const isPNG  = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47;
  if (!isPDF && !isJPEG && !isPNG) {
    return 'El contenido del archivo no corresponde a un formato válido (PDF, JPG o PNG).';
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
    }
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET!) as {
      userId: string;
      role: string;
    };

    const url = new URL(request.url);
    const supplierProfileIdParam = url.searchParams.get('supplierProfileId');

    let supplierProfileId: string;

    if (decoded.role === 'CARGADOR') {
      if (!supplierProfileIdParam) {
        return NextResponse.json(
          { message: 'Se requiere el ID del perfil de proveedor.' },
          { status: 400 }
        );
      }
      // Verificar asignación del CARGADOR
      const assignment = await prisma.operatorAssignment.findFirst({
        where: { operatorId: decoded.userId, supplierProfileId: supplierProfileIdParam },
      });
      if (!assignment) {
        return NextResponse.json(
          { message: 'No tienes acceso a los documentos de este proveedor.' },
          { status: 403 }
        );
      }
      supplierProfileId = supplierProfileIdParam;
    } else {
      // SUPPLIER: usa su propio perfil
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: { supplierProfile: true },
      });
      if (!user?.supplierProfile) {
        return NextResponse.json({ message: 'Perfil de proveedor no encontrado.' }, { status: 404 });
      }
      supplierProfileId = user.supplierProfile.id;
    }

    const supplierProfile = await prisma.supplierProfile.findUnique({
      where: { id: supplierProfileId },
      include: { documents: true },
    });

    if (!supplierProfile) {
      return NextResponse.json({ message: 'Perfil de proveedor no encontrado.' }, { status: 404 });
    }

    const docs = await Promise.all(
      supplierProfile.documents.map(async (doc) => ({
        ...doc,
        fileUrl: doc.fileUrl ? await getPresignedUrl(doc.fileUrl) : null,
      }))
    );

    return NextResponse.json(docs);
  } catch (error) {
    console.error('Error al obtener documentos del proveedor:', error);
    return NextResponse.json({ message: 'Error interno del servidor.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    // 1. Autenticación del usuario
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string;
      role: string;
      assignedSupplierIds?: string[];
    };
    const { userId, role } = decodedToken;

    // 2. Obtener datos del formulario
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const documentType = formData.get('documentType') as string;
    const supplierProfileIdParam = formData.get('supplierProfileId') as string | null;

    if (!file || !documentType) {
      return NextResponse.json({ message: 'Faltan datos requeridos (archivo y tipo de documento).' }, { status: 400 });
    }

    const fileError = await validateUploadedFile(file);
    if (fileError) {
      return NextResponse.json({ message: fileError }, { status: 400 });
    }

    // 3. Determinar y validar el perfil del proveedor según el rol
    let supplierProfileId: string;

    if (role === 'CARGADOR') {
      // El CARGADOR debe enviar el supplierProfileId del proveedor al que carga
      if (!supplierProfileIdParam) {
        return NextResponse.json(
          { message: 'Se requiere el ID del perfil de proveedor para cargar documentos.' },
          { status: 400 }
        );
      }
      // Verificar que el CARGADOR tiene asignado a ese proveedor
      const assignment = await prisma.operatorAssignment.findFirst({
        where: { operatorId: userId, supplierProfileId: supplierProfileIdParam },
      });
      if (!assignment) {
        return NextResponse.json(
          { message: 'No tienes permiso para cargar documentos para este proveedor.' },
          { status: 403 }
        );
      }
      supplierProfileId = supplierProfileIdParam;
    } else {
      // SUPPLIER: usa su propio perfil
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { supplierProfile: true },
      });

      if (!user?.supplierProfile) {
        return NextResponse.json({ message: 'Perfil de proveedor no encontrado.' }, { status: 404 });
      }
      supplierProfileId = user.supplierProfile.id;
    }

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

export async function DELETE(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    const { userId } = decodedToken;

    const url = new URL(request.url);
    const documentType = url.searchParams.get('documentType');

    if (!documentType) {
      return NextResponse.json({ message: 'Falta el tipo de documento.' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { supplierProfile: true },
    });

    if (!user?.supplierProfile) {
      return NextResponse.json({ message: 'Perfil no encontrado.' }, { status: 404 });
    }

    const document = await prisma.supplierDocument.findUnique({
      where: {
        supplierProfileId_documentType: {
          supplierProfileId: user.supplierProfile.id,
          documentType,
        },
      },
    });

    if (document) {
      await prisma.supplierDocument.delete({
        where: { id: document.id },
      });
    }

    return NextResponse.json({ message: 'Documento eliminado exitosamente.' }, { status: 200 });
  } catch (error) {
    console.error('Error al eliminar el documento:', error);
    return NextResponse.json({ message: 'Error al eliminar el documento.' }, { status: 500 });
  }
}
