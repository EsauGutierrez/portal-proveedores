/*
  Warnings:

  - A unique constraint covering the columns `[folio]` on the table `Reception` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `folio` to the `Reception` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Reception" ADD COLUMN     "folio" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Reception_folio_key" ON "Reception"("folio");
