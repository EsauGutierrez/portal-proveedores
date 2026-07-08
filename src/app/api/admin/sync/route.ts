import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { querySuiteQL } from '../../../lib/netsuite';
import jwt from 'jsonwebtoken';

export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
        }
        const token = authHeader.split(' ')[1];

        let decodedToken: any;
        try {
            decodedToken = jwt.verify(token, process.env.JWT_SECRET!);
        } catch (err) {
            return NextResponse.json({ message: 'Token inválido' }, { status: 401 });
        }

        if (decodedToken.role !== 'TENANT_ADMIN' && decodedToken.role !== 'ADMIN') {
            return NextResponse.json({ message: 'No autorizado para sincronizar' }, { status: 403 });
        }

        const tenantId = decodedToken.tenantId;

        if (!tenantId) {
            return NextResponse.json({ message: 'No se encontró el Tenant ID en el token' }, { status: 400 });
        }

        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!tenant || !tenant.netsuiteAccountId || !tenant.netsuiteConsumerKey || !tenant.netsuiteConsumerSec || !tenant.netsuiteTokenId || !tenant.netsuiteTokenSecret) {
            return NextResponse.json({ message: 'Credenciales de NetSuite incompletas en la configuración de la empresa. Por favor, agregalas desde el Admin de Clientes.' }, { status: 400 });
        }

        const creds = {
            accountId: tenant.netsuiteAccountId,
            consumerKey: tenant.netsuiteConsumerKey,
            consumerSecret: tenant.netsuiteConsumerSec,
            tokenId: tenant.netsuiteTokenId,
            tokenSecret: tenant.netsuiteTokenSecret
        };

        const subsidiaries = await prisma.subsidiary.findMany({
            where: { tenantId }
        });

        // Solo filtra si hay subsidiarias, de lo contrario bajará todas
        // Nota: BUILTIN.DF(subsidiary) retorna el nombre, por lo que usaremos esos para filtrar
        const subsidiaryNames = subsidiaries.map(sub => sub.name.replace(/'/g, "''")); // Escape por si hay comillas simples

        let subsidiaryFilter = '';
        if (subsidiaryNames.length > 0) {
            const inClause = subsidiaryNames.map(name => `'${name}'`).join(', ');
            subsidiaryFilter = `AND BUILTIN.DF(subsidiary) IN (${inClause})`;
        }

        console.log('Iniciando sincronización manual de órdenes de compra desde NetSuite para tenant:', tenantId);

        const suiteqlQuery = `
      SELECT
        tranid as folio,
        trandate as fecha,
        BUILTIN.DF(subsidiary) as subsidiaria,
        BUILTIN.DF(entity) as proveedor,
        subtotal,
        total,
        entity as proveedorId
      FROM
        transaction
      WHERE
        type = 'PurchOrd' AND mainLine = 'T' ${subsidiaryFilter}
    `;

        const results = await querySuiteQL(suiteqlQuery, creds);
        console.log(`Se encontraron ${results.length} órdenes de compra en NetSuite.`);

        if (results.length === 0) {
            return NextResponse.json({ message: 'Prueba de conexión exitosa, pero no se encontraron órdenes.' }, { status: 200 });
        }

        const syncResults = await prisma.$transaction(async (tx) => {
            let createdCount = 0;
            let updatedCount = 0;

            for (const po of results) {
                // En un caso real: aquí se enviaría correo o algo similar, por ahora solo upsert en users
                const user = await tx.user.upsert({
                    where: { email: `${po.proveedorId}@netsuite.com` },
                    update: { name: po.proveedor },
                    create: {
                        name: po.proveedor,
                        email: `${po.proveedorId}@netsuite.com`,
                        tenantId,
                        role: 'SUPPLIER'
                    }
                });

                // Aseguramos Subsidiary (Si la requiere para OC)
                let subsidiary = await tx.subsidiary.findFirst({
                    where: { tenantId, name: po.subsidiaria || 'GENERIC_NAME' }
                });

                if (!subsidiary) {
                    subsidiary = await tx.subsidiary.create({
                        data: {
                            name: po.subsidiaria || 'GENERIC_NAME',
                            rfc: 'GENERIC_RFC',
                            businessName: po.subsidiaria || 'GENERIC_NAME',
                            taxRegime: 'GENERIC_REGIME',
                            taxAddress: 'GENERIC_ADDRESS',
                            tenantId
                        }
                    })
                }

                const purchaseOrderData = {
                    folio: po.folio,
                    fecha: new Date(po.fecha),
                    subsidiaryId: subsidiary.id,
                    subtotal: parseFloat(po.subtotal) || 0,
                    total: parseFloat(po.total) || 0,
                    userId: user.id,
                    tenantId,
                };

                const record = await tx.purchaseOrder.upsert({
                    where: { tenantId_folio: { tenantId, folio: purchaseOrderData.folio } },
                    update: purchaseOrderData,
                    create: purchaseOrderData,
                });

                if (record.createdAt.getTime() === record.updatedAt.getTime()) {
                    createdCount++;
                } else {
                    updatedCount++;
                }
            }
            return { createdCount, updatedCount };
        });

        return NextResponse.json({
            message: 'Sincronización completada exitosamente.',
            ...syncResults
        }, { status: 200 });

    } catch (error: any) {
        console.error('Error durante la sincronización:', error);
        return NextResponse.json({
            message: 'Error interno del servidor durante la sincronización.',
            error: error.message,
            stack: error.stack,
            fullError: JSON.stringify(error)
        }, { status: 500 });
    }
}
