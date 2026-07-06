ALTER TABLE "services"
DROP CONSTRAINT IF EXISTS "services_company_id_fkey";

DROP INDEX IF EXISTS "services_company_id_idx";

ALTER TABLE "services"
DROP COLUMN IF EXISTS "company_id";

ALTER TABLE "services"
ADD COLUMN "stripe_connected_account_id" TEXT;

CREATE INDEX "services_stripe_connected_account_id_idx" ON "services"("stripe_connected_account_id");
