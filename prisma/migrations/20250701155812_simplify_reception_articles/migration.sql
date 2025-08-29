/*
  Warnings:

  - You are about to drop the column `articleId` on the `ReceptionArticle` table. All the data in the column will be lost.
  - You are about to drop the `Article` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `articleName` to the `ReceptionArticle` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "ReceptionArticle" DROP CONSTRAINT "ReceptionArticle_articleId_fkey";

-- AlterTable
ALTER TABLE "ReceptionArticle" DROP COLUMN "articleId",
ADD COLUMN     "articleName" TEXT NOT NULL;

-- DropTable
DROP TABLE "Article";
