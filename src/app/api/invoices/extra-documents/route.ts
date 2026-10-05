// app/api/invoices/extra-documents/route.ts
// Documentos adicionales que aplican al subir una factura contra una OC/recepción.

import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireAuth } from '../../../lib/auth';
import { getApplicableRequirements, toPublicRequirement } from '../../../lib/invoiceExtraDocs';

export async function GET(request: Request) {
  const auth = await requireAuth(request, ['SUPPLIER', 'CARGADOR']);
  if (auth.error) return auth.error;
  const { decoded } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const purchaseOrderId = searchParams.get('purchaseOrderId');
    const receptionId = searchParams.get('receptionId');
    if (!purchaseOrderId && !receptionId) {
      return NextResponse.json({ message: 'Falta la orden de compra o recepción.' }, { status: 400 });
    }

    // La subsidiaria y el proveedor se resuelven siempre desde la OC en la BD.
    const poSelect = { tenantId: true, userId: true, subsidiaryId: true } as const;
    const purchaseOrder = purchaseOrderId
      ? await prisma.purchaseOrder.findUnique({ where: { id: purchaseOrderId }, select: poSelect })
      : (await prisma.reception.findUnique({
          where: { id: receptionId! },
          select: { purchaseOrder: { select: poSelect } },
        }))?.purchaseOrder ?? null;

    if (!purchaseOrder) {
      return NextResponse.json({ message: 'La orden de compra no existe.' }, { status: 404 });
    }
    if (decoded.tenantId && purchaseOrder.tenantId !== decoded.tenantId) {
      return NextResponse.json({ message: 'La orden de compra no pertenece a tu empresa.' }, { status: 403 });
    }

    const supplierProfile = await prisma.supplierProfile.findFirst({
      where: { userId: purchaseOrder.userId },
      select: { id: true, supplierType: true },
    });

    if (decoded.role === 'SUPPLIER') {
      if (purchaseOrder.userId !== decoded.userId) {
        return NextResponse.json({ message: 'La orden de compra no pertenece a este proveedor.' }, { status: 403 });
      }
    } else {
      const assignment = supplierProfile
        ? await prisma.operatorAssignment.findFirst({
            where: { operatorId: decoded.userId, supplierProfileId: supplierProfile.id },
          })
        : null;
      if (!assignment) {
        return NextResponse.json({ message: 'No tienes asignado a este proveedor.' }, { status: 403 });
      }
    }

    const requirements = await getApplicableRequirements(
      purchaseOrder.tenantId,
      purchaseOrder.subsidiaryId,
      supplierProfile?.supplierType ?? 'NATIONAL',
    );

    return NextResponse.json({ documents: requirements.map(toPublicRequirement) });
  } catch (error: any) {
    console.error('[invoices/extra-documents] GET:', error);
    return NextResponse.json({ message: 'Error al obtener los documentos adicionales.' }, { status: 500 });
  }
}
