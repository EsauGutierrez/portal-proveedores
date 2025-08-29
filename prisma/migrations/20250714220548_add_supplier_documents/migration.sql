-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'UPLOADED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "SupplierDocument" (
    "id" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supplierProfileId" TEXT NOT NULL,

    CONSTRAINT "SupplierDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupplierDocument_supplierProfileId_documentType_key" ON "SupplierDocument"("supplierProfileId", "documentType");

-- AddForeignKey
ALTER TABLE "SupplierDocument" ADD CONSTRAINT "SupplierDocument_supplierProfileId_fkey" FOREIGN KEY ("supplierProfileId") REFERENCES "SupplierProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
