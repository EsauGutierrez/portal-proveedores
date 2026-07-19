// Script DIAGNÓSTICO (SOLO LECTURA) de proveedores con email sintético.
//
// No modifica ni borra NADA: solo cuenta y lista. Sirve para dimensionar cuántos
// proveedores existentes se crearon con un email inventado (@netsuite.com legacy o
// @<accountId>.netsuite.local) antes de que el sync exigiera email real de NetSuite.
//
// Uso:
//   npx ts-node scripts/diagnose-synthetic-suppliers.ts            <- resumen por tenant
//   npx ts-node scripts/diagnose-synthetic-suppliers.ts --list     <- además lista cada proveedor
//
// Requiere que DATABASE_URL apunte a la base que quieras inspeccionar (revisa tu .env).

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Detecta los dos formatos de email sintético usados históricamente:
//   - Legacy:  "12345@netsuite.com"            (solo dígitos antes del dominio)
//   - Actual:  "12345@<accountId>.netsuite.local"
function isSyntheticEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return /^\d+@netsuite\.com$/.test(e) || /\.netsuite\.local$/.test(e);
}

async function main() {
  const showList = process.argv.includes('--list');

  const profiles = await prisma.supplierProfile.findMany({
    select: {
      id: true,
      companyName: true,
      rfc: true,
      status: true,
      netsuiteId: true,
      createdAt: true,
      tenant: { select: { id: true, name: true } },
      user: { select: { email: true, password: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const total = profiles.length;
  const synthetic = profiles.filter((p) => isSyntheticEmail(p.user?.email));

  // Agrupar sintéticos por tenant
  const byTenant = new Map<string, { name: string; count: number; withPassword: number }>();
  for (const p of synthetic) {
    const key = p.tenant?.id ?? '(sin tenant)';
    const entry = byTenant.get(key) ?? { name: p.tenant?.name ?? '(desconocido)', count: 0, withPassword: 0 };
    entry.count++;
    if (p.user?.password) entry.withPassword++; // no debería haber ninguno con contraseña
    byTenant.set(key, entry);
  }

  console.log('\n================ DIAGNÓSTICO: PROVEEDORES CON EMAIL SINTÉTICO ================\n');
  console.log(`Perfiles de proveedor totales:        ${total}`);
  console.log(`Con email sintético (sin email real): ${synthetic.length}`);
  console.log(`Con email real de NetSuite:           ${total - synthetic.length}`);

  const withPasswordTotal = synthetic.filter((p) => p.user?.password).length;
  console.log(`\nDe los sintéticos, con contraseña definida: ${withPasswordTotal}`);
  console.log('  (Se espera 0: los sintéticos no pueden recibir correo ni iniciar sesión.)');

  console.log('\n---- Desglose por empresa (tenant) ----');
  if (byTenant.size === 0) {
    console.log('  Ninguno. 🎉');
  } else {
    for (const [tenantId, info] of byTenant) {
      console.log(`  • ${info.name} [${tenantId}]: ${info.count} sintéticos` +
        (info.withPassword > 0 ? `  ⚠️ ${info.withPassword} con contraseña` : ''));
    }
  }

  if (showList) {
    console.log('\n---- Detalle de proveedores con email sintético ----');
    for (const p of synthetic) {
      console.log(
        `  [${p.tenant?.name ?? '?'}] ${p.companyName} | RFC=${p.rfc} | ` +
        `netsuiteId=${p.netsuiteId ?? '-'} | email=${p.user?.email} | ` +
        `status=${p.status} | creado=${p.createdAt.toISOString().slice(0, 10)}`
      );
    }
  } else if (synthetic.length > 0) {
    console.log('\n(Corre con --list para ver el detalle de cada proveedor.)');
  }

  console.log('\n=============================================================================\n');
}

main()
  .catch((e) => {
    console.error('Error en el diagnóstico:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
