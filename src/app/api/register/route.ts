// app/api/register/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    
    const email = formData.get('email') as string;
    const name = formData.get('name') as string;
    const companyName = formData.get('companyName') as string;
    const rfc = formData.get('rfc') as string;
    const taxAddress = formData.get('taxAddress') as string;

    const files = {
        CONSTANCIA_SITUACION_FISCAL: formData.get('constanciaFiscal') as File,
        OPINION_CUMPLIMIENTO_SAT: formData.get('opinionSat') as File,
        IDENTIFICACION_OFICIAL: formData.get('identificacionOficial') as File,
        COMPROBANTE_DOMICILIO: formData.get('comprobanteDomicilio') as File,
        ACTA_CONSTITUTIVA: formData.get('actaConstitutiva') as File,
    };

    if (!email || !name || !companyName || !rfc || !taxAddress) {
      return NextResponse.json({ message: 'Todos los campos de texto son requeridos.' }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ message: 'El correo electrónico ya está registrado.' }, { status: 409 });
    }
    
    const existingSupplier = await prisma.supplierProfile.findUnique({ where: { rfc } });
    if (existingSupplier) {
      return NextResponse.json({ message: 'El RFC ya está registrado.' }, { status: 409 });
    }

    // ========================================================================
    // ¡ACCIÓN REQUERIDA!
    // El error ocurre aquí. Debes reemplazar el texto de ejemplo
    // con un ID real de una subsidiaria que exista en tu base de datos.
    // Puedes obtener un ID válido usando `npx prisma studio` y viendo la tabla `Subsidiary`.
    // ========================================================================
    const defaultSubsidiaryId = 'cmd3jy2l60003sc0ma034cha4'; // <-- ¡IMPORTANTE: Reemplaza esto!

    const newUserAndProfile = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email, name } });

      const supplierProfile = await tx.supplierProfile.create({
        data: {
          companyName,
          rfc,
          taxAddress,
          status: 'PENDING',
          userId: user.id,
          subsidiaryId: defaultSubsidiaryId, // Se usa el ID por defecto
        },
      });

      for (const [docType, file] of Object.entries(files)) {
        if (file) {
          const fileUrl = `https://storage.example.com/documents/${supplierProfile.id}/${file.name}`;
          await tx.supplierDocument.create({
            data: {
              documentType: docType,
              fileName: file.name,
              fileUrl: fileUrl,
              status: 'UPLOADED',
              supplierProfileId: supplierProfile.id,
            },
          });
        }
      }

      return tx.user.findUnique({
        where: { id: user.id },
        include: { supplierProfile: { include: { documents: true } } },
      });
    });

    return NextResponse.json(newUserAndProfile, { status: 201 });

  } catch (error) {
    console.error('Error en el registro:', error);
    if ((error as any).code === 'P2025') {
        return NextResponse.json({ message: 'La subsidiaria por defecto no existe. Revisa la configuración.' }, { status: 500 });
    }
    return NextResponse.json({ message: 'Error al procesar el registro.' }, { status: 500 });
  }
}
