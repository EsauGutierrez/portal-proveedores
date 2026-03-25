// app/api/settings/documents/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

const defaultDocuments = [
  { documentType: 'CONSTANCIA_SITUACION_FISCAL', isRequired: true, isOcrEnabled: true },
  { documentType: 'OPINION_CUMPLIMIENTO_SAT', isRequired: true, isOcrEnabled: true },
  { documentType: 'IDENTIFICACION_OFICIAL', isRequired: true, isOcrEnabled: true },
  { documentType: 'COMPROBANTE_DOMICILIO', isRequired: true, isOcrEnabled: true },
  { documentType: 'ACTA_CONSTITUTIVA', isRequired: true, isOcrEnabled: true },
];

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string; role: string; tenantId: string };
    
    const tenantId = decodedToken.tenantId;

    let requirements = await prisma.documentRequirement.findMany({
      where: { tenantId },
    });

    if (requirements.length === 0) {
      await prisma.documentRequirement.createMany({
        data: defaultDocuments.map(doc => ({
          ...doc,
          tenantId
        }))
      });
      requirements = await prisma.documentRequirement.findMany({
        where: { tenantId },
      });
    }

    return NextResponse.json(requirements);
  } catch (error) {
    console.error('Error fetching document requirements:', error);
    return NextResponse.json({ message: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string; role: string; tenantId: string };
    
    if (decodedToken.role !== 'TENANT_ADMIN' && decodedToken.role !== 'SUPERADMIN') {
      return NextResponse.json({ message: 'Acceso denegado' }, { status: 403 });
    }

    const { documents } = await request.json(); 
    
    await prisma.$transaction(
      documents.map((doc: any) => 
        prisma.documentRequirement.upsert({
          where: {
            tenantId_documentType: {
              tenantId: decodedToken.tenantId,
              documentType: doc.documentType
            }
          },
          update: {
            isRequired: doc.isRequired,
            isOcrEnabled: doc.isOcrEnabled
          },
          create: {
            tenantId: decodedToken.tenantId,
            documentType: doc.documentType,
            isRequired: doc.isRequired,
            isOcrEnabled: doc.isOcrEnabled
          }
        })
      )
    );

    const updated = await prisma.documentRequirement.findMany({
      where: { tenantId: decodedToken.tenantId },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating document requirements:', error);
    return NextResponse.json({ message: 'Error interno del servidor' }, { status: 500 });
  }
}
