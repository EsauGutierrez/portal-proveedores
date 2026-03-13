// app/api/sync/purchase-orders/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { querySuiteQL } from '../../../lib/netsuite'; // Importamos la nueva función

const prisma = new PrismaClient();

// Esta función se activará para iniciar la sincronización
export async function GET(request: Request) {
  // 1. Seguridad: Asegurarse de que solo un servicio autorizado pueda iniciar la sincronización
  const apiKey = request.headers.get('x-sync-key');
  const tenantId = request.headers.get('x-tenant-id'); // <-- Requerimos saber a qué empresa estamos mapeando los datos de NetSuite

  if (apiKey !== process.env.SYNC_API_KEY) {
    return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
  }

  if (!tenantId) {
    return NextResponse.json({ message: 'Falta cabecera x-tenant-id' }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant || !tenant.netsuiteAccountId || !tenant.netsuiteConsumerKey || !tenant.netsuiteConsumerSec || !tenant.netsuiteTokenId || !tenant.netsuiteTokenSecret) {
    return NextResponse.json({ message: 'Credenciales de NetSuite incompletas o empresa no encontrada' }, { status: 400 });
  }

  const creds = {
    accountId: tenant.netsuiteAccountId,
    consumerKey: tenant.netsuiteConsumerKey,
    consumerSecret: tenant.netsuiteConsumerSec,
    tokenId: tenant.netsuiteTokenId,
    tokenSecret: tenant.netsuiteTokenSecret
  };

  try {
    console.log('Iniciando sincronización de órdenes de compra desde NetSuite...');

    // 2. Definir la consulta SuiteQL para obtener las órdenes de compra
    const suiteqlQuery = `
      SELECT
        tranid as folio,
        trandate as fecha,
        BUILTIN.DF(subsidiary) as subsidiaria,
        BUILTIN.DF(entity) as proveedor,
        subtotal,
        total,
        entity as proveedorId -- ID interno del proveedor
      FROM
        transaction
      WHERE
        type = 'PurchOrd' AND mainLine = 'T'
    `;

    // 3. Ejecutar la consulta en NetSuite
    const results = await querySuiteQL(suiteqlQuery, creds);
    console.log(`Se encontraron ${results.length} órdenes de compra en NetSuite.`);

    if (results.length === 0) {
      return NextResponse.json({ message: 'No se encontraron nuevas órdenes de compra para sincronizar.' }, { status: 200 });
    }

    // 4. Transformar y Guardar en tu Base de Datos
    const syncResults = await prisma.$transaction(async (tx) => {
      let createdCount = 0;
      let updatedCount = 0;

      for (const po of results) {
        // Lógica para encontrar o crear el proveedor (usuario) en tu base de datos
        // Esto es crucial para conectar la orden de compra al proveedor correcto.
        const user = await tx.user.upsert({
          where: { email: `${po.proveedorId}@netsuite.com` }, // Usamos un email único basado en el ID de NetSuite
          update: { name: po.proveedor },
          create: {
            name: po.proveedor,
            email: `${po.proveedorId}@netsuite.com`, // Email de ejemplo
            tenantId // Asociar al proveedor con este tenant específico
          }
        });

        // Buscar subsidiaria por nombre dentro de este tenant (ya que rfc no es globalmente único)
        let subsidiary = await tx.subsidiary.findFirst({
          where: { tenantId, name: po.subsidiaria || 'GENERIC_NAME' }
        });

        // Si no existe, crearla
        if (!subsidiary) {
          subsidiary = await tx.subsidiary.create({
            data: {
              name: po.subsidiaria || 'GENERIC_NAME',
              rfc: po.subsidiaria || 'GENERIC_RFC',
              businessName: po.subsidiaria || 'GENERIC_NAME',
              taxRegime: 'GENERIC_REGIME',
              taxAddress: 'GENERIC_ADDRESS',
              tenantId // <- Asociar subsidiaria al tenant
            }
          })
        }

        // Mapeo de datos
        const purchaseOrderData = {
          folio: po.folio,
          fecha: new Date(po.fecha),
          subsidiaryId: subsidiary.id,
          subtotal: parseFloat(po.subtotal),
          total: parseFloat(po.total),
          userId: user.id, // Asignamos el ID del usuario/proveedor encontrado o creado
          tenantId, // <-- INYECTAR TENANT
        };

        // Operación "upsert": crea si no existe, actualiza si ya existe usando el UNIQUE COMPUESTO
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

  } catch (error) {
    console.error('Error durante la sincronización con NetSuite:', error);
    return NextResponse.json({ message: 'Error interno del servidor durante la sincronización.', error: (error as Error).message }, { status: 500 });
  }
}
