// app/api/suppliers/[id]/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import bcrypt from 'bcrypt';
import { checkLista69bBulk } from '../../../lib/zentax';
import { sendEmail } from '../../../lib/mailer';
import { buildLista69bAlertEmail } from '../../../lib/emails';
import { requireAuth, requireTenantMatch } from '../../../lib/auth';
import { isValidPassword, PASSWORD_POLICY_MESSAGE } from '../../../lib/passwordPolicy';

// GET: Obtener los datos de un perfil de proveedor específico por su ID
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Sin allowedRoles: el acceso depende de la relación con el recurso (dueño, cargador asignado, tenant, superadmin)
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { decoded } = auth;

    const { id } = await params;

    const supplierProfile = await prisma.supplierProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        documents: true,
      },
    });

    if (!supplierProfile) {
      return NextResponse.json({ message: 'Proveedor no encontrado.' }, { status: 404 });
    }

    const isOwnProfile = decoded.role === 'SUPPLIER' && decoded.supplierProfileId === id;
    const isAssignedCargador = decoded.role === 'CARGADOR' && (decoded.assignedSupplierIds ?? []).includes(id);
    const isTenantAdmin = (decoded.role === 'ADMIN' || decoded.role === 'TENANT_ADMIN') && decoded.tenantId === supplierProfile.tenantId;
    const isSuperAdmin = decoded.role === 'SUPERADMIN';

    if (!isOwnProfile && !isAssignedCargador && !isTenantAdmin && !isSuperAdmin) {
      return NextResponse.json({ message: 'Acceso denegado.' }, { status: 403 });
    }

    return NextResponse.json(supplierProfile);
  } catch (error) {
    console.error('Error fetching supplier profile:', error);
    return NextResponse.json({ message: 'Error al obtener el perfil del proveedor.' }, { status: 500 });
  }
}

// PATCH: Actualizar datos de un proveedor o inhabilitarlo
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request, ['ADMIN', 'TENANT_ADMIN', 'SUPERADMIN']);
    if (auth.error) return auth.error;
    const { decoded } = auth;

    const { id } = await params;
    const body = await request.json();
    const { status, companyName, rfc, contactName, email, password, netsuiteId } = body;

    // Primero obtenemos el perfil para conocer el userId y tenantId asociados
    const currentProfile = await prisma.supplierProfile.findUnique({
      where: { id },
      select: { userId: true, tenantId: true, rfc: true }
    });

    if (!currentProfile || !currentProfile.userId) {
      return NextResponse.json({ message: 'Proveedor o usuario no encontrado.' }, { status: 404 });
    }

    const tenantError = requireTenantMatch(decoded, currentProfile.tenantId);
    if (tenantError) return tenantError;

    let userDataToUpdate: any = {};
    if (contactName) userDataToUpdate.name = contactName;

    if (email) {
      const normalizedEmail = email.trim().toLowerCase();

      const existingEmailUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true }
      });

      if (existingEmailUser && existingEmailUser.id !== currentProfile.userId) {
        return NextResponse.json(
          { message: `El correo '${normalizedEmail}' ya está siendo usado por otro usuario.` },
          { status: 409 }
        );
      }
      userDataToUpdate.email = normalizedEmail;
    }

    if (password && password.trim() !== '') {
      if (!isValidPassword(password)) {
        return NextResponse.json({ message: PASSWORD_POLICY_MESSAGE }, { status: 400 });
      }
      userDataToUpdate.password = await bcrypt.hash(password, 10);
    }

    let dataToUpdate: any = {};
    if (status) dataToUpdate.status = status;
    if (companyName) dataToUpdate.companyName = companyName;
    if (netsuiteId !== undefined) dataToUpdate.netsuiteId = netsuiteId?.trim() || null;

    if (rfc) {
      const normalizedRfc = rfc.toUpperCase().trim();

      // XAXX010101000 y XEXX010101000 son RFC genéricos del SAT — pueden repetirse
      const isGenericRfc = ['XAXX010101000', 'XEXX010101000'].includes(normalizedRfc);

      if (!isGenericRfc) {
        const existingRfc = await prisma.supplierProfile.findFirst({
          where: {
            tenantId: currentProfile.tenantId,
            rfc: normalizedRfc,
            NOT: { id }
          },
          select: { id: true }
        });

        if (existingRfc) {
          return NextResponse.json(
            { message: `El RFC '${normalizedRfc}' ya está registrado para otro proveedor en este tenant.` },
            { status: 409 }
          );
        }
      }

      dataToUpdate.rfc = normalizedRfc;
    }

    const transactionQueries = [];

    if (Object.keys(userDataToUpdate).length > 0) {
      transactionQueries.push(
        prisma.user.update({
          where: { id: currentProfile.userId },
          data: userDataToUpdate
        })
      );
    }

    if (Object.keys(dataToUpdate).length > 0) {
      transactionQueries.push(
        prisma.supplierProfile.update({
          where: { id },
          data: dataToUpdate,
          include: { user: true }
        })
      );
    }

    const results = await prisma.$transaction([
      ...transactionQueries,
      prisma.supplierProfile.findUnique({ where: { id }, include: { user: true } })
    ]);

    const finalProfile = results[results.length - 1];

    // Si se cambió el RFC, re-verificar contra Lista 69B en background
    const GENERIC_RFCS = ['XAXX010101000', 'XEXX010101000'];
    const savedRfc = dataToUpdate.rfc as string | undefined;
    if (savedRfc && savedRfc !== currentProfile.rfc && !GENERIC_RFCS.includes(savedRfc)) {
      checkLista69bBulk([savedRfc]).then(async (zentaxResults) => {
        const match = zentaxResults.find(r => r.rfc === savedRfc);
        const newStatus = match ? match.status : 'NO_LISTADO';
        await prisma.supplierProfile.update({
          where: { id },
          data: { lista69bStatus: newStatus, lista69bCheckedAt: new Date() } as any,
        });

        if (match) {
          const profile = await prisma.supplierProfile.findUnique({
            where: { id },
            select: { companyName: true, tenantId: true },
          });
          const admins = await prisma.user.findMany({
            where: { tenantId: currentProfile.tenantId, role: 'TENANT_ADMIN' },
            select: { email: true },
          });
          const adminEmails = admins.map(u => u.email).filter(Boolean).join(',');
          if (adminEmails && profile) {
            await sendEmail({
              to: adminEmails,
              subject: `⚠️ RFC actualizado en Lista 69B SAT — ${profile.companyName}`,
              html: buildLista69bAlertEmail({
                suppliers: [{ companyName: profile.companyName, rfc: savedRfc, statusLabel: match.status }],
                contextMessage: 'Se actualizó el RFC de un proveedor y el nuevo RFC aparece en la <strong>Lista 69B del SAT</strong>:',
              }),
            });
          }
        }
      }).catch((err) => {
        console.error('[LISTA69B] Error al re-verificar RFC editado:', err.message);
      });
    }

    return NextResponse.json(
      { message: 'Proveedor actualizado correctamente.', supplierProfile: finalProfile },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error updating supplier profile:', error);

    // Prisma unique constraint violation
    if (error?.code === 'P2002') {
      const field = error?.meta?.target?.join(', ') ?? 'campo';
      return NextResponse.json(
        { message: `Ya existe un registro con el mismo valor en: ${field}.` },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { message: error?.message ?? 'Error interno al actualizar proveedor.' },
      { status: 500 }
    );
  }
}
