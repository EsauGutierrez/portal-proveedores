-- AlterTable
ALTER TABLE "SupplierProfile" ADD COLUMN "rejectionReason" TEXT;
ALTER TABLE "SupplierProfile" ADD COLUMN "rejectedAt" TIMESTAMP(3);
