-- AlterTable User: first login flag and password reset fields
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "firstLogin"           BOOLEAN      NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "passwordResetToken"   TEXT,
  ADD COLUMN IF NOT EXISTS "passwordResetExpires" TIMESTAMP(3);

-- AlterTable Tenant: subscription and configuration fields
ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "maxSubsidiaries"       INTEGER,
  ADD COLUMN IF NOT EXISTS "maxSuppliers"          INTEGER,
  ADD COLUMN IF NOT EXISTS "netsuiteDeployId"      TEXT,
  ADD COLUMN IF NOT EXISTS "netsuiteScriptId"      TEXT,
  ADD COLUMN IF NOT EXISTS "subscriptionExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "supportEmail"          TEXT;

-- AlterTable SupplierProfile: document requirement flag
ALTER TABLE "SupplierProfile"
  ADD COLUMN IF NOT EXISTS "requireDocuments" BOOLEAN NOT NULL DEFAULT false;
