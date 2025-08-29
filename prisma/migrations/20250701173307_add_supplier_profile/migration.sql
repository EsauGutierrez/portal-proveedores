-- CreateEnum
CREATE TYPE "SupplierStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED');

-- CreateTable
CREATE TABLE "SupplierProfile" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "rfc" TEXT NOT NULL,
    "taxAddress" TEXT NOT NULL,
    "status" "SupplierStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "SupplierProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupplierProfile_rfc_key" ON "SupplierProfile"("rfc");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierProfile_userId_key" ON "SupplierProfile"("userId");

-- AddForeignKey
ALTER TABLE "SupplierProfile" ADD CONSTRAINT "SupplierProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
