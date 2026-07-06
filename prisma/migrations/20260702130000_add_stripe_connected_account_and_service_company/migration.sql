ALTER TABLE "companies"
ADD COLUMN "stripe_connected_account_id" TEXT;

ALTER TABLE "services"
ADD COLUMN "company_id" UUID;

CREATE INDEX "services_company_id_idx" ON "services"("company_id");

ALTER TABLE "services"
ADD CONSTRAINT "services_company_id_fkey"
FOREIGN KEY ("company_id") REFERENCES "companies"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
