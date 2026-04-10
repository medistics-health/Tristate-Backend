/*
  Warnings:

  - You are about to drop the column `address` on the `companies` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('LEAD', 'CUSTOMER', 'PARTNER', 'INACTIVE');

-- AlterTable
ALTER TABLE "companies" DROP COLUMN "address",
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "domain" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "revenue" DECIMAL(15,2),
ADD COLUMN     "size" INTEGER,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "status" "CompanyStatus" NOT NULL DEFAULT 'LEAD',
ADD COLUMN     "street" TEXT,
ADD COLUMN     "zip" TEXT;
