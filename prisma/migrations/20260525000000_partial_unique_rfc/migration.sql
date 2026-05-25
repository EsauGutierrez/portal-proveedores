-- Reemplaza el índice único (tenantId, rfc) por uno parcial que excluye
-- los RFC genéricos del SAT (XAXX010101000, XEXX010101000), permitiendo
-- que múltiples proveedores compartan esos valores dentro del mismo tenant.

-- 1. Eliminar la restricción única original
DROP INDEX IF EXISTS "SupplierProfile_tenantId_rfc_key";

-- 2. Crear índice único parcial solo para RFC no genéricos
CREATE UNIQUE INDEX "SupplierProfile_tenantId_rfc_unique_non_generic"
  ON "SupplierProfile" ("tenantId", "rfc")
  WHERE "rfc" NOT IN ('XAXX010101000', 'XEXX010101000');
