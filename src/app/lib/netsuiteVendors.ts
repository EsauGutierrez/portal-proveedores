// Helpers para operar sobre proveedores (Vendor) de NetSuite desde el portal:
//   - findVendorByRfc: verifica si ya existe un Vendor con cierto RFC (para bloquear invitaciones duplicadas)
//   - createVendorInNetSuite: crea un Vendor vía el RESTlet (acción 'createVendor')

import { querySuiteQL, invokeRestlet, NetSuiteCredentials } from './netsuite';

const FALLBACK_SCRIPT_ID = process.env.NETSUITE_SCRIPT_ID || '3878';
const FALLBACK_DEPLOY_ID = process.env.NETSUITE_DEPLOY_ID || '1';

export function normalizeRfc(rfc: string): string {
  return (rfc || '').toUpperCase().replace(/\s/g, '').replace(/-/g, '');
}

// Solo permitimos caracteres válidos de RFC para evitar inyección en la consulta SuiteQL.
function isSafeRfc(rfc: string): boolean {
  return /^[A-ZÑ&0-9]{12,13}$/.test(rfc);
}

export interface ExistingVendor {
  id: string;
  name: string;
}

/**
 * Busca un Vendor por RFC en NetSuite. Devuelve el vendor si existe, o null.
 * Prueba primero vatregnumber (cuentas sin SuiteTax) y luego custentity_mx_rfc (SuiteTax).
 */
export async function findVendorByRfc(rfc: string, creds: NetSuiteCredentials): Promise<ExistingVendor | null> {
  const clean = normalizeRfc(rfc);
  if (!isSafeRfc(clean)) return null;

  const runFor = async (field: string) => {
    const rows = await querySuiteQL(
      `SELECT id, entityid AS name, companyname FROM Vendor WHERE UPPER(${field}) = '${clean}'`,
      creds
    );
    if (rows && rows.length > 0) {
      const v = rows[0];
      return { id: String(v.id), name: v.companyname || v.name || `Vendor ${v.id}` } as ExistingVendor;
    }
    return null;
  };

  try {
    return await runFor('vatregnumber');
  } catch (err: any) {
    if (err.message?.includes("Unknown identifier 'vatregnumber'")) {
      try {
        return await runFor('custentity_mx_rfc');
      } catch {
        return null;
      }
    }
    throw err;
  }
}

export interface CreateVendorInput {
  companyName: string;
  rfc: string;
  email?: string;
  subsidiaryId?: string | null; // internal ID de subsidiaria NS (OneWorld); null/undefined = omitir
  isPerson?: boolean;
}

export interface CreateVendorResult {
  success: boolean;
  vendorId?: string;
  alreadyExists?: boolean;
  error?: string;
}

/**
 * Crea un Vendor en NetSuite vía el RESTlet. Usa el script/deploy del tenant si están
 * configurados, o los valores por defecto del entorno.
 */
export async function createVendorInNetSuite(
  input: CreateVendorInput,
  creds: NetSuiteCredentials,
  scriptId?: string | null,
  deployId?: string | null
): Promise<CreateVendorResult> {
  const payload = {
    action: 'createVendor',
    companyName: input.companyName,
    rfc: normalizeRfc(input.rfc),
    email: input.email,
    subsidiaryId: input.subsidiaryId || undefined,
    isPerson: Boolean(input.isPerson),
  };

  const response = await invokeRestlet(
    scriptId || FALLBACK_SCRIPT_ID,
    deployId || FALLBACK_DEPLOY_ID,
    creds,
    'POST',
    payload
  );

  // invokeRestlet devuelve el body ya parseado del RESTlet.
  return response as CreateVendorResult;
}
