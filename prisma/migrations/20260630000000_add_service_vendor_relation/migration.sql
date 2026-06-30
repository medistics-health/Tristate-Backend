-- AlterTable
ALTER TABLE "services"
ADD COLUMN "vendor_id" UUID;

-- CreateIndex
CREATE INDEX "services_vendor_id_idx" ON "services"("vendor_id");

-- AddForeignKey
ALTER TABLE "services"
ADD CONSTRAINT "services_vendor_id_fkey"
FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
