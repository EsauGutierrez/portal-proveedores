// app/lib/auth.ts
// Estándar de autenticación/autorización para endpoints de src/app/api.
// Evita repetir jwt.verify + chequeo de rol/tenant en cada route.ts.

import jwt from 'jsonwebtoken';
import { NextResponse } from 'next/server';

export type DecodedToken = {
  userId: string;
  role: string;
  tenantId?: string;
  supplierProfileId?: string | null;
  assignedSupplierIds?: string[];
  email?: string;
  name?: string;
};

export type AuthResult =
  | { decoded: DecodedToken; error?: undefined }
  | { decoded?: undefined; error: NextResponse };

/**
 * Extrae y valida el JWT del header Authorization: Bearer <token>.
 * Si se pasa allowedRoles, además exige que decoded.role esté en esa lista.
 * Devuelve { decoded } en éxito o { error } con la respuesta 401/403 ya armada.
 */
export function requireAuth(request: Request, allowedRoles?: string[]): AuthResult {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: NextResponse.json({ message: 'No autorizado.' }, { status: 401 }) };
  }

  let decoded: DecodedToken;
  try {
    decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET!) as DecodedToken;
  } catch {
    return { error: NextResponse.json({ message: 'Token inválido o expirado.' }, { status: 401 }) };
  }

  if (allowedRoles && !allowedRoles.includes(decoded.role)) {
    return { error: NextResponse.json({ message: 'Acceso denegado.' }, { status: 403 }) };
  }

  return { decoded };
}

/**
 * Verifica que un recurso (tenantId de un SupplierProfile, Invoice, etc.) pertenezca
 * al tenant del usuario autenticado. SUPERADMIN se salta esta validación.
 * Devuelve la respuesta 403 si no coincide, o null si el acceso es válido.
 */
export function requireTenantMatch(decoded: DecodedToken, resourceTenantId: string | null | undefined): NextResponse | null {
  if (decoded.role === 'SUPERADMIN') return null;
  if (!resourceTenantId || decoded.tenantId !== resourceTenantId) {
    return NextResponse.json({ message: 'Acceso denegado.' }, { status: 403 });
  }
  return null;
}
