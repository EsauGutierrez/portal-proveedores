-- Agrega tokenVersion a User: incrementarlo invalida todos los JWT emitidos
-- previamente (logout global / respuesta a cuenta comprometida) sin necesidad
-- de una tabla de tokens revocados.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
