-- AlterTable: add supplierType to SupplierProfile
ALTER TABLE "SupplierProfile" ADD COLUMN "supplierType" "SupplierType" NOT NULL DEFAULT 'NATIONAL';
