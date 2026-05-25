import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { querySuiteQL } from '../../../lib/netsuite';

const prisma = new PrismaClient();

// Función para validar la estructura del RFC (Persona Física o Moral)
function isValidRFC(rfc: string) {
  if (!rfc) return false;
  // Limpiar espacios y guiones
  const cleanRFC = rfc.toUpperCase().replace(/\s/g, '').replace(/-/g, '');
  // Formato: 3-4 letras, 6 números, 3 alfanuméricos (homoclave)
  const rfcRegex = /^[A-ZÑ&]{3,4}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[A-Z0-9]{3}$/;
  return rfcRegex.test(cleanRFC);
}

export async function GET(request: Request) {
  const apiKey = request.headers.get('x-sync-key');
  const tenantId = request.headers.get('x-tenant-id');

  if (apiKey !== process.env.SYNC_API_KEY) {
    return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
  }

  if (!tenantId) {
    return NextResponse.json({ message: 'Falta cabecera x-tenant-id' }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { subsidiaries: true }
  });

  if (!tenant || !tenant.netsuiteAccountId || !tenant.netsuiteConsumerKey || !tenant.netsuiteConsumerSec || !tenant.netsuiteTokenId || !tenant.netsuiteTokenSecret) {
    return NextResponse.json({ message: 'Credenciales de NetSuite incompletas o empresa no encontrada' }, { status: 400 });
  }

  if (tenant.subsidiaries.length === 0) {
    return NextResponse.json({ message: 'No hay subsidiarias registradas para este tenant.' }, { status: 400 });
  }

  const creds = {
    accountId: tenant.netsuiteAccountId,
    consumerKey: tenant.netsuiteConsumerKey,
    consumerSecret: tenant.netsuiteConsumerSec,
    tokenId: tenant.netsuiteTokenId,
    tokenSecret: tenant.netsuiteTokenSecret
  };

  try {
    console.log('Iniciando sincronización de proveedores con validación de RFC...');

    const suiteqlQuery = `
      SELECT
        id,
        entityid as name,
        companyname,
        email,
        vatregnumber as rfc
      FROM
        Vendor
      WHERE
        isInactive = 'F'
    `;

    const results = await querySuiteQL(suiteqlQuery, creds);
    console.log(`Se encontraron ${results.length} proveedores en NetSuite.`);

    if (results.length === 0) {
      return NextResponse.json({ message: 'No se encontraron proveedores para sincronizar.' }, { status: 200 });
    }

    const defaultSubsidiary = tenant.subsidiaries[0];

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const vendor of results) {
      // Validar RFC antes de procesar
      if (!isValidRFC(vendor.rfc)) {
        console.log(`Saltando proveedor ${vendor.companyname || vendor.name} por RFC inválido: ${vendor.rfc}`);
        skippedCount++;
        continue;
      }

      const rfcValue = vendor.rfc.toUpperCase().replace(/\s/g, '').replace(/-/g, '');
      const emailValue = vendor.email || `${vendor.id}@netsuite.com`; // Mantenemos email por defecto para evitar errores en User
      const companyNameValue = vendor.companyname || vendor.name || 'Proveedor Sin Nombre';

      // 1. Upsert del Usuario
      const user = await prisma.user.upsert({
        where: { email: emailValue },
        update: { name: companyNameValue },
        create: {
          name: companyNameValue,
          email: emailValue,
          role: 'SUPPLIER',
          tenantId
        }
      });

      // 2. Upsert del Perfil de Proveedor
      const supplierData = {
        companyName: companyNameValue,
        taxAddress: 'Dirección no especificada',
        userId: user.id,
        subsidiaryId: defaultSubsidiary.id,
        status: 'ACTIVE' as const,
        netsuiteId: String(vendor.id),
      };

      const profile = await prisma.supplierProfile.upsert({
        where: {
          tenantId_rfc: {
            tenantId,
            rfc: rfcValue
          }
        },
        update: supplierData,
        create: {
          ...supplierData,
          rfc: rfcValue,
          tenantId
        }
      });

      if (profile.createdAt.getTime() === profile.updatedAt.getTime()) {
        createdCount++;
      } else {
        updatedCount++;
      }
    }

    return NextResponse.json({
      message: 'Sincronización completada exitosamente.',
      totalFound: results.length,
      createdCount,
      updatedCount,
      skippedCount
    }, { status: 200 });

  } catch (error) {
    console.error('Error durante la sincronización:', error);
    return NextResponse.json({ message: 'Error interno del servidor.', error: (error as Error).message }, { status: 500 });
  }
}
