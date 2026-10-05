// app/api/admin/invoice-documents/route.ts
// Documentos adicionales de factura que el TENANT_ADMIN configura para su empresa.

import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireAuth } from '../../../lib/auth';
import { parseRequirementInput } from '../../../lib/invoiceExtraDocs';
import { MAX_EXTRA_FILE_MB } from '../../../lib/invoiceExtraDocTypes';

export async function GET(request: Request) {
  const auth = await requireAuth(request, ['TENANT_ADMIN']);
  if (auth.error) return auth.error;
  const tenantId = auth.decoded.tenantId;
  if (!tenantId) return NextResponse.json({ message: 'Acceso denegado.' }, { status: 403 });

  try {
    const documents = await prisma.invoiceDocumentRequirement.findMany({
      where: { tenantId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { attachments: true } } },
    });

    return NextResponse.json({
      documents: documents.map(({ _count, ...doc }) => ({ ...doc, attachmentCount: _count.attachments })),
      maxFileMb: MAX_EXTRA_FILE_MB,
    });
  } catch (error: any) {
    console.error('[invoice-documents] GET:', error);
    return NextResponse.json({ message: 'Error al obtener los documentos.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth(request, ['TENANT_ADMIN']);
  if (auth.error) return auth.error;
  const tenantId = auth.decoded.tenantId;
  if (!tenantId) return NextResponse.json({ message: 'Acceso denegado.' }, { status: 403 });

  try {
    const parsed = await parseRequirementInput(await request.json(), tenantId, false);
    if ('error' in parsed) return NextResponse.json({ message: parsed.error }, { status: 400 });
    const { data } = parsed;

    const duplicate = await prisma.invoiceDocumentRequirement.findFirst({
      where: { tenantId, name: { equals: data.name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json({ message: 'Ya existe un documento con ese nombre.' }, { status: 409 });
    }

    const created = await prisma.invoiceDocumentRequirement.create({
      data: {
        name: data.name!,
        allowedTypes: data.allowedTypes!,
        isRequired: data.isRequired ?? false,
        isActive: data.isActive ?? true,
        supplierType: data.supplierType ?? 'BOTH',
        subsidiaryIds: data.subsidiaryIds ?? [],
        tenantId,
      },
    });

    return NextResponse.json({ ...created, attachmentCount: 0 }, { status: 201 });
  } catch (error: any) {
    console.error('[invoice-documents] POST:', error);
    return NextResponse.json({ message: 'Error al crear el documento.' }, { status: 500 });
  }
}
