-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SUPPLIER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'SUPPLIER';
