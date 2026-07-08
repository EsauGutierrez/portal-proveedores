// app/api/subsidiaries/[id]/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { uploadFileToS3 } from '../../../lib/s3';

// PATCH: Actualizar campos específicos de una subsidiaria, como su estado.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { isActive } = body;

    // Validación para asegurar que solo se actualice el estado
    if (typeof isActive !== 'boolean') {
      return NextResponse.json(
        { message: 'El campo "isActive" es requerido y debe ser un valor booleano.' },
        { status: 400 }
      );
    }

    // Verificar límite al reactivar
    if (isActive) {
      const subsidiary = await prisma.subsidiary.findUnique({
        where: { id },
        select: { tenantId: true },
      });
      if (subsidiary?.tenantId) {
        const tenant = await prisma.tenant.findUnique({
          where: { id: subsidiary.tenantId },
          select: { maxSubsidiaries: true },
        });
        if (tenant?.maxSubsidiaries !== null && tenant?.maxSubsidiaries !== undefined) {
          const activeCount = await prisma.subsidiary.count({
            where: { tenantId: subsidiary.tenantId, isActive: true },
          });
          if (activeCount >= tenant.maxSubsidiaries) {
            return NextResponse.json(
              { message: `No se puede activar la subsidiaria. Has alcanzado el límite de ${tenant.maxSubsidiaries} subsidiarias activas para tu suscripción.` },
              { status: 403 }
            );
          }
        }
      }
    }

    const updatedSubsidiary = await prisma.subsidiary.update({
      where: { id },
      data: { isActive },
    });

    return NextResponse.json(updatedSubsidiary);
  } catch (error) {
    console.error('Error updating subsidiary:', error);
    // Manejo de error si la subsidiaria no se encuentra
    if ((error as any).code === 'P2025') {
      return NextResponse.json({ message: 'Subsidiaria no encontrada.' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Error al actualizar la subsidiaria' }, { status: 500 });
  }
}

// PUT: Actualizar toda la información de la subsidiaria
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const formData = await request.formData();

    const name = formData.get('name') as string;
    const rfc = formData.get('rfc') as string;
    const businessName = formData.get('businessName') as string;
    const taxRegime = formData.get('taxRegime') as string;
    const taxAddress = formData.get('taxAddress') as string;
    const logo = formData.get('logo') as File | null;
    const poSuiteqlQuery = formData.get('poSuiteqlQuery') as string | null;

    if (!name || !rfc || !businessName || !taxRegime || !taxAddress) {
      return NextResponse.json({ message: 'Todos los campos son requeridos' }, { status: 400 });
    }

    let updateData: any = {
      name,
      rfc,
      businessName,
      taxRegime,
      taxAddress,
      ...(poSuiteqlQuery !== null && { poSuiteqlQuery: poSuiteqlQuery.trim() || null }),
    };

    if (logo && logo.size > 0) {
      try {
        updateData.logoUrl = await uploadFileToS3(logo, `subsidiaries/logos`);
      } catch (uploadErr) {
        console.error('Error subiendo logo a S3:', uploadErr);
      }
    }

    const updatedSubsidiary = await prisma.subsidiary.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updatedSubsidiary);
  } catch (error) {
    console.error('Error updating subsidiary details:', error);
    if ((error as any).code === 'P2025') {
      return NextResponse.json({ message: 'Subsidiaria no encontrada.' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Error al actualizar la subsidiaria' }, { status: 500 });
  }
}
