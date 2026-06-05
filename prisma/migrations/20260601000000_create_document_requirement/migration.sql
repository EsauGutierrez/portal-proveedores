-- Crea la tabla DocumentRequirement si aún no existe.
-- IF NOT EXISTS garantiza que la migración sea idempotente:
-- en ambientes donde la tabla ya fue creada con db push, este bloque es un no-op.

CREATE TABLE IF NOT EXISTS "DocumentRequirement" (
    "id"           TEXT    NOT NULL,
    "documentType" TEXT    NOT NULL,
    "isRequired"   BOOLEAN NOT NULL DEFAULT true,
    "isOcrEnabled" BOOLEAN NOT NULL DEFAULT true,
    "tenantId"     TEXT    NOT NULL,

    CONSTRAINT "DocumentRequirement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DocumentRequirement_tenantId_documentType_key"
  ON "DocumentRequirement"("tenantId", "documentType");

-- Agrega la FK solo si no existe ya (patrón estándar en PostgreSQL)
DO $$ BEGIN
  ALTER TABLE "DocumentRequirement"
    ADD CONSTRAINT "DocumentRequirement_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
