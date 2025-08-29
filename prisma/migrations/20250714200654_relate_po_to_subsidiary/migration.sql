/*
  Warnings:

  - You are about to drop the column `subsidiaria` on the `PurchaseOrder` table. All the data in the column will be lost.
  - Added the required column `subsidiaryId` to the `PurchaseOrder` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PurchaseOrder" DROP COLUMN "subsidiaria",
ADD COLUMN     "subsidiaryId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_subsidiaryId_fkey" FOREIGN KEY ("subsidiaryId") REFERENCES "Subsidiary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
