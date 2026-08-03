// app/api/sync/invoice-payments/route.ts
// Detecta facturas (Vendor Bill) que ya fueron pagadas por completo en NetSuite y
// notifica al proveedor por correo. Llamado periódicamente por EventBridge.
// Protegido con x-sync-key (mismo convenio que /api/sync/lista-69b).

import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { querySuiteQL } from '../../../lib/netsuite';
import { sendEmail } from '../../../lib/mailer';
import { buildInvoicePaidEmail, PaidInvoiceEntry } from '../../../lib/emails';

// Tolerancia contable, igual que en payment-complements/route.ts: NetSuite puede
// dejar residuos de centavos por redondeo aunque el bill esté efectivamente saldado.
const PAID_TOLERANCE = 0.5;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function GET(request: Request) {
  const apiKey = request.headers.get('x-sync-key');
  if (apiKey !== process.env.SYNC_API_KEY) {
    return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
  }

  const tenants = await prisma.tenant.findMany({
    where: {
      isActive: true,
      netsuiteAccountId: { not: null },
      netsuiteConsumerKey: { not: null },
      netsuiteConsumerSec: { not: null },
      netsuiteTokenId: { not: null },
      netsuiteTokenSecret: { not: null },
    },
  });

  if (tenants.length === 0) {
    return NextResponse.json({ message: 'No hay tenants con NetSuite configurado.', results: [] });
  }

  const results = [];

  for (const tenant of tenants) {
    try {
      // Solo facturas ya registradas en NetSuite y que no hayamos marcado como pagadas antes.
      const invoices = await prisma.invoice.findMany({
        where: { tenantId: tenant.id, syncStatus: 'SYNCED', netsuiteId: { not: null }, paidAt: null },
        select: {
          id: true, folio: true, total: true, fecha: true, netsuiteId: true, userId: true,
          user: { select: { email: true, name: true, supplierProfile: { select: { companyName: true } } } },
        },
      });

      if (invoices.length === 0) {
        results.push({ tenantId: tenant.id, tenantName: tenant.name, checked: 0, paid: 0 });
        continue;
      }

      const creds = {
        accountId: tenant.netsuiteAccountId!,
        consumerKey: tenant.netsuiteConsumerKey!,
        consumerSecret: tenant.netsuiteConsumerSec!,
        tokenId: tenant.netsuiteTokenId!,
        tokenSecret: tenant.netsuiteTokenSecret!,
      };

      // Consultar el saldo real de cada Vendor Bill en NetSuite, en lotes.
      const unpaidById = new Map<string, number>();
      const billIds = Array.from(new Set(invoices.map(i => i.netsuiteId!)));
      for (const group of chunk(billIds, 150)) {
        const inClause = group.map(id => Number(id)).filter(id => !isNaN(id)).join(',');
        if (!inClause) continue;
        const rows = await querySuiteQL(
          `SELECT id, ABS(foreignamountunpaid) AS unpaid FROM transaction WHERE type = 'VendBill' AND id IN (${inClause})`,
          creds
        );
        for (const r of rows as any[]) {
          if (r.id != null && r.unpaid != null) unpaidById.set(String(r.id), Number(r.unpaid));
        }
      }

      const now = new Date();
      const paidBySupplier = new Map<string, { email: string; name: string; invoices: PaidInvoiceEntry[] }>();

      for (const inv of invoices) {
        const unpaid = unpaidById.get(inv.netsuiteId!);
        // Si NetSuite no devolvió el bill (p. ej. fue eliminado), lo deja para que la
        // reconciliación de facturas (P2) lo maneje; aquí no se toca.
        if (unpaid === undefined || unpaid > PAID_TOLERANCE) continue;

        await prisma.invoice.update({ where: { id: inv.id }, data: { paidAt: now } });

        const email = inv.user?.email;
        if (!email) continue;
        const entry = paidBySupplier.get(inv.userId) ?? {
          email,
          name: inv.user?.supplierProfile?.companyName || inv.user?.name || 'Proveedor',
          invoices: [],
        };
        entry.invoices.push({ folio: inv.folio, total: Number(inv.total), fecha: inv.fecha });
        paidBySupplier.set(inv.userId, entry);
      }

      // Un correo por proveedor con todas sus facturas recién pagadas en esta corrida.
      for (const { email, name, invoices: paidInvoices } of paidBySupplier.values()) {
        try {
          await sendEmail({
            to: email,
            subject: paidInvoices.length === 1
              ? `💰 Tu factura ${paidInvoices[0].folio.slice(-8)} ya fue pagada`
              : `💰 ${paidInvoices.length} facturas tuyas ya fueron pagadas`,
            html: buildInvoicePaidEmail({ supplierName: name, invoices: paidInvoices, date: now }),
          });
        } catch (emailErr) {
          console.error(`[INVOICE-PAYMENTS] Error enviando email a ${email}:`, emailErr);
        }
      }

      const paidCount = Array.from(paidBySupplier.values()).reduce((sum, s) => sum + s.invoices.length, 0);
      results.push({ tenantId: tenant.id, tenantName: tenant.name, checked: invoices.length, paid: paidCount });

    } catch (err: any) {
      console.error(`[INVOICE-PAYMENTS] Error en tenant ${tenant.name}:`, err.message);
      results.push({ tenantId: tenant.id, tenantName: tenant.name, error: err.message });
    }
  }

  return NextResponse.json({ message: 'Verificación de pagos completada.', results });
}
