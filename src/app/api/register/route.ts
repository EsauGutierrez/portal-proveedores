// app/api/register/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';
import { rateLimit, getClientIP, rateLimitResponse } from '../../lib/rateLimit';
import { checkLista69bBulk } from '../../lib/zentax';
import { sendEmail } from '../../lib/mailer';
import { buildLista69bAlertEmail } from '../../lib/emails';

export async function POST(request: Request) {
  // Rate limit: 5 registros por IP cada hora
  const ip = getClientIP(request);
  const rl = rateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterSec);

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

    const subsidiaryId = formData.get('subsidiaryId') as string;

    if (!email || !name || !companyName || !rfc || !taxAddress || !subsidiaryId) {
      return NextResponse.json({ message: 'Todos los campos de texto son requeridos, incluyendo la subsidiaria.' }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ message: 'El correo electrónico ya está registrado.' }, { status: 409 });
    }

    const existingSupplier = await prisma.supplierProfile.findFirst({ where: { rfc } });
    if (existingSupplier) {
      return NextResponse.json({ message: 'El RFC ya está registrado.' }, { status: 409 });
    }

    const newUserAndProfile = await prisma.$transaction(async (tx) => {

      const subsidiary = await tx.subsidiary.findUnique({
        where: { id: subsidiaryId },
        select: { tenantId: true, id: true }
      });

      if (!subsidiary) {
        throw new Error('Subsidiaria por defecto no encontrada. (P2025)');
      }

      const user = await tx.user.create({ data: { email, name, tenantId: subsidiary.tenantId } });

      const supplierProfile = await tx.supplierProfile.create({
        data: {
          companyName,
          rfc,
          taxAddress,
          status: 'PENDING',
          userId: user.id,
          subsidiaryId: subsidiary.id,
          tenantId: subsidiary.tenantId, // <-- Se hereda de la subsidiaria
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

    // Verificar Lista 69B en background — no bloquea el registro
    const GENERIC_RFCS = ['XAXX010101000', 'XEXX010101000'];
    const rfcNorm = rfc.toUpperCase();
    if (!GENERIC_RFCS.includes(rfcNorm)) {
      checkLista69bBulk([rfcNorm]).then(async (results) => {
        if (!newUserAndProfile?.supplierProfile) return;
        const match = results.find(r => r.rfc === rfcNorm);
        const newStatus = match ? match.status : 'NO_LISTADO';
        await prisma.supplierProfile.update({
          where: { id: newUserAndProfile.supplierProfile.id },
          data: { lista69bStatus: newStatus, lista69bCheckedAt: new Date() } as any,
        });

        if (match) {
          const admins = await prisma.user.findMany({
            where: { tenantId: newUserAndProfile.supplierProfile.tenantId, role: 'TENANT_ADMIN' },
            select: { email: true },
          });
          const adminEmails = admins.map(u => u.email).filter(Boolean).join(',');
          if (adminEmails) {
            await sendEmail({
              to: adminEmails,
              subject: `⚠️ RFC en Lista 69B SAT — ${companyName}`,
              html: buildLista69bAlertEmail({
                suppliers: [{ companyName, rfc: rfcNorm, statusLabel: match.status }],
                contextMessage: 'Un proveedor que acaba de registrarse aparece en la <strong>Lista 69B del SAT</strong>:',
              }),
            });
          }
        }
      }).catch((err) => {
        console.error('[LISTA69B] Error al verificar RFC en registro:', err.message);
      });
    }

    return NextResponse.json(newUserAndProfile, { status: 201 });

  } catch (error: any) {
    console.error('Error en el registro:', error);
    if (error.code === 'P2025' || error.message.includes('P2025')) {
      return NextResponse.json({ message: 'La subsidiaria por defecto no existe. Revisa la configuración.' }, { status: 500 });
    }
    return NextResponse.json({ message: 'Error al procesar el registro.' }, { status: 500 });
  }
}
