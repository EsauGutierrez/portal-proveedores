-- CreateTable
CREATE TABLE "InvoiceDocumentRequirement" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "supplierType" "SupplierType" NOT NULL DEFAULT 'BOTH',
    "allowedTypes" TEXT[],
    "subsidiaryIds" TEXT[],
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceDocumentRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceAttachment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "requirementId" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceDocumentRequirement_tenantId_idx" ON "InvoiceDocumentRequirement"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceDocumentRequirement_tenantId_name_key" ON "InvoiceDocumentRequirement"("tenantId", "name");

-- CreateIndex
CREATE INDEX "InvoiceAttachment_invoiceId_idx" ON "InvoiceAttachment"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceAttachment_tenantId_idx" ON "InvoiceAttachment"("tenantId");

-- AddForeignKey
ALTER TABLE "InvoiceDocumentRequirement" ADD CONSTRAINT "InvoiceDocumentRequirement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAttachment" ADD CONSTRAINT "InvoiceAttachment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAttachment" ADD CONSTRAINT "InvoiceAttachment_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "InvoiceDocumentRequirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
