import { prisma } from './prisma';
import { querySuiteQL } from './netsuite';
import { checkLista69bBulk } from './zentax';

function isValidRFC(rfc: string) {
  if (!rfc) return false;
  const clean = rfc.toUpperCase().replace(/\s/g, '').replace(/-/g, '');
  return /^[A-ZÑ&]{3,4}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[A-Z0-9]{3}$/.test(clean);
}

function isValidEmail(email: unknown): email is string {
  if (typeof email !== 'string') return false;
  const clean = email.trim();
  // Formato básico de correo; NetSuite a veces trae valores basura en el campo email.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
}

export interface SupplierSyncResult {
  tenantId: string;
  tenantName: string;
  totalFound: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  conflictCount: number;
  status: 'SUCCESS' | 'FAILED';
  error?: string;
}

export async function syncSuppliersForTenant(
  tenantId: string,
  tenant: {
    name: string;
    netsuiteAccountId: string;
    netsuiteConsumerKey: string;
    netsuiteConsumerSec: string;
    netsuiteTokenId: string;
    netsuiteTokenSecret: string;
    subsidiaries: Array<{ id: string }>;
  }
): Promise<SupplierSyncResult> {
  const base = { tenantId, tenantName: tenant.name };

  if (tenant.subsidiaries.length === 0) {
    return { ...base, totalFound: 0, createdCount: 0, updatedCount: 0, skippedCount: 0, conflictCount: 0, status: 'FAILED', error: 'Sin subsidiarias registradas.' };
  }

  const creds = {
    accountId: tenant.netsuiteAccountId,
    consumerKey: tenant.netsuiteConsumerKey,
    consumerSecret: tenant.netsuiteConsumerSec,
    tokenId: tenant.netsuiteTokenId,
    tokenSecret: tenant.netsuiteTokenSecret,
  };

  // vatregnumber = RFC directo (cuentas sin SuiteTax)
  // SuiteTax: defaulttaxreg es un ID interno; el RFC real está en taxregistration.taxregistrationnumber
  let vendors: any[];
  try {
    vendors = await querySuiteQL(
      `SELECT id, entityid as name, companyname, email, vatregnumber as rfc FROM Vendor WHERE isInactive = 'F'`,
      creds
    );
  } catch (err: any) {
    if (err.message?.includes("Unknown identifier 'vatregnumber'")) {
      vendors = await querySuiteQL(
        `SELECT id, entityid as name, companyname, email, custentity_mx_rfc as rfc FROM Vendor WHERE isInactive = 'F'`,
        creds
      );
    } else {
      throw err;
    }
  }

  if (vendors.length === 0) {
    return { ...base, totalFound: 0, createdCount: 0, updatedCount: 0, skippedCount: 0, conflictCount: 0, status: 'SUCCESS' };
  }

  const defaultSubsidiary = tenant.subsidiaries[0];
  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let conflictCount = 0;

  for (const vendor of vendors) {
    // Filtro de calidad de datos: el proveedor entra al portal SOLO si su ficha en
    // NetSuite está completa. Sin email real ya no se genera un usuario sintético;
    // simplemente se omite hasta que se complete en NetSuite. Sus órdenes de compra
    // se vuelven visibles apenas cumple estos requisitos y aparece en el portal.
    const companyName = (vendor.companyname || vendor.name || '').trim();

    if (!isValidRFC(vendor.rfc)) {
      console.warn(`[SYNC SUPPLIERS] Omitido: RFC inválido o ausente. vendor=${vendor.id}, rfc=${vendor.rfc ?? '(vacío)'}.`);
      skippedCount++; continue;
    }
    if (!isValidEmail(vendor.email)) {
      console.warn(`[SYNC SUPPLIERS] Omitido: sin email válido en NetSuite. vendor=${vendor.id} (${companyName || 'sin nombre'}).`);
      skippedCount++; continue;
    }
    if (!companyName) {
      console.warn(`[SYNC SUPPLIERS] Omitido: sin razón social/nombre en NetSuite. vendor=${vendor.id}.`);
      skippedCount++; continue;
    }
    if (!vendor.id) {
      console.warn(`[SYNC SUPPLIERS] Omitido: sin netsuiteId. (${companyName}).`);
      skippedCount++; continue;
    }

    const rfc = vendor.rfc.toUpperCase().replace(/\s/g, '').replace(/-/g, '');
    const email = vendor.email.trim();

    const user = await prisma.user.upsert({
      where: { email },
      update: { name: companyName },
      create: { name: companyName, email, role: 'SUPPLIER', tenantId },
    });

    const supplierData = {
      companyName,
      taxAddress: 'Dirección no especificada',
      userId: user.id,
      subsidiaryId: defaultSubsidiary.id,
      status: 'ACTIVE' as const,
      netsuiteId: String(vendor.id),
    };

    // userId es único GLOBAL. Resolvemos primero el perfil ligado a este usuario en
    // cualquier tenant, porque manda sobre la coincidencia por netsuiteId/RFC: si
    // actualizáramos otro perfil poniéndole este userId, se violaría el índice único.
    const userProfileGlobal = await prisma.supplierProfile.findUnique({ where: { userId: user.id } });

    // Si el usuario ya pertenece a OTRO tenant (típicamente por compartir un email real
    // entre empresas), no podemos representar este proveedor aquí sin violar la unicidad
    // global. Omitimos ese proveedor y seguimos con el resto en lugar de abortar.
    if (userProfileGlobal && userProfileGlobal.tenantId !== tenantId) {
      console.warn(
        `[SYNC SUPPLIERS] Proveedor omitido por conflicto de usuario entre tenants: ` +
        `vendor=${vendor.id} (${companyName}), email=${email}, ` +
        `usuario ya ligado al tenant ${userProfileGlobal.tenantId}.`
      );
      conflictCount++;
      continue;
    }

    // Perfil existente EN ESTE tenant. Si el usuario ya tiene uno aquí, ese es el
    // canónico; si no, buscamos por netsuiteId y luego por RFC.
    let existing = userProfileGlobal; // aquí userProfileGlobal es null o de este tenant
    if (!existing) existing = await prisma.supplierProfile.findFirst({ where: { tenantId, netsuiteId: String(vendor.id) } });
    if (!existing) existing = await prisma.supplierProfile.findFirst({ where: { tenantId, rfc } });

    try {
      if (existing) {
        await prisma.supplierProfile.update({ where: { id: existing.id }, data: supplierData });
        updatedCount++;
      } else {
        await prisma.supplierProfile.create({ data: { ...supplierData, rfc, tenantId } });
        createdCount++;
      }
    } catch (err: any) {
      // Red de seguridad ante una colisión de unicidad no anticipada (p. ej. carrera
      // entre dos syncs). No tumbamos todo el proceso: registramos y continuamos.
      if (err?.code === 'P2002') {
        console.warn(
          `[SYNC SUPPLIERS] Proveedor omitido por violación de unicidad (${(err.meta?.target ?? []).toString()}): ` +
          `vendor=${vendor.id} (${companyName}), email=${email}.`
        );
        conflictCount++;
        continue;
      }
      throw err;
    }
  }

  // Lista 69B — asíncrono, no bloquea la respuesta.
  // Solo verificamos proveedores que califican (mismos requisitos que la sincronización),
  // para no gastar llamadas a Zentax en proveedores que no entraron al portal.
  const GENERIC = ['XAXX010101000', 'XEXX010101000'];
  const rfcsToCheck = vendors
    .filter((v: any) => isValidRFC(v.rfc) && isValidEmail(v.email) && (v.companyname || v.name) && v.id)
    .map((v: any) => v.rfc.toUpperCase().replace(/\s/g, '').replace(/-/g, ''))
    .filter((r: string) => !GENERIC.includes(r));

  if (rfcsToCheck.length > 0) {
    checkLista69bBulk(rfcsToCheck)
      .then(async (zentaxResults: any[]) => {
        const map = new Map(zentaxResults.map((r: any) => [r.rfc, r.status]));
        const now = new Date();
        const profiles = await prisma.supplierProfile.findMany({
          where: { tenantId, rfc: { in: rfcsToCheck } },
          select: { id: true, rfc: true },
        });
        for (const p of profiles) {
          await prisma.supplierProfile.update({
            where: { id: p.id },
            data: { lista69bStatus: map.get(p.rfc) ?? 'NO_LISTADO', lista69bCheckedAt: now } as any,
          });
        }
      })
      .catch((err: any) => console.error('[LISTA69B] Error en sync proveedores:', err.message));
  }

  return { ...base, totalFound: vendors.length, createdCount, updatedCount, skippedCount, conflictCount, status: 'SUCCESS' };
}
