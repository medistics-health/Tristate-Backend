-- CreateEnum
CREATE TYPE "EntityStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "designation" TEXT;

-- AlterTable
ALTER TABLE "practices" ADD COLUMN     "npi" TEXT,
ADD COLUMN     "practice_group_id" UUID;

-- CreateTable
CREATE TABLE "practice_groups" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "company_id" UUID NOT NULL,
    "parent_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practice_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_ids" (
    "id" UUID NOT NULL,
    "tax_id_number" TEXT NOT NULL,
    "legal_entity_name" TEXT NOT NULL,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "company_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_ids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_npis" (
    "id" UUID NOT NULL,
    "group_npi_number" TEXT NOT NULL,
    "group_name" TEXT NOT NULL,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "tax_id" UUID NOT NULL,
    "practice_group_id" UUID,
    "practice_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_npis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "practice_groups_company_id_idx" ON "practice_groups"("company_id");

-- CreateIndex
CREATE INDEX "practice_groups_parent_id_idx" ON "practice_groups"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "tax_ids_tax_id_number_key" ON "tax_ids"("tax_id_number");

-- CreateIndex
CREATE INDEX "tax_ids_company_id_idx" ON "tax_ids"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_npis_group_npi_number_key" ON "group_npis"("group_npi_number");

-- CreateIndex
CREATE INDEX "group_npis_tax_id_idx" ON "group_npis"("tax_id");

-- CreateIndex
CREATE INDEX "group_npis_practice_group_id_idx" ON "group_npis"("practice_group_id");

-- CreateIndex
CREATE INDEX "group_npis_practice_id_idx" ON "group_npis"("practice_id");

-- CreateIndex
CREATE INDEX "practices_practice_group_id_idx" ON "practices"("practice_group_id");

-- AddForeignKey
ALTER TABLE "practice_groups" ADD CONSTRAINT "practice_groups_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_groups" ADD CONSTRAINT "practice_groups_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "practice_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practices" ADD CONSTRAINT "practices_practice_group_id_fkey" FOREIGN KEY ("practice_group_id") REFERENCES "practice_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_ids" ADD CONSTRAINT "tax_ids_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_npis" ADD CONSTRAINT "group_npis_tax_id_fkey" FOREIGN KEY ("tax_id") REFERENCES "tax_ids"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_npis" ADD CONSTRAINT "group_npis_practice_group_id_fkey" FOREIGN KEY ("practice_group_id") REFERENCES "practice_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_npis" ADD CONSTRAINT "group_npis_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
