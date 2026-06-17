-- AlterTable: agrega tolerancia configurable para el importe de facturas
ALTER TABLE "Tenant" ADD COLUMN "invoiceTolerance" DOUBLE PRECISION NOT NULL DEFAULT 0.5;
