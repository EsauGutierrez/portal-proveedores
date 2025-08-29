/*
  Warnings:

  - Added the required column `subsidiaryId` to the `SupplierProfile` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SupplierProfile" ADD COLUMN     "subsidiaryId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "SupplierProfile" ADD CONSTRAINT "SupplierProfile_subsidiaryId_fkey" FOREIGN KEY ("subsidiaryId") REFERENCES "Subsidiary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
