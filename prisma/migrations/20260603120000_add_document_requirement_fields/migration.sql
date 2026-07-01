-- Crea el enum SupplierType si no existe
DO $$ BEGIN
  CREATE TYPE "SupplierType" AS ENUM ('NATIONAL', 'FOREIGN', 'BOTH');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Agrega columnas nuevas a DocumentRequirement (IF NOT EXISTS = idempotente)
ALTER TABLE "DocumentRequirement"
  ADD COLUMN IF NOT EXISTS "name"         TEXT           NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "isActive"     BOOLEAN        NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "isSystem"     BOOLEAN        NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "supplierType" "SupplierType" NOT NULL DEFAULT 'BOTH';

-- Data migration: nombre e isSystem para los 5 documentos del sistema
UPDATE "DocumentRequirement"
  SET "name" = 'Constancia de Situación Fiscal', "isSystem" = true, "supplierType" = 'NATIONAL'
  WHERE "documentType" = 'CONSTANCIA_SITUACION_FISCAL' AND "name" = '';

UPDATE "DocumentRequirement"
  SET "name" = 'Opinión de Cumplimiento (SAT)', "isSystem" = true, "supplierType" = 'NATIONAL'
  WHERE "documentType" = 'OPINION_CUMPLIMIENTO_SAT' AND "name" = '';

UPDATE "DocumentRequirement"
  SET "name" = 'Identificación Oficial del Representante', "isSystem" = true, "supplierType" = 'NATIONAL'
  WHERE "documentType" = 'IDENTIFICACION_OFICIAL' AND "name" = '';

UPDATE "DocumentRequirement"
  SET "name" = 'Comprobante de Domicilio', "isSystem" = true, "supplierType" = 'NATIONAL'
  WHERE "documentType" = 'COMPROBANTE_DOMICILIO' AND "name" = '';

UPDATE "DocumentRequirement"
  SET "name" = 'Acta Constitutiva', "isSystem" = true, "supplierType" = 'NATIONAL'
  WHERE "documentType" = 'ACTA_CONSTITUTIVA' AND "name" = '';
