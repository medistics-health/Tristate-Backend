/*
  Warnings:

  - You are about to drop the `emails` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "emails" DROP CONSTRAINT "emails_deal_id_fkey";

-- DropForeignKey
ALTER TABLE "emails" DROP CONSTRAINT "emails_person_id_fkey";

-- DropForeignKey
ALTER TABLE "emails" DROP CONSTRAINT "emails_practice_id_fkey";

-- DropForeignKey
ALTER TABLE "emails" DROP CONSTRAINT "emails_user_id_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "contacts" ALTER COLUMN "updated_at" DROP DEFAULT;

-- DropTable
DROP TABLE "emails";

-- DropEnum
DROP TYPE "EmailDirection";
