/*
  Warnings:

  - You are about to drop the column `practice_id` on the `contacts` table. All the data in the column will be lost.
  - You are about to drop the column `practice_id` on the `group_npis` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "contacts" DROP CONSTRAINT "contacts_practice_id_fkey";

-- DropForeignKey
ALTER TABLE "group_npis" DROP CONSTRAINT "group_npis_practice_id_fkey";

-- DropIndex
DROP INDEX "contacts_email_key";

-- DropIndex
DROP INDEX "contacts_practice_id_idx";

-- DropIndex
DROP INDEX "group_npis_practice_id_idx";

-- AlterTable
ALTER TABLE "contacts" DROP COLUMN "practice_id";

-- AlterTable
ALTER TABLE "group_npis" DROP COLUMN "practice_id",
ALTER COLUMN "tax_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "practices" ADD COLUMN     "tax_id_id" UUID;

-- CreateTable
CREATE TABLE "practice_persons" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,

    CONSTRAINT "practice_persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_persons" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,

    CONSTRAINT "company_persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PracticeGroupNpis" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_PracticeGroupNpis_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "practice_persons_practice_id_idx" ON "practice_persons"("practice_id");

-- CreateIndex
CREATE INDEX "practice_persons_person_id_idx" ON "practice_persons"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "practice_persons_practice_id_person_id_key" ON "practice_persons"("practice_id", "person_id");

-- CreateIndex
CREATE INDEX "company_persons_company_id_idx" ON "company_persons"("company_id");

-- CreateIndex
CREATE INDEX "company_persons_person_id_idx" ON "company_persons"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_persons_company_id_person_id_key" ON "company_persons"("company_id", "person_id");

-- CreateIndex
CREATE INDEX "_PracticeGroupNpis_B_index" ON "_PracticeGroupNpis"("B");

-- CreateIndex
CREATE INDEX "practices_tax_id_id_idx" ON "practices"("tax_id_id");

-- AddForeignKey
ALTER TABLE "practices" ADD CONSTRAINT "practices_tax_id_id_fkey" FOREIGN KEY ("tax_id_id") REFERENCES "tax_ids"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_persons" ADD CONSTRAINT "practice_persons_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_persons" ADD CONSTRAINT "practice_persons_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_persons" ADD CONSTRAINT "company_persons_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_persons" ADD CONSTRAINT "company_persons_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PracticeGroupNpis" ADD CONSTRAINT "_PracticeGroupNpis_A_fkey" FOREIGN KEY ("A") REFERENCES "group_npis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PracticeGroupNpis" ADD CONSTRAINT "_PracticeGroupNpis_B_fkey" FOREIGN KEY ("B") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
