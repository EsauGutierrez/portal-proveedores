-- Marca cuándo se detectó que la factura (Vendor Bill) ya fue pagada en NetSuite.
-- Presencia de valor = ya notificado al proveedor (evita reenviar el correo).
ALTER TABLE "Invoice" ADD COLUMN "paidAt" TIMESTAMP(3);
