import { prisma } from './prisma';
import { querySuiteQL } from './netsuite';
import { checkLista69bBulk } from './zentax';

function isValidRFC(rfc: string) {
  if (!rfc) return false;
  const clean = rfc.toUpperCase().replace(/\s/g, '').replace(/-/g, '');
  return /^[A-ZÑ&]{3,4}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[A-Z0-9]{3}$/.test(clean);
}

export interface SupplierSyncResult {
  tenantId: string;
  tenantName: string;
  totalFound: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
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
    return { ...base, totalFound: 0, createdCount: 0, updatedCount: 0, skippedCount: 0, status: 'FAILED', error: 'Sin subsidiarias registradas.' };
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
    return { ...base, totalFound: 0, createdCount: 0, updatedCount: 0, skippedCount: 0, status: 'SUCCESS' };
  }

  const defaultSubsidiary = tenant.subsidiaries[0];
  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const vendor of vendors) {
    if (!isValidRFC(vendor.rfc)) { skippedCount++; continue; }

    const rfc = vendor.rfc.toUpperCase().replace(/\s/g, '').replace(/-/g, '');
    const email = vendor.email || `${vendor.id}@netsuite.com`;
    const companyName = vendor.companyname || vendor.name || 'Proveedor Sin Nombre';

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

    let existing = await prisma.supplierProfile.findFirst({ where: { tenantId, netsuiteId: String(vendor.id) } });
    if (!existing) existing = await prisma.supplierProfile.findFirst({ where: { tenantId, rfc } });
    if (!existing) existing = await prisma.supplierProfile.findFirst({ where: { tenantId, userId: user.id } });

    // Si encontramos perfil por netsuiteId/rfc pero el userId ya está en OTRO perfil del mismo tenant,
    // usar ese perfil para evitar violación de unique constraint en userId.
    if (existing) {
      const userProfile = await prisma.supplierProfile.findFirst({ where: { tenantId, userId: user.id } });
      if (userProfile && userProfile.id !== existing.id) {
        existing = userProfile;
      }
    }

    if (existing) {
      await prisma.supplierProfile.update({ where: { id: existing.id }, data: supplierData });
      updatedCount++;
    } else {
      await prisma.supplierProfile.create({ data: { ...supplierData, rfc, tenantId } });
      createdCount++;
    }
  }

  // Lista 69B — asíncrono, no bloquea la respuesta
  const GENERIC = ['XAXX010101000', 'XEXX010101000'];
  const rfcsToCheck = vendors
    .filter((v: any) => isValidRFC(v.rfc))
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

  return { ...base, totalFound: vendors.length, createdCount, updatedCount, skippedCount, status: 'SUCCESS' };
}
