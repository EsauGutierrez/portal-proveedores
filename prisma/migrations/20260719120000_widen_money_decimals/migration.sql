-- Amplía los campos monetarios de DECIMAL(10,2) (máx 99,999,999.99) a DECIMAL(18,2)
-- para soportar montos grandes (OC/facturas de 100 millones o más). Cambio no destructivo.

-- PurchaseOrder
ALTER TABLE "PurchaseOrder" ALTER COLUMN "subtotal" TYPE DECIMAL(18,2);
ALTER TABLE "PurchaseOrder" ALTER COLUMN "total"    TYPE DECIMAL(18,2);
ALTER TABLE "PurchaseOrder" ALTER COLUMN "tax"      TYPE DECIMAL(18,2);

-- ReceptionArticle
ALTER TABLE "ReceptionArticle" ALTER COLUMN "unitPrice" TYPE DECIMAL(18,2);
ALTER TABLE "ReceptionArticle" ALTER COLUMN "subtotal"  TYPE DECIMAL(18,2);
ALTER TABLE "ReceptionArticle" ALTER COLUMN "tax"       TYPE DECIMAL(18,2);
ALTER TABLE "ReceptionArticle" ALTER COLUMN "total"     TYPE DECIMAL(18,2);

-- Invoice
ALTER TABLE "Invoice" ALTER COLUMN "subtotal" TYPE DECIMAL(18,2);
ALTER TABLE "Invoice" ALTER COLUMN "tax"      TYPE DECIMAL(18,2);
ALTER TABLE "Invoice" ALTER COLUMN "total"    TYPE DECIMAL(18,2);

-- PaymentComplement
ALTER TABLE "PaymentComplement" ALTER COLUMN "total" TYPE DECIMAL(18,2);
