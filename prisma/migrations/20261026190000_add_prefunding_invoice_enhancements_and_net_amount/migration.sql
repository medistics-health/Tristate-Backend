-- Migration: 20261026190000_add_prefunding_invoice_enhancements_and_net_amount
-- Adds net_amount, fee fields, approval, stripe links, blob urls, and allocation/transfer relations for prefunding invoices.

-- 1. Alter prefunding_invoices table safely
ALTER TABLE "prefunding_invoices" 
  ADD COLUMN IF NOT EXISTS "invoice_number" TEXT,
  ADD COLUMN IF NOT EXISTS "subtotal_amount" DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS "currency" TEXT DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS "payment_method" TEXT,
  ADD COLUMN IF NOT EXISTS "fee_bearer" TEXT,
  ADD COLUMN IF NOT EXISTS "processing_fee_amount" DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS "company_fee_amount" DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS "net_amount" DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS "stripe_invoice_id" TEXT,
  ADD COLUMN IF NOT EXISTS "stripe_hosted_invoice_url" TEXT,
  ADD COLUMN IF NOT EXISTS "stripe_invoice_pdf_url" TEXT,
  ADD COLUMN IF NOT EXISTS "invoice_pdf_blob_url" TEXT,
  ADD COLUMN IF NOT EXISTS "receipt_pdf_blob_url" TEXT,
  ADD COLUMN IF NOT EXISTS "due_reminder_days_sent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "due_reminder_overdue_sent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "approved_by_user_id" UUID,
  ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "posted_at" TIMESTAMP(3);

-- 2. Alter invoice_connected_account_transfers safely
ALTER TABLE "invoice_connected_account_transfers" 
  ADD COLUMN IF NOT EXISTS "prefunding_invoice_id" UUID,
  ALTER COLUMN "invoice_id" DROP NOT NULL;

-- 3. Alter payment_allocations safely
ALTER TABLE "payment_allocations" 
  ADD COLUMN IF NOT EXISTS "prefunding_invoice_id" UUID,
  ALTER COLUMN "invoice_id" DROP NOT NULL;

-- 4. Create indexes safely
CREATE UNIQUE INDEX IF NOT EXISTS "prefunding_invoices_invoice_number_key" ON "prefunding_invoices"("invoice_number");
CREATE INDEX IF NOT EXISTS "prefunding_invoices_approved_by_user_id_idx" ON "prefunding_invoices"("approved_by_user_id");
CREATE INDEX IF NOT EXISTS "prefunding_invoices_stripe_invoice_id_idx" ON "prefunding_invoices"("stripe_invoice_id");
CREATE INDEX IF NOT EXISTS "invoice_connected_account_transfers_prefunding_invoice_id_idx" ON "invoice_connected_account_transfers"("prefunding_invoice_id");
CREATE INDEX IF NOT EXISTS "payment_allocations_prefunding_invoice_id_idx" ON "payment_allocations"("prefunding_invoice_id");

-- 5. Add foreign keys safely
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prefunding_invoices_approved_by_user_id_fkey') THEN
        ALTER TABLE "prefunding_invoices" 
          ADD CONSTRAINT "prefunding_invoices_approved_by_user_id_fkey" 
          FOREIGN KEY ("approved_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_connected_account_transfers_prefunding_invoice_id_fkey') THEN
        ALTER TABLE "invoice_connected_account_transfers" 
          ADD CONSTRAINT "invoice_connected_account_transfers_prefunding_invoice_id_fkey" 
          FOREIGN KEY ("prefunding_invoice_id") REFERENCES "prefunding_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_allocations_prefunding_invoice_id_fkey') THEN
        ALTER TABLE "payment_allocations" 
          ADD CONSTRAINT "payment_allocations_prefunding_invoice_id_fkey" 
          FOREIGN KEY ("prefunding_invoice_id") REFERENCES "prefunding_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
