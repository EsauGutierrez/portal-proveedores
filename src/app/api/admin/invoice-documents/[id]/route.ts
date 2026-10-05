// app/api/admin/invoice-documents/[id]/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAuth } from '../../../../lib/auth';
import { parseRequirementInput } from '../../../../lib/invoiceExtraDocs';

// Aislamiento por tenant: solo se opera sobre requisitos de la empresa del admin.
async function findOwned(id: string, tenantId: string) {
  return prisma.invoiceDocumentRequirement.findFirst({ where: { id, tenantId }, select: { id: true } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request, ['TENANT_ADMIN']);
  if (auth.error) return auth.error;
  const tenantId = auth.decoded.tenantId;
  if (!tenantId) return NextResponse.json({ message: 'Acceso denegado.' }, { status: 403 });

  try {
    const { id } = await params;
    if (!(await findOwned(id, tenantId))) {
      return NextResponse.json({ message: 'Documento no encontrado.' }, { status: 404 });
    }

    const parsed = await parseRequirementInput(await request.json(), tenantId, true);
    if ('error' in parsed) return NextResponse.json({ message: parsed.error }, { status: 400 });
    const { data } = parsed;

    if (data.name) {
      const duplicate = await prisma.invoiceDocumentRequirement.findFirst({
        where: { tenantId, name: { equals: data.name, mode: 'insensitive' }, NOT: { id } },
        select: { id: true },
      });
      if (duplicate) {
        return NextResponse.json({ message: 'Ya existe un documento con ese nombre.' }, { status: 409 });
      }
    }

    const updated = await prisma.invoiceDocumentRequirement.update({
      where: { id },
      data,
      include: { _count: { select: { attachments: true } } },
    });

    const { _count, ...doc } = updated;
    return NextResponse.json({ ...doc, attachmentCount: _count.attachments });
  } catch (error: any) {
    console.error('[invoice-documents] PATCH:', error);
    return NextResponse.json({ message: 'Error al actualizar el documento.' }, { status: 500 });
  }
}

// Los adjuntos ya cargados se conservan (requirementId pasa a null y el nombre
// queda guardado en cada adjunto); solo desaparece el requisito.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request, ['TENANT_ADMIN']);
  if (auth.error) return auth.error;
  const tenantId = auth.decoded.tenantId;
  if (!tenantId) return NextResponse.json({ message: 'Acceso denegado.' }, { status: 403 });

  try {
    const { id } = await params;
    if (!(await findOwned(id, tenantId))) {
      return NextResponse.json({ message: 'Documento no encontrado.' }, { status: 404 });
    }
    await prisma.invoiceDocumentRequirement.delete({ where: { id } });
    return NextResponse.json({ message: 'Documento eliminado correctamente.' });
  } catch (error: any) {
    console.error('[invoice-documents] DELETE:', error);
    return NextResponse.json({ message: 'Error al eliminar el documento.' }, { status: 500 });
  }
}
