// app/api/sync/lista-69b/route.ts
// Verificación masiva de proveedores contra Lista 69B del SAT vía Zentax.
// Llamado por EventBridge el primer día de cada mes. Protegido con x-sync-key.

import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { checkLista69bBulk, Lista69bStatusValue } from '../../../lib/zentax';
import { sendEmail } from '../../../lib/mailer';
import { buildLista69bAlertEmail } from '../../../lib/emails';

const ALERT_STATUSES: Lista69bStatusValue[] = ['PRESUNTO', 'DEFINITIVO', 'DESVIRTUADO', 'SENTENCIA_FAVORABLE'];
const GENERIC_RFCS = ['XAXX010101000', 'XEXX010101000'];

const STATUS_LABELS: Record<Lista69bStatusValue, string> = {
  NOT_CHECKED:         'Sin verificar',
  NO_LISTADO:          'No listado',
  PRESUNTO:            'Presunto (EFOS)',
  DEFINITIVO:          'Definitivo (SAT)',
  DESVIRTUADO:         'Desvirtuado',
  SENTENCIA_FAVORABLE: 'Sentencia favorable',
};

export async function GET(request: Request) {
  const apiKey = request.headers.get('x-sync-key');
  if (apiKey !== process.env.SYNC_API_KEY) {
    return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
  }

  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    include: {
      users: {
        where: { role: 'TENANT_ADMIN' },
        select: { email: true },
      },
    },
  });

  if (tenants.length === 0) {
    return NextResponse.json({ message: 'No hay tenants activos.', results: [] });
  }

  const results = [];

  for (const tenant of tenants) {
    try {
      const suppliers = await prisma.supplierProfile.findMany({
        where: { tenantId: tenant.id },
        select: { id: true, rfc: true, companyName: true, lista69bStatus: true },
      });

      if (suppliers.length === 0) {
        results.push({ tenantId: tenant.id, tenantName: tenant.name, checked: 0, listed: 0, cleared: 0 });
        continue;
      }

      const validSuppliers = suppliers.filter(s => !GENERIC_RFCS.includes(s.rfc));
      const rfcs = validSuppliers.map(s => s.rfc);

      const zentaxResults = await checkLista69bBulk(rfcs);
      const zentaxMap = new Map(zentaxResults.map(r => [r.rfc, r.status]));

      const now = new Date();
      const newlyListed: typeof validSuppliers = [];
      const newlyCleared: typeof validSuppliers = [];

      for (const supplier of validSuppliers) {
        const newStatus: Lista69bStatusValue = zentaxMap.get(supplier.rfc) ?? 'NO_LISTADO';
        const prevStatus = supplier.lista69bStatus as Lista69bStatusValue;

        if (newStatus === prevStatus) {
          await prisma.supplierProfile.update({
            where: { id: supplier.id },
            data: { lista69bCheckedAt: now } as any,
          });
          continue;
        }

        await prisma.supplierProfile.update({
          where: { id: supplier.id },
          data: { lista69bStatus: newStatus, lista69bCheckedAt: now } as any,
        });

        const wasAlerted = ALERT_STATUSES.includes(prevStatus);
        const isNowAlerted = ALERT_STATUSES.includes(newStatus);

        if (!wasAlerted && isNowAlerted) newlyListed.push(supplier);
        if (wasAlerted && !isNowAlerted) newlyCleared.push(supplier);
      }

      const adminEmails = tenant.users.map(u => u.email).filter(Boolean) as string[];

      if (adminEmails.length > 0 && newlyListed.length > 0) {
        try {
          await sendEmail({
            to: adminEmails.join(','),
            subject: `⚠️ Lista 69B SAT — ${newlyListed.length} proveedor(es) detectado(s) · ${tenant.name}`,
            html: buildLista69bAlertEmail({
              suppliers: newlyListed.map(s => ({
                companyName: s.companyName,
                rfc: s.rfc,
                statusLabel: STATUS_LABELS[zentaxMap.get(s.rfc) ?? 'PRESUNTO'],
              })),
              contextMessage: `La verificación mensual detectó proveedores de <strong>${tenant.name}</strong> en la <strong>Lista 69B del SAT</strong>:`,
              date: now,
            }),
          });
        } catch (emailErr) {
          console.error(`[LISTA69B] Error enviando email para tenant ${tenant.name}:`, emailErr);
        }
      }

      results.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        checked: validSuppliers.length,
        listed: newlyListed.length,
        cleared: newlyCleared.length,
      });

    } catch (err: any) {
      console.error(`[LISTA69B] Error en tenant ${tenant.name}:`, err.message);
      results.push({ tenantId: tenant.id, tenantName: tenant.name, error: err.message });
    }
  }

  return NextResponse.json({
    message: 'Verificación Lista 69B completada.',
    results,
  });
}
