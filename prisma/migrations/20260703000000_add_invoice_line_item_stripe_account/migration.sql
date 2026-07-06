ALTER TABLE "services"
ADD COLUMN IF NOT EXISTS "stripe_connected_account_id" TEXT;

CREATE INDEX IF NOT EXISTS "services_stripe_connected_account_id_idx"
ON "services" ("stripe_connected_account_id");

ALTER TABLE "invoice_line_items"
ADD COLUMN IF NOT EXISTS "stripe_connected_account_id" TEXT;

UPDATE "invoice_line_items" ili
SET "stripe_connected_account_id" = s."stripe_connected_account_id"
FROM "services" s
WHERE ili."service_id" = s."id"
  AND ili."stripe_connected_account_id" IS NULL;

CREATE INDEX IF NOT EXISTS "invoice_line_items_stripe_connected_account_id_idx"
ON "invoice_line_items" ("stripe_connected_account_id");
