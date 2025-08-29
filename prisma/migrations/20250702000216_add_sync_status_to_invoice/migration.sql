-- CreateEnum
CREATE TYPE "InvoiceSyncStatus" AS ENUM ('PENDING_SYNC', 'SYNCED', 'FAILED');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "syncError" TEXT,
ADD COLUMN     "syncStatus" "InvoiceSyncStatus" NOT NULL DEFAULT 'PENDING_SYNC';
