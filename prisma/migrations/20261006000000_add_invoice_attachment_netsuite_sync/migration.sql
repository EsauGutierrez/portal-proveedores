-- AlterTable
ALTER TABLE "InvoiceAttachment" ADD COLUMN     "netsuiteBillId" TEXT,
ADD COLUMN     "netsuiteRecordId" TEXT,
ADD COLUMN     "netsuiteSyncError" TEXT,
ADD COLUMN     "netsuiteSyncStatus" "InvoiceSyncStatus" NOT NULL DEFAULT 'PENDING_SYNC',
ADD COLUMN     "netsuiteSyncedAt" TIMESTAMP(3);
