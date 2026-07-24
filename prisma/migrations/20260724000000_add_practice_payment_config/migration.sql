ALTER TABLE "practices"
ADD COLUMN "billing_payment_method" TEXT DEFAULT 'ACH',
ADD COLUMN "processing_fee_config" JSONB;
