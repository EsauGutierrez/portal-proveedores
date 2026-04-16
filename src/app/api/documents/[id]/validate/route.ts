// app/api/documents/[id]/validate/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient, DocumentStatus } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { sendEmail } from '../../../../lib/mailer';

const prisma = new PrismaClient();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string; role: string };

    if (decodedToken.role !== 'ADMIN' && decodedToken.role !== 'TENANT_ADMIN') {
      return NextResponse.json({ message: 'Acceso denegado: Se requiere rol de administrador.' }, { status: 403 });
    }

    const documentId = (await params).id;
    const body = await request.json();
    const { status } = body;

    if (!status || !Object.values(DocumentStatus).includes(status)) {
      return NextResponse.json({ message: 'El estado proporcionado es inválido.' }, { status: 400 });
    }

    // Obtener documento con datos del proveedor ANTES de actualizar
    const supplierDoc = await prisma.supplierDocument.findUnique({
      where: { id: documentId },
      include: { supplierProfile: { include: { user: true } } }
    });

    if (!supplierDoc) {
      return NextResponse.json({ message: 'Documento no encontrado.' }, { status: 404 });
    }

    // Actualizar el estado del documento
    const updatedDocument = await prisma.supplierDocument.update({
      where: { id: documentId },
      data: {
        status,
        ...(status === 'APPROVED' && { approvedAt: new Date() }),
      },
    });

    // Enviar email si fue aprobado
    if (status === 'APPROVED') {
      const providerEmail = supplierDoc.supplierProfile?.user?.email;
      const providerName = supplierDoc.supplierProfile?.user?.name || 'Proveedor';
      const companyName = supplierDoc.supplierProfile?.companyName || 'Tu empresa';

      if (providerEmail) {
        await sendEmail({
          to: providerEmail,
          subject: `✓ Documento Aprobado: ${supplierDoc.documentType}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 20px; color: white; border-radius: 8px 8px 0 0;">
                <h2 style="margin: 0;">✓ Documento Aprobado</h2>
              </div>
              <div style="padding: 20px; background: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 0 0 8px 8px;">
                <p>Hola <strong>${providerName}</strong>,</p>
                <p>¡Felicidades! El documento <strong>${supplierDoc.documentType}</strong> de <strong>${companyName}</strong> ha sido aprobado exitosamente.</p>
                <div style="background: white; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px;">
                  <p style="margin: 0; color: #059669; font-weight: bold;">✓ Estado: Aprobado</p>
                  <p style="margin: 6px 0 0 0; color: #666; font-size: 13px;">
                    Aprobado el: ${new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </p>
                </div>
                <p>Tu documentación está al día. Revisa si hay algún otro documento pendiente en el portal.</p>
                <div style="text-align: center; margin: 24px 0;">
                  <a href="${process.env.NEXT_PUBLIC_APP_URL}" style="background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                    Ir al Portal
                  </a>
                </div>
                <p style="color: #999; font-size: 12px; margin-top: 20px; border-top: 1px solid #e0e0e0; padding-top: 10px;">
                  Gracias por mantener tu documentación actualizada.
                </p>
              </div>
            </div>
          `,
        });
      }
    }

    return NextResponse.json(updatedDocument, { status: 200 });

  } catch (error) {
    console.error('Error al validar el documento:', error);
    if ((error as any).code === 'P2025') {
      return NextResponse.json({ message: 'Documento no encontrado.' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Error al procesar la solicitud.' }, { status: 500 });
  }
}
