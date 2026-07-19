// DIAGNÓSTICO (SOLO LECTURA) de los últimos errores de sincronización.
// Muestra los SyncLog más recientes con su errorMessage real (el que la UI oculta).
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const logs = await prisma.syncLog.findMany({
    where: { OR: [{ status: 'FAILED' }, { status: 'PARTIAL' }] },
    orderBy: { createdAt: 'desc' },
    take: 15,
    include: { tenant: { select: { name: true } } },
  });

  console.log('\n===== ÚLTIMOS SYNC LOGS CON ERROR (FAILED / PARTIAL) =====\n');
  for (const l of logs) {
    console.log(
      `[${l.createdAt.toISOString().slice(0, 16).replace('T', ' ')}] ` +
      `${l.tenant?.name ?? l.tenantId} | ${l.type} | ${l.status} | ` +
      `found=${l.totalFound ?? '-'} created=${(l as any).createdCount ?? '-'} ` +
      `err=${(l as any).errorCount ?? '-'} by=${l.triggeredBy}`
    );
    if (l.errorMessage) console.log(`   → ${l.errorMessage}\n`);
    else console.log('');
  }
  console.log('==========================================================\n');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
