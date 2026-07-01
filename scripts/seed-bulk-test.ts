/**
 * Seed / cleanup de datos de prueba para carga masiva de complementos.
 *
 * Crear datos:   npx ts-node scripts/seed-bulk-test.ts seed
 * Eliminar todo: npx ts-node scripts/seed-bulk-test.ts clean
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const TENANT_ID       = 'cmppo2pk50001vf78t7wm9dnl';
const RFC_PROVEEDOR   = 'AXT940727FP8';
const RFC_RECEPTOR    = 'CAM001002PX6';
const UUID_FACTURA    = 'c161acda-23d9-4841-98d2-67a2d58fa6e0';
const NS_BILL_ID      = '120830';  // VendorBill real en NetSuite (Abierta)
const NS_VENDOR_ID    = '5787';    // ID interno del proveedor AXTEL en NetSuite
const TEST_SUB_ID     = 'test-sub-cam001';
const TEST_EMAIL      = 'proveedor-test-axtel@test.com';

async function seed() {
  console.log('🌱 Creando datos de prueba...\n');

  const sub = await prisma.subsidiary.upsert({
    where: { id: TEST_SUB_ID },
    update: { rfc: RFC_RECEPTOR },
    create: {
      id: TEST_SUB_ID,
      name: 'Conteck Americas (Test)',
      businessName: 'CONTECK AMERICAS SA DE CV',
      rfc: RFC_RECEPTOR,
      taxRegime: '601',
      taxAddress: 'Guadalajara, JAL 44660',
      tenantId: TENANT_ID,
    },
  });
  console.log(`✅ Subsidiaria:       ${sub.name}  RFC=${sub.rfc}`);

  const passwordHash = await bcrypt.hash('Test1234!', 10);
  const user = await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    update: {},
    create: {
      email: TEST_EMAIL,
      name: 'AXTEL SA B DE CV (Test)',
      password: passwordHash,
      role: 'SUPPLIER',
      tenantId: TENANT_ID,
      firstLogin: false,
    },
  });
  console.log(`✅ Usuario:           ${user.email}`);

  const profile = await prisma.supplierProfile.upsert({
    where: { userId: user.id },
    update: { rfc: RFC_PROVEEDOR, status: 'ACTIVE', netsuiteId: NS_VENDOR_ID },
    create: {
      companyName: 'AXTEL SA B DE CV',
      rfc: RFC_PROVEEDOR,
      taxAddress: 'Guadalajara, JAL',
      status: 'ACTIVE',
      userId: user.id,
      subsidiaryId: sub.id,
      tenantId: TENANT_ID,
      netsuiteId: NS_VENDOR_ID,
      requireDocuments: false,
    },
  });
  console.log(`✅ Perfil proveedor:  RFC=${profile.rfc}  NS_ID=${profile.netsuiteId}`);

  const invoice = await prisma.invoice.upsert({
    where: { tenantId_folio: { tenantId: TENANT_ID, folio: UUID_FACTURA } },
    update: { syncStatus: 'SYNCED', netsuiteId: NS_BILL_ID },
    create: {
      folio: UUID_FACTURA,
      fecha: new Date('2026-04-01'),
      subtotal: 7000.00,
      tax: 1120.00,
      total: 8120.00,
      syncStatus: 'SYNCED',
      netsuiteId: NS_BILL_ID,
      userId: user.id,
      tenantId: TENANT_ID,
    },
  });
  console.log(`✅ Factura:           folio=${invoice.folio}  syncStatus=${invoice.syncStatus}`);

  console.log('\n─────────────────────────────────────────');
  console.log('Acceso al portal:');
  console.log('  Email:    proveedor-test-axtel@test.com');
  console.log('  Password: Test1234!');
  console.log('─────────────────────────────────────────');
  console.log('\nCuando termines corre:  npx ts-node scripts/seed-bulk-test.ts clean\n');
}

async function clean() {
  console.log('🧹 Eliminando datos de prueba...\n');

  // 1. Eliminar complementos de la factura de prueba
  const invoice = await prisma.invoice.findFirst({
    where: { tenantId: TENANT_ID, folio: UUID_FACTURA },
  });
  if (invoice) {
    const deleted = await prisma.paymentComplement.deleteMany({
      where: { invoiceId: invoice.id },
    });
    if (deleted.count) console.log(`🗑  ${deleted.count} complemento(s) de pago eliminado(s)`);
    await prisma.invoice.delete({ where: { id: invoice.id } });
    console.log('🗑  Factura de prueba eliminada');
  }

  // 2. Eliminar perfiles vinculados a la subsidiaria de prueba (huérfanos o no)
  const profilesDeleted = await prisma.supplierProfile.deleteMany({
    where: { subsidiaryId: TEST_SUB_ID },
  });
  if (profilesDeleted.count) console.log(`🗑  ${profilesDeleted.count} perfil(es) de proveedor eliminado(s)`);

  // 3. Eliminar usuario de prueba (y su perfil propio si quedó sin subsidiaryId)
  const user = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
  if (user) {
    await prisma.supplierProfile.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    console.log('🗑  Usuario de prueba eliminado');
  } else {
    console.log('ℹ️  Usuario de prueba no encontrado');
  }

  // 4. Eliminar subsidiaria (ya sin FK que la referencien)
  const sub = await prisma.subsidiary.findUnique({ where: { id: TEST_SUB_ID } });
  if (sub) {
    await prisma.subsidiary.delete({ where: { id: TEST_SUB_ID } });
    console.log('🗑  Subsidiaria de prueba eliminada');
  }

  console.log('\n✅ Limpieza completa.\n');
}

const cmd = process.argv[2];
if (cmd === 'clean') {
  clean().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
} else if (cmd === 'seed') {
  seed().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
} else {
  console.log('Uso:');
  console.log('  npx ts-node scripts/seed-bulk-test.ts seed   ← crea datos de prueba');
  console.log('  npx ts-node scripts/seed-bulk-test.ts clean  ← elimina todo lo creado');
  process.exit(1);
}
