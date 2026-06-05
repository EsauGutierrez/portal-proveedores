-- AlterTable User: first login flag and password reset fields
ALTER TABLE "User"
  ADD COLUMN "firstLogin"           BOOLEAN                      NOT NULL DEFAULT true,
  ADD COLUMN "passwordResetToken"   TEXT,
  ADD COLUMN "passwordResetExpires" TIMESTAMP(3);

-- AlterTable Tenant: subscription and configuration fields
ALTER TABLE "Tenant"
  ADD COLUMN "maxSubsidiaries"       INTEGER,
  ADD COLUMN "maxSuppliers"          INTEGER,
  ADD COLUMN "netsuiteDeployId"      TEXT,
  ADD COLUMN "netsuiteScriptId"      TEXT,
  ADD COLUMN "subscriptionExpiresAt" TIMESTAMP(3),
  ADD COLUMN "supportEmail"          TEXT;

-- AlterTable SupplierProfile: document requirement flag
ALTER TABLE "SupplierProfile"
  ADD COLUMN "requireDocuments" BOOLEAN NOT NULL DEFAULT false;
