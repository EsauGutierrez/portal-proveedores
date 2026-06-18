-- CreateTable
CREATE TABLE "BulkPaymentComplementLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "zipFilename" TEXT,
    "s3ZipKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "totalFiles" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "results" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BulkPaymentComplementLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "BulkPaymentComplementLog" ADD CONSTRAINT "BulkPaymentComplementLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkPaymentComplementLog" ADD CONSTRAINT "BulkPaymentComplementLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
