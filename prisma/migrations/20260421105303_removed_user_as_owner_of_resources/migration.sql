/*
  Warnings:

  - You are about to drop the column `owner_id` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `owner_id` on the `practices` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "companies" DROP CONSTRAINT "companies_owner_id_fkey";

-- DropIndex
DROP INDEX "companies_owner_id_idx";

-- DropIndex
DROP INDEX "practices_owner_id_idx";

-- AlterTable
ALTER TABLE "companies" DROP COLUMN "owner_id";

-- AlterTable
ALTER TABLE "practices" DROP COLUMN "owner_id";
