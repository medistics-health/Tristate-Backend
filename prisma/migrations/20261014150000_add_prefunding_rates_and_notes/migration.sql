-- Migration: 20261014150000_add_prefunding_rates_and_notes
-- Ensures all Prefunding models and the new notes columns exist safely in production deployment.

-- 1. Create prefunding_rates table if not exists
CREATE TABLE IF NOT EXISTS "prefunding_rates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "basis" TEXT NOT NULL,
    "pricing_model" TEXT NOT NULL,
    "rate" DECIMAL(12, 6) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prefunding_rates_pkey" PRIMARY KEY ("id")
);

-- 2. Create prefunding_practice_rates table if not exists
CREATE TABLE IF NOT EXISTS "prefunding_practice_rates" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "prefunding_rate_id" UUID NOT NULL,

    CONSTRAINT "prefunding_practice_rates_pkey" PRIMARY KEY ("id")
);

-- 3. Create prefunding_invoices table if not exists
CREATE TABLE IF NOT EXISTS "prefunding_invoices" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "cycle" TEXT NOT NULL,
    "invoice_date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "total_amount" DECIMAL(12, 2) NOT NULL,
    "status" TEXT NOT NULL,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prefunding_invoices_pkey" PRIMARY KEY ("id")
);

-- 4. Create prefunding_invoice_line_items table if not exists
CREATE TABLE IF NOT EXISTS "prefunding_invoice_line_items" (
    "id" UUID NOT NULL,
    "prefunding_invoice_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "basis" TEXT,
    "pricing_model" TEXT,
    "rate" DECIMAL(12, 6),
    "amount" DECIMAL(12, 2) NOT NULL,
    "notes" TEXT,
    "is_one_time" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "prefunding_invoice_line_items_pkey" PRIMARY KEY ("id")
);

-- 5. Add notes columns and alter rate precision if tables already existed
ALTER TABLE "prefunding_rates" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "prefunding_rates" ALTER COLUMN "rate" TYPE DECIMAL(12, 6);
ALTER TABLE "prefunding_invoice_line_items" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "prefunding_invoice_line_items" ALTER COLUMN "rate" TYPE DECIMAL(12, 6);

-- 6. Add indexes safely
CREATE INDEX IF NOT EXISTS "prefunding_practice_rates_practice_id_idx" ON "prefunding_practice_rates"("practice_id");
CREATE INDEX IF NOT EXISTS "prefunding_practice_rates_prefunding_rate_id_idx" ON "prefunding_practice_rates"("prefunding_rate_id");
CREATE UNIQUE INDEX IF NOT EXISTS "prefunding_practice_rates_practice_id_prefunding_rate_id_key" ON "prefunding_practice_rates"("practice_id", "prefunding_rate_id");
CREATE INDEX IF NOT EXISTS "prefunding_invoices_practice_id_idx" ON "prefunding_invoices"("practice_id");
CREATE INDEX IF NOT EXISTS "prefunding_invoices_created_by_user_id_idx" ON "prefunding_invoices"("created_by_user_id");
CREATE INDEX IF NOT EXISTS "prefunding_invoice_line_items_prefunding_invoice_id_idx" ON "prefunding_invoice_line_items"("prefunding_invoice_id");

-- 7. Add foreign keys safely
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prefunding_practice_rates_practice_id_fkey') THEN
        ALTER TABLE "prefunding_practice_rates" ADD CONSTRAINT "prefunding_practice_rates_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prefunding_practice_rates_prefunding_rate_id_fkey') THEN
        ALTER TABLE "prefunding_practice_rates" ADD CONSTRAINT "prefunding_practice_rates_prefunding_rate_id_fkey" FOREIGN KEY ("prefunding_rate_id") REFERENCES "prefunding_rates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prefunding_invoices_practice_id_fkey') THEN
        ALTER TABLE "prefunding_invoices" ADD CONSTRAINT "prefunding_invoices_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prefunding_invoices_created_by_user_id_fkey') THEN
        ALTER TABLE "prefunding_invoices" ADD CONSTRAINT "prefunding_invoices_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prefunding_invoice_line_items_prefunding_invoice_id_fkey') THEN
        ALTER TABLE "prefunding_invoice_line_items" ADD CONSTRAINT "prefunding_invoice_line_items_prefunding_invoice_id_fkey" FOREIGN KEY ("prefunding_invoice_id") REFERENCES "prefunding_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
