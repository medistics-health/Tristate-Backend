ALTER TABLE "practices"
ADD COLUMN "credentialing_charge_amount" DECIMAL(12,2);

ALTER TABLE "credentialing_requests"
ADD COLUMN "credentialing_charge_billed_at" TIMESTAMP(3),
ADD COLUMN "credentialing_charge_invoice_line_item_id" UUID;

ALTER TABLE "billing_run_items"
ADD COLUMN "credentialing_request_id" UUID;

CREATE INDEX "credentialing_requests_practice_id_status_credentialing_charge_billed_at_idx"
ON "credentialing_requests"("practice_id", "status", "credentialing_charge_billed_at");

CREATE INDEX "billing_run_items_credentialing_request_id_idx"
ON "billing_run_items"("credentialing_request_id");

ALTER TABLE "billing_run_items"
ADD CONSTRAINT "billing_run_items_credentialing_request_id_fkey"
FOREIGN KEY ("credentialing_request_id") REFERENCES "credentialing_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
