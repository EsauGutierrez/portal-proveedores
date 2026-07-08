import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import jwt from 'jsonwebtoken';
import { deleteFromS3 } from '../../../../lib/s3';

type DecodedToken = { userId: string; role: string; tenantId: string };

function extractToken(request: Request): DecodedToken {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('UNAUTHORIZED');
  return jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET!) as DecodedToken;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const decoded = extractToken(request);

    if (decoded.role !== 'TENANT_ADMIN') {
      return NextResponse.json({ message: 'Acceso denegado' }, { status: 403 });
    }

    const { id } = await params;

    // Verificar que el documento pertenece al tenant y existe
    const existing = await prisma.documentRequirement.findFirst({
      where: { id, tenantId: decoded.tenantId, isActive: true },
    });

    if (!existing) {
      return NextResponse.json({ message: 'Documento no encontrado' }, { status: 404 });
    }

    // Documentos del sistema: solo se permite cambiar isRequired
    if (existing.isSystem) {
      return NextResponse.json(
        { message: 'Los documentos del sistema no pueden editarse' },
        { status: 422 }
      );
    }

    const body = await request.json() as {
      name?: string;
      isRequired?: boolean;
      supplierType?: string;
    };

    // --- Validaciones ---
    const name = body.name?.trim() ?? '';

    if (!name) {
      return NextResponse.json({ message: 'El nombre del documento es obligatorio' }, { status: 422 });
    }
    if (name.length < 3) {
      return NextResponse.json({ message: 'El nombre debe tener al menos 3 caracteres' }, { status: 422 });
    }
    if (name.length > 100) {
      return NextResponse.json({ message: 'El nombre no puede exceder 100 caracteres' }, { status: 422 });
    }

    const validSupplierTypes = ['NATIONAL', 'FOREIGN', 'BOTH'];
    if (!body.supplierType || !validSupplierTypes.includes(body.supplierType)) {
      return NextResponse.json(
        { message: 'Debes seleccionar al menos un tipo de proveedor' },
        { status: 422 }
      );
    }

    // --- Verificar nombre duplicado excluyendo el documento actual ---
    const duplicate = await prisma.documentRequirement.findFirst({
      where: {
        tenantId: decoded.tenantId,
        isActive: true,
        name: { equals: name, mode: 'insensitive' },
        NOT: { id },
      },
    });

    if (duplicate) {
      return NextResponse.json({ message: 'Ya existe un documento con ese nombre' }, { status: 409 });
    }

    const updated = await prisma.documentRequirement.update({
      where: { id },
      data: {
        name,
        isRequired: body.isRequired ?? existing.isRequired,
        supplierType: body.supplierType as any,
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
    }
    if (error.code === 'P2002') {
      return NextResponse.json({ message: 'Ya existe un documento con ese nombre' }, { status: 409 });
    }
    console.error('Error updating document requirement:', error);
    return NextResponse.json({ message: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const decoded = extractToken(request);

    if (decoded.role !== 'TENANT_ADMIN') {
      return NextResponse.json({ message: 'Acceso denegado' }, { status: 403 });
    }

    const { id } = await params;

    const existing = await prisma.documentRequirement.findFirst({
      where: { id, tenantId: decoded.tenantId, isActive: true },
    });

    if (!existing) {
      return NextResponse.json({ message: 'Documento no encontrado' }, { status: 404 });
    }

    if (existing.isSystem) {
      return NextResponse.json(
        { message: 'Los documentos del sistema no pueden eliminarse' },
        { status: 422 }
      );
    }

    // 1. Buscar los SupplierDocuments a eliminar (necesitamos sus fileKeys para S3)
    const supplierProfileIds = await prisma.supplierProfile.findMany({
      where: { tenantId: decoded.tenantId },
      select: { id: true },
    }).then(profiles => profiles.map(p => p.id));

    const docsToDelete = await prisma.supplierDocument.findMany({
      where: {
        documentType: existing.documentType,
        supplierProfileId: { in: supplierProfileIds },
      },
      select: { id: true, fileUrl: true },
    });

    // 2. Eliminar registros en BD (transacción atómica)
    await prisma.$transaction([
      prisma.supplierDocument.deleteMany({
        where: { id: { in: docsToDelete.map(d => d.id) } },
      }),
      prisma.documentRequirement.update({
        where: { id },
        data: { isActive: false },
      }),
    ]);

    // 3. Eliminar archivos de S3 (best effort: si falla se loguea pero no revierte la BD)
    await Promise.allSettled(
      docsToDelete
        .filter(d => d.fileUrl)
        .map(d => deleteFromS3(d.fileUrl!))
    ).then(results => {
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          console.error(`Error eliminando S3 key ${docsToDelete[i].fileUrl}:`, r.reason);
        }
      });
    });

    return NextResponse.json({ message: 'Documento eliminado correctamente' });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
    }
    console.error('Error deleting document requirement:', error);
    return NextResponse.json({ message: 'Error interno del servidor' }, { status: 500 });
  }
}
