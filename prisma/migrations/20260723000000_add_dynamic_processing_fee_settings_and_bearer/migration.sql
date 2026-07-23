ALTER TABLE "system_settings"
ADD COLUMN "credit_card_company_rate_percent" DECIMAL(8, 4) NOT NULL DEFAULT 1.4,
ADD COLUMN "credit_card_company_fixed_fee" DECIMAL(12, 2) NOT NULL DEFAULT 0.30,
ADD COLUMN "credit_card_client_rate_percent" DECIMAL(8, 4) NOT NULL DEFAULT 1.5,
ADD COLUMN "credit_card_client_fixed_fee" DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
ADD COLUMN "ach_company_rate_percent" DECIMAL(8, 4) NOT NULL DEFAULT 0.8,
ADD COLUMN "ach_company_cap_amount" DECIMAL(12, 2) NOT NULL DEFAULT 5.00,
ADD COLUMN "ach_client_rate_percent" DECIMAL(8, 4) NOT NULL DEFAULT 0.0,
ADD COLUMN "ach_client_cap_amount" DECIMAL(12, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE "billing_runs"
ADD COLUMN "fee_bearer" TEXT NOT NULL DEFAULT 'CLIENT',
ADD COLUMN "company_fee_amount_override" DECIMAL(12, 2),
ADD COLUMN "processing_fee_config" JSONB;

ALTER TABLE "invoices"
ADD COLUMN "fee_bearer" TEXT,
ADD COLUMN "company_fee_amount" DECIMAL(12, 2);

ALTER TABLE "invoice_line_items"
ADD COLUMN "external_unit_price" DECIMAL(12, 2),
ADD COLUMN "external_total_price" DECIMAL(12, 2),
ADD COLUMN "company_fee_deduction_amount" DECIMAL(12, 2);
