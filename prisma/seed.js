const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
    console.log(`Empenzando a crear datos semilla (seed)...`);

    // 1. Crear el Super Admin (Tú)
    const superAdminPassword = await bcrypt.hash('AdminPortal123!', 10);
    const superAdmin = await prisma.user.upsert({
        where: { email: 'superadmin@imr.com.mx' },
        update: {},
        create: {
            email: 'superadmin@imr.com.mx',
            name: 'Super Administrador (Esau)',
            password: superAdminPassword,
            role: 'SUPERADMIN',
            // No lleva tenantId porque es el master
        },
    });
    console.log(`✅ Super Admin creado: ${superAdmin.email}`);

    // 2. Crear una Empresa Cliente (Tenant)
    const tenant1 = await prisma.tenant.create({
        data: {
            name: 'Impacto GL',
            isActive: true,
            // Credenciales NetSuite falsas para prueba
            netsuiteAccountId: '123456_SB1',
            netsuiteConsumerKey: 'dummy-consumer-key',
        },
    });
    console.log(`✅ Tenant creado: ${tenant1.name}`);

    // 3. Crear el Administrador de ese Tenant
    const tenantAdminPassword = await bcrypt.hash('Cliente123!', 10);
    const tenantAdmin = await prisma.user.upsert({
        where: { email: 'admin@impactogl.com' },
        update: {},
        create: {
            email: 'admin@impactogl.com',
            name: 'Admin Impacto GL',
            password: tenantAdminPassword,
            role: 'TENANT_ADMIN',
            tenantId: tenant1.id, // Lo atamos a Impacto GL
        },
    });
    console.log(`✅ Tenant Admin creado: ${tenantAdmin.email}`);

    // 4. Crear una Subsidiaria de NetSuite para ese Tenant
    const subsidiary = await prisma.subsidiary.create({
        data: {
            name: 'Impacto GL - México',
            businessName: 'Impactos Globales S.A. de C.V.',
            rfc: 'IGL010101XYZ',
            taxRegime: '601 - General de Ley Personas Morales',
            taxAddress: 'Av. Reforma 123, CDMX',
            tenantId: tenant1.id, // Pertenece a Impacto GL
        },
    });
    console.log(`✅ Subsidiaria creada: ${subsidiary.name}`);

    // 5. Crear un Proveedor (SUPPLIER) para esta empresa
    const supplierPassword = await bcrypt.hash('Proveedor123!', 10);
    const supplierUser = await prisma.user.upsert({
        where: { email: 'proveedor@gmail.com' },
        update: {},
        create: {
            email: 'proveedor@gmail.com',
            name: 'Juan Proveedor',
            password: supplierPassword,
            role: 'SUPPLIER',
            tenantId: tenant1.id, // Trabaja para Impacto GL
            supplierProfile: {
                create: {
                    companyName: 'Tecnologías Juanito',
                    rfc: 'TUJU800101QWE',
                    taxAddress: 'Calle Falsa 123',
                    status: 'ACTIVE', // Ya está activo para poder hacer login
                    subsidiaryId: subsidiary.id,
                    tenantId: tenant1.id,
                },
            },
        },
    });
    console.log(`✅ Proveedor creado: ${supplierUser.email}`);

    console.log(`\n🎉 Seed completado exitosamente.\n`);
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
