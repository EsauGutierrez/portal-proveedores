// Script para disparar manualmente el worker de sincronización de facturas.
// Útil en entornos locales donde SQS no puede llamar al servidor.
//
// Uso:
//   npx ts-node scripts/trigger-invoice-sync.ts            <- procesa todas las PENDING_SYNC
//   npx ts-node scripts/trigger-invoice-sync.ts <invoiceId> <- procesa una factura específica

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const WORKER_URL = 'http://localhost:3000/api/workers/sqs-consumer';
const WORKER_KEY = process.env.WORKER_SECRET_KEY || 'SuperSecretoPortal123';

async function triggerInvoice(invoiceId: string) {
  const payload = {
    Records: [
      { body: JSON.stringify({ invoiceId }) },
    ],
  };

  console.log(`\n→ Enviando factura ${invoiceId} al worker...`);

  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-worker-key': WORKER_KEY,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  console.log(`  HTTP ${res.status}:`, JSON.stringify(data));

  if (!res.ok) {
    console.error('  ❌ El worker devolvió error.');
  } else {
    console.log('  ✅ Worker procesó el mensaje.');
  }
}

async function main() {
  const specificId = process.argv[2];

  if (specificId) {
    await triggerInvoice(specificId);
  } else {
    const pending = await prisma.invoice.findMany({
      where: { syncStatus: 'PENDING_SYNC' },
      select: { id: true, folio: true, total: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    if (pending.length === 0) {
      console.log('No hay facturas en estado PENDING_SYNC.');
      return;
    }

    console.log(`Encontradas ${pending.length} facturas pendientes:`);
    pending.forEach(inv => console.log(`  • ${inv.id} | folio: ${inv.folio} | total: $${inv.total}`));

    for (const inv of pending) {
      await triggerInvoice(inv.id);
      // Pausa breve entre llamadas
      await new Promise(r => setTimeout(r, 500));
    }
  }

  await prisma.$disconnect();
}

main().catch(async err => {
  console.error('Error fatal:', err);
  await prisma.$disconnect();
  process.exit(1);
});
