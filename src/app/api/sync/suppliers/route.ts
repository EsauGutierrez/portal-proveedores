import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { querySuiteQL } from '../../../lib/netsuite';
import { checkLista69bBulk } from '../../../lib/zentax';

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

    let results: any[];
    try {
      results = await querySuiteQL(suiteqlQuery, creds);
    } catch (vatErr: any) {
      if (vatErr.message?.includes("Unknown identifier 'vatregnumber'")) {
        results = await querySuiteQL(
          `SELECT id, entityid as name, companyname, email, custentity_mx_rfc as rfc FROM Vendor WHERE isInactive = 'F'`,
          creds
        );
      } else {
        throw vatErr;
      }
    }
    console.log(`Se encontraron ${results.length} proveedores en NetSuite.`);

    if (results.length === 0) {
      return NextResponse.json({ message: 'No se encontraron proveedores para sincronizar.' }, { status: 200 });
    }

    const defaultSubsidiary = tenant.subsidiaries[0];

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let conflictCount = 0;

    for (const vendor of results) {
      // Validar RFC antes de procesar
      if (!isValidRFC(vendor.rfc)) {
        console.log(`Saltando proveedor ${vendor.companyname || vendor.name} por RFC inválido: ${vendor.rfc}`);
        skippedCount++;
        continue;
      }

      const rfcValue = vendor.rfc.toUpperCase().replace(/\s/g, '').replace(/-/g, '');
      // Email sintético único por tenant: los IDs internos de NetSuite reinician por
      // cuenta, así que sin el netsuiteAccountId dos tenants generarían el mismo email
      // y colisionarían en el índice único global de User.
      const emailValue = vendor.email || `${vendor.id}@${tenant.netsuiteAccountId}.netsuite.local`;
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

      // Buscar perfil existente: por netsuiteId, luego por RFC, luego por userId
      let existing = await prisma.supplierProfile.findFirst({
        where: { tenantId, netsuiteId: String(vendor.id) },
      });
      if (!existing) {
        existing = await prisma.supplierProfile.findFirst({
          where: { tenantId, rfc: rfcValue },
        });
      }
      if (!existing) {
        existing = await prisma.supplierProfile.findUnique({
          where: { userId: user.id },
        });
      }

      // userId es único GLOBAL: si el usuario resuelto ya tiene un perfil en OTRO tenant
      // (típicamente por compartir email real entre empresas), no podemos crear otro
      // perfil para él. Omitimos ese proveedor y seguimos con el resto.
      if (existing && existing.tenantId !== tenantId) {
        console.warn(`[SYNC SUPPLIERS] Proveedor omitido por conflicto de usuario entre tenants: vendor=${vendor.id} (${companyNameValue}), usuario ligado al tenant ${existing.tenantId}.`);
        conflictCount++;
        continue;
      }

      if (existing) {
        await prisma.supplierProfile.update({
          where: { id: existing.id },
          data: supplierData,
        });
        updatedCount++;
      } else {
        try {
          await prisma.supplierProfile.create({
            data: { ...supplierData, rfc: rfcValue, tenantId },
          });
          createdCount++;
        } catch (err: any) {
          // Red de seguridad ante colisión de unicidad no anticipada (p. ej. carrera
          // entre dos syncs). No abortamos todo el proceso.
          if (err?.code === 'P2002') {
            console.warn(`[SYNC SUPPLIERS] Proveedor omitido por violación de unicidad (${(err.meta?.target ?? []).toString()}): vendor=${vendor.id} (${companyNameValue}).`);
            conflictCount++;
            continue;
          }
          throw err;
        }
      }
    }

    // Verificar Lista 69B en batch para todos los RFC procesados
    const GENERIC_RFCS = ['XAXX010101000', 'XEXX010101000'];
    const rfcsToCheck = results
      .filter((v: any) => v.rfc && isValidRFC(v.rfc))
      .map((v: any) => v.rfc.toUpperCase().replace(/\s/g, '').replace(/-/g, ''))
      .filter((rfc: string) => !GENERIC_RFCS.includes(rfc));

    if (rfcsToCheck.length > 0) {
      checkLista69bBulk(rfcsToCheck).then(async (zentaxResults) => {
        const zentaxMap = new Map(zentaxResults.map((r: any) => [r.rfc, r.status]));
        const now = new Date();
        const profiles = await prisma.supplierProfile.findMany({
          where: { tenantId, rfc: { in: rfcsToCheck } },
          select: { id: true, rfc: true },
        });
        for (const profile of profiles) {
          const status = zentaxMap.get(profile.rfc) ?? 'NO_LISTADO';
          await prisma.supplierProfile.update({
            where: { id: profile.id },
            data: { lista69bStatus: status, lista69bCheckedAt: now } as any,
          });
        }
      }).catch((err: any) => {
        console.error('[LISTA69B] Error en sync de proveedores NetSuite:', err.message);
      });
    }

    return NextResponse.json({
      message: 'Sincronización completada exitosamente.',
      totalFound: results.length,
      createdCount,
      updatedCount,
      skippedCount,
      conflictCount
    }, { status: 200 });

  } catch (error) {
    console.error('Error durante la sincronización:', error);
    return NextResponse.json({ message: 'Error interno del servidor.', error: (error as Error).message }, { status: 500 });
  }
}
