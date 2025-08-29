-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "subsidiaria" TEXT NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reception" (
    "id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,

    CONSTRAINT "Reception_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceptionArticle" (
    "id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "tax" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "receptionId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,

    CONSTRAINT "ReceptionArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "pdfUrl" TEXT,
    "xmlUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "receptionId" TEXT NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentComplement" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "pdfUrl" TEXT,
    "xmlUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,

    CONSTRAINT "PaymentComplement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_folio_key" ON "PurchaseOrder"("folio");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_folio_key" ON "Invoice"("folio");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_receptionId_key" ON "Invoice"("receptionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentComplement_folio_key" ON "PaymentComplement"("folio");

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reception" ADD CONSTRAINT "Reception_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceptionArticle" ADD CONSTRAINT "ReceptionArticle_receptionId_fkey" FOREIGN KEY ("receptionId") REFERENCES "Reception"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceptionArticle" ADD CONSTRAINT "ReceptionArticle_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_receptionId_fkey" FOREIGN KEY ("receptionId") REFERENCES "Reception"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentComplement" ADD CONSTRAINT "PaymentComplement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentComplement" ADD CONSTRAINT "PaymentComplement_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
