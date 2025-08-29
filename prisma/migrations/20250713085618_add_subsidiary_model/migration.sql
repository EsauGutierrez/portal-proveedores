-- CreateTable
CREATE TABLE "Subsidiary" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rfc" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "taxRegime" TEXT NOT NULL,
    "taxAddress" TEXT NOT NULL,
    "logoUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subsidiary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subsidiary_rfc_key" ON "Subsidiary"("rfc");
