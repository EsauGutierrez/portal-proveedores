import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import jwt from 'jsonwebtoken';

type DecodedToken = { userId: string; role: string; tenantId: string };

// Los 5 documentos del sistema que se crean para cada nuevo tenant
const SYSTEM_DOCUMENTS = [
  { documentType: 'CONSTANCIA_SITUACION_FISCAL',  name: 'Constancia de Situación Fiscal',            isRequired: true, isOcrEnabled: true,  isSystem: true, supplierType: 'NATIONAL' as const },
  { documentType: 'OPINION_CUMPLIMIENTO_SAT',     name: 'Opinión de Cumplimiento (SAT)',              isRequired: true, isOcrEnabled: true,  isSystem: true, supplierType: 'NATIONAL' as const },
  { documentType: 'IDENTIFICACION_OFICIAL',       name: 'Identificación Oficial del Representante',  isRequired: true, isOcrEnabled: true,  isSystem: true, supplierType: 'NATIONAL' as const },
  { documentType: 'COMPROBANTE_DOMICILIO',        name: 'Comprobante de Domicilio',                  isRequired: true, isOcrEnabled: true,  isSystem: true, supplierType: 'NATIONAL' as const },
  { documentType: 'ACTA_CONSTITUTIVA',            name: 'Acta Constitutiva',                         isRequired: true, isOcrEnabled: true,  isSystem: true, supplierType: 'NATIONAL' as const },
];

function extractToken(request: Request): DecodedToken {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('UNAUTHORIZED');
  }
  return jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET!) as DecodedToken;
}

// Convierte el nombre libre en un código snake_case para documentType
function toDocumentTypeSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

export async function GET(request: Request) {
  try {
    const decoded = extractToken(request);
    const { searchParams } = new URL(request.url);

    // Para admins pueden pasar ?forSupplierType=NATIONAL|FOREIGN para filtrar
    // Para SUPPLIERs, se auto-detecta su tipo desde su perfil
    let supplierTypeFilter: string | null = searchParams.get('forSupplierType');

    if (decoded.role === 'SUPPLIER') {
      const profile = await prisma.supplierProfile.findFirst({
        where: { userId: decoded.userId },
        select: { supplierType: true },
      });
      supplierTypeFilter = profile?.supplierType ?? 'NATIONAL';
    }

    let requirements = await prisma.documentRequirement.findMany({
      where: { tenantId: decoded.tenantId, isActive: true },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });

    // Semilla automática para tenants nuevos
    if (requirements.length === 0) {
      await prisma.documentRequirement.createMany({
        data: SYSTEM_DOCUMENTS.map(doc => ({ ...doc, tenantId: decoded.tenantId })),
      });
      requirements = await prisma.documentRequirement.findMany({
        where: { tenantId: decoded.tenantId, isActive: true },
        orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      });
    }

    // Filtrar por supplierType si aplica (NATIONAL → NATIONAL+BOTH, FOREIGN → FOREIGN+BOTH)
    if (supplierTypeFilter && supplierTypeFilter !== 'BOTH') {
      requirements = requirements.filter(
        r => r.supplierType === supplierTypeFilter || r.supplierType === 'BOTH'
      );
    }

    return NextResponse.json(requirements);
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
    }
    console.error('Error fetching document requirements:', error);
    return NextResponse.json({ message: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const decoded = extractToken(request);

    if (decoded.role !== 'TENANT_ADMIN' && decoded.role !== 'SUPERADMIN') {
      return NextResponse.json({ message: 'Acceso denegado' }, { status: 403 });
    }

    const { documents } = await request.json() as {
      documents: Array<{ documentType: string; isRequired: boolean; isOcrEnabled: boolean; supplierType?: string }>
    };

    if (!Array.isArray(documents) || documents.length === 0) {
      return NextResponse.json({ message: 'Payload inválido' }, { status: 400 });
    }

    // Obtener cuáles son documentos del sistema para este tenant
    const systemTypes = await prisma.documentRequirement.findMany({
      where: { tenantId: decoded.tenantId, isSystem: true },
      select: { documentType: true },
    }).then(rows => new Set(rows.map(r => r.documentType)));

    await prisma.$transaction(
      documents.map(doc =>
        prisma.documentRequirement.update({
          where: {
            tenantId_documentType: {
              tenantId: decoded.tenantId,
              documentType: doc.documentType,
            },
          },
          data: {
            isRequired: doc.isRequired,
            // OCR solo es editable en documentos del sistema
            ...(systemTypes.has(doc.documentType) && { isOcrEnabled: doc.isOcrEnabled }),
            // supplierType solo actualizable en documentos personalizados
            ...(!systemTypes.has(doc.documentType) && doc.supplierType && { supplierType: doc.supplierType as any }),
          },
        })
      )
    );

    const updated = await prisma.documentRequirement.findMany({
      where: { tenantId: decoded.tenantId, isActive: true },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
    }
    console.error('Error updating document requirements:', error);
    return NextResponse.json({ message: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const decoded = extractToken(request);

    if (decoded.role !== 'TENANT_ADMIN') {
      return NextResponse.json({ message: 'Acceso denegado' }, { status: 403 });
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
      return NextResponse.json({ message: 'Debes seleccionar al menos un tipo de proveedor' }, { status: 422 });
    }

    // --- Verificar nombre duplicado (case-insensitive) ---
    const duplicate = await prisma.documentRequirement.findFirst({
      where: {
        tenantId: decoded.tenantId,
        isActive: true,
        name: { equals: name, mode: 'insensitive' },
      },
    });

    if (duplicate) {
      return NextResponse.json({ message: 'Ya existe un documento con ese nombre' }, { status: 409 });
    }

    // --- Generar documentType único ---
    const baseSlug = toDocumentTypeSlug(name);
    let documentType = baseSlug;

    const slugExists = await prisma.documentRequirement.findUnique({
      where: { tenantId_documentType: { tenantId: decoded.tenantId, documentType } },
    });

    if (slugExists) {
      // Añadir sufijo numérico para evitar colisión en caso extremo
      documentType = `${baseSlug}_${Date.now().toString(36).toUpperCase()}`;
    }

    // --- Crear registro ---
    const created = await prisma.documentRequirement.create({
      data: {
        documentType,
        name,
        isRequired: body.isRequired ?? false,
        isOcrEnabled: false,
        isActive: true,
        isSystem: false,
        supplierType: body.supplierType as any,
        tenantId: decoded.tenantId,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
    }
    // Colisión de unique constraint (race condition entre requests simultáneos)
    if (error.code === 'P2002') {
      return NextResponse.json({ message: 'Ya existe un documento con ese nombre' }, { status: 409 });
    }
    console.error('Error creating document requirement:', error);
    return NextResponse.json({ message: 'Error interno del servidor' }, { status: 500 });
  }
}
