-- Fase 1: Rol CARGADOR + Carga Masiva
-- Nuevos valores en enums existentes
ALTER TYPE "Role" ADD VALUE 'CARGADOR';
ALTER TYPE "InvoiceSyncStatus" ADD VALUE 'PENDING_ASSIGNMENT';

-- Nuevos enums
CREATE TYPE "MatchMethod" AS ENUM ('AUTO', 'MANUAL', 'STANDALONE');
CREATE TYPE "BulkJobStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS');

-- Nuevo campo en Tenant
ALTER TABLE "Tenant" ADD COLUMN "bulkUploadForSuppliers" BOOLEAN NOT NULL DEFAULT false;

-- Nuevos campos en Invoice
ALTER TABLE "Invoice" ADD COLUMN "uploadedBy" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "bulkJobId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "matchMethod" "MatchMethod";
ALTER TABLE "Invoice" ADD COLUMN "pendingAssignment" BOOLEAN NOT NULL DEFAULT false;

-- Nueva tabla BulkUploadJob
CREATE TABLE "BulkUploadJob" (
    "id"         TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "tenantId"   TEXT NOT NULL,
    "totalFiles" INTEGER NOT NULL DEFAULT 0,
    "processed"  INTEGER NOT NULL DEFAULT 0,
    "succeeded"  INTEGER NOT NULL DEFAULT 0,
    "failed"     INTEGER NOT NULL DEFAULT 0,
    "pending"    INTEGER NOT NULL DEFAULT 0,
    "status"     "BulkJobStatus" NOT NULL DEFAULT 'PROCESSING',
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BulkUploadJob_pkey" PRIMARY KEY ("id")
);

-- Nueva tabla OperatorAssignment
CREATE TABLE "OperatorAssignment" (
    "id"                TEXT NOT NULL,
    "operatorId"        TEXT NOT NULL,
    "supplierProfileId" TEXT NOT NULL,
    "tenantId"          TEXT NOT NULL,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OperatorAssignment_pkey" PRIMARY KEY ("id")
);

-- Unique constraint en OperatorAssignment
CREATE UNIQUE INDEX "OperatorAssignment_operatorId_supplierProfileId_key"
    ON "OperatorAssignment"("operatorId", "supplierProfileId");

-- Foreign keys BulkUploadJob
ALTER TABLE "BulkUploadJob" ADD CONSTRAINT "BulkUploadJob_uploadedBy_fkey"
    FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BulkUploadJob" ADD CONSTRAINT "BulkUploadJob_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Foreign keys OperatorAssignment
ALTER TABLE "OperatorAssignment" ADD CONSTRAINT "OperatorAssignment_operatorId_fkey"
    FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OperatorAssignment" ADD CONSTRAINT "OperatorAssignment_supplierProfileId_fkey"
    FOREIGN KEY ("supplierProfileId") REFERENCES "SupplierProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OperatorAssignment" ADD CONSTRAINT "OperatorAssignment_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Foreign keys nuevos campos en Invoice
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_uploadedBy_fkey"
    FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_bulkJobId_fkey"
    FOREIGN KEY ("bulkJobId") REFERENCES "BulkUploadJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
