/*
  Warnings:

  - You are about to drop the column `docuseal_id` on the `agreements` table. All the data in the column will be lost.
  - You are about to drop the column `docuseal_status` on the `agreements` table. All the data in the column will be lost.
  - You are about to drop the column `docuseal_url` on the `agreements` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "agreements" DROP COLUMN "docuseal_id",
DROP COLUMN "docuseal_status",
DROP COLUMN "docuseal_url";

-- CreateTable
CREATE TABLE "docuseal_submissions" (
    "id" UUID NOT NULL,
    "agreement_id" UUID NOT NULL,
    "external_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "url" TEXT,
    "template_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "docuseal_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "docuseal_submissions_external_id_key" ON "docuseal_submissions"("external_id");

-- CreateIndex
CREATE INDEX "docuseal_submissions_agreement_id_idx" ON "docuseal_submissions"("agreement_id");

-- AddForeignKey
ALTER TABLE "docuseal_submissions" ADD CONSTRAINT "docuseal_submissions_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
