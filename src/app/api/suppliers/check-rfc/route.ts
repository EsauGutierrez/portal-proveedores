// GET /api/suppliers/check-rfc?rfc=XXXX
// Verifica, en vivo durante la captura de la invitación, si un RFC ya existe:
//   - en NetSuite (Vendor) -> se usará para BLOQUEAR la invitación
//   - en el portal (SupplierProfile del mismo tenant) -> también se reporta
// Solo TENANT_ADMIN/ADMIN.

import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireAuth } from '../../../lib/auth';
import { findVendorByRfc, normalizeRfc } from '../../../lib/netsuiteVendors';

function isValidRFC(rfc: string) {
  const clean = normalizeRfc(rfc);
  return /^[A-ZÑ&]{3,4}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[A-Z0-9]{3}$/.test(clean);
}

export async function GET(request: Request) {
  const auth = await requireAuth(request, ['ADMIN', 'TENANT_ADMIN']);
  if (auth.error) return auth.error;
  const { decoded } = auth;

  const { searchParams } = new URL(request.url);
  const rfcRaw = searchParams.get('rfc') || '';
  const rfc = normalizeRfc(rfcRaw);

  if (!isValidRFC(rfc)) {
    return NextResponse.json({ valid: false, message: 'RFC con formato inválido.' }, { status: 200 });
  }

  if (!decoded.tenantId) {
    return NextResponse.json({ message: 'Token sin tenant.' }, { status: 400 });
  }

  // 1. ¿Ya existe en el portal (mismo tenant)?
  const portalProfile = await prisma.supplierProfile.findFirst({
    where: { tenantId: decoded.tenantId, rfc },
    select: { id: true, companyName: true },
  });

  // 2. ¿Ya existe en NetSuite?
  const tenant = await prisma.tenant.findUnique({
    where: { id: decoded.tenantId },
    select: {
      netsuiteAccountId: true, netsuiteConsumerKey: true, netsuiteConsumerSec: true,
      netsuiteTokenId: true, netsuiteTokenSecret: true,
    },
  });

  let existsInNetsuite = false;
  let netsuiteVendorName: string | null = null;
  let netsuiteCheckError: string | null = null;

  if (tenant?.netsuiteAccountId && tenant.netsuiteConsumerKey && tenant.netsuiteConsumerSec && tenant.netsuiteTokenId && tenant.netsuiteTokenSecret) {
    try {
      const vendor = await findVendorByRfc(rfc, {
        accountId: tenant.netsuiteAccountId,
        consumerKey: tenant.netsuiteConsumerKey,
        consumerSecret: tenant.netsuiteConsumerSec,
        tokenId: tenant.netsuiteTokenId,
        tokenSecret: tenant.netsuiteTokenSecret,
      });
      if (vendor) {
        existsInNetsuite = true;
        netsuiteVendorName = vendor.name;
      }
    } catch (err: any) {
      // No bloqueamos la captura por un fallo de conexión; lo reportamos como advertencia.
      netsuiteCheckError = err?.message || 'No se pudo verificar en NetSuite.';
      console.error('[CHECK-RFC] Error consultando NetSuite:', netsuiteCheckError);
    }
  } else {
    netsuiteCheckError = 'Credenciales de NetSuite incompletas para este tenant.';
  }

  return NextResponse.json({
    valid: true,
    rfc,
    existsInPortal: Boolean(portalProfile),
    portalCompanyName: portalProfile?.companyName ?? null,
    existsInNetsuite,
    netsuiteVendorName,
    netsuiteCheckError,
  }, { status: 200 });
}
