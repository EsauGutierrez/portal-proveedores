/*
  Warnings:

  - The values [ADMIN] on the enum `Role` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[tenantId,folio]` on the table `Invoice` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,folio]` on the table `PaymentComplement` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,folio]` on the table `PurchaseOrder` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,folio]` on the table `Reception` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,rfc]` on the table `SupplierProfile` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `tenantId` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `PaymentComplement` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `PurchaseOrder` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `Reception` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `Subsidiary` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `SupplierProfile` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."Role_new" AS ENUM ('SUPERADMIN', 'TENANT_ADMIN', 'SUPPLIER');
ALTER TABLE "public"."User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "public"."User" ALTER COLUMN "role" TYPE "public"."Role_new" USING ("role"::text::"public"."Role_new");
ALTER TYPE "public"."Role" RENAME TO "Role_old";
ALTER TYPE "public"."Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
ALTER TABLE "public"."User" ALTER COLUMN "role" SET DEFAULT 'SUPPLIER';
COMMIT;

-- DropForeignKey
ALTER TABLE "public"."ReceptionArticle" DROP CONSTRAINT "ReceptionArticle_receptionId_fkey";

-- DropIndex
DROP INDEX "public"."Invoice_folio_key";

-- DropIndex
DROP INDEX "public"."PaymentComplement_folio_key";

-- DropIndex
DROP INDEX "public"."PurchaseOrder_folio_key";

-- DropIndex
DROP INDEX "public"."Reception_folio_key";

-- DropIndex
DROP INDEX "public"."Subsidiary_rfc_key";

-- DropIndex
DROP INDEX "public"."SupplierProfile_rfc_key";

-- AlterTable
ALTER TABLE "public"."Invoice" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."PaymentComplement" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."PurchaseOrder" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."Reception" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."Subsidiary" ADD COLUMN     "tenantId" TEXT NOT NULL,
ALTER COLUMN "rfc" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."SupplierProfile" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "tenantId" TEXT;

-- CreateTable
CREATE TABLE "public"."Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "netsuiteAccountId" TEXT,
    "netsuiteConsumerKey" TEXT,
    "netsuiteConsumerSec" TEXT,
    "netsuiteTokenId" TEXT,
    "netsuiteTokenSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantId_folio_key" ON "public"."Invoice"("tenantId", "folio");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentComplement_tenantId_folio_key" ON "public"."PaymentComplement"("tenantId", "folio");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_tenantId_folio_key" ON "public"."PurchaseOrder"("tenantId", "folio");

-- CreateIndex
CREATE UNIQUE INDEX "Reception_tenantId_folio_key" ON "public"."Reception"("tenantId", "folio");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierProfile_tenantId_rfc_key" ON "public"."SupplierProfile"("tenantId", "rfc");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplierProfile" ADD CONSTRAINT "SupplierProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Subsidiary" ADD CONSTRAINT "Subsidiary_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Reception" ADD CONSTRAINT "Reception_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReceptionArticle" ADD CONSTRAINT "ReceptionArticle_receptionId_fkey" FOREIGN KEY ("receptionId") REFERENCES "public"."Reception"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PaymentComplement" ADD CONSTRAINT "PaymentComplement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
