-- Practice prefunding columns may already exist from 20260929120001_add_prefunding_fields.
ALTER TABLE "practices" ADD COLUMN IF NOT EXISTS "is_prefunding_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "practices" ADD COLUMN IF NOT EXISTS "prefunding_cycle" TEXT;
ALTER TABLE "practices" ADD COLUMN IF NOT EXISTS "prefunding_start_date" TIMESTAMP(3);
ALTER TABLE "practices" ADD COLUMN IF NOT EXISTS "prefunding_due_on" INTEGER;
ALTER TABLE "practices" ADD COLUMN IF NOT EXISTS "prefunding_reminder_on" INTEGER;
ALTER TABLE "practices" ADD COLUMN IF NOT EXISTS "prefunding_stripe_account_id" TEXT;
ALTER TABLE "practices" ADD COLUMN IF NOT EXISTS "prefunding_invoice_recipient_id" UUID;
ALTER TABLE "practices" ADD COLUMN IF NOT EXISTS "prefunding_state" TEXT;

UPDATE "practices" SET "is_prefunding_enabled" = false WHERE "is_prefunding_enabled" IS NULL;
ALTER TABLE "practices" ALTER COLUMN "is_prefunding_enabled" SET DEFAULT false;
ALTER TABLE "practices" ALTER COLUMN "is_prefunding_enabled" SET NOT NULL;
ALTER TABLE "practices"
  ALTER COLUMN "prefunding_invoice_recipient_id" TYPE UUID
  USING NULLIF(TRIM("prefunding_invoice_recipient_id"::text), '')::uuid;

-- Contact pay columns may already exist from 20260929120000_add_employee_roles.
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "job_category" TEXT;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "pay_type" TEXT;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "pay_rate" DECIMAL(12,2);
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "budgeted_hours" DECIMAL(10,2);
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "buffer_percentage" DECIMAL(5,2);

ALTER TABLE "contacts" ALTER COLUMN "pay_rate" TYPE DECIMAL(12,2) USING "pay_rate"::DECIMAL(12,2);
ALTER TABLE "contacts" ALTER COLUMN "budgeted_hours" TYPE DECIMAL(10,2) USING "budgeted_hours"::DECIMAL(10,2);
ALTER TABLE "contacts" ALTER COLUMN "buffer_percentage" TYPE DECIMAL(5,2) USING "buffer_percentage"::DECIMAL(5,2);

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "has_prefunding_access" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "prefunding_rates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "basis" TEXT NOT NULL,
    "pricing_model" TEXT NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prefunding_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prefunding_practice_rates" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "prefunding_rate_id" UUID NOT NULL,

    CONSTRAINT "prefunding_practice_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prefunding_invoices" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "cycle" TEXT NOT NULL,
    "invoice_date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prefunding_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prefunding_invoice_line_items" (
    "id" UUID NOT NULL,
    "prefunding_invoice_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "basis" TEXT,
    "pricing_model" TEXT,
    "rate" DECIMAL(12,2),
    "amount" DECIMAL(12,2) NOT NULL,
    "is_one_time" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "prefunding_invoice_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prefunding_practice_rates_practice_id_idx" ON "prefunding_practice_rates"("practice_id");

-- CreateIndex
CREATE INDEX "prefunding_practice_rates_prefunding_rate_id_idx" ON "prefunding_practice_rates"("prefunding_rate_id");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "prefunding_practice_rates_practice_id_prefunding_rate_id_key" ON "prefunding_practice_rates"("practice_id", "prefunding_rate_id");

-- CreateIndex
CREATE INDEX "prefunding_invoices_practice_id_idx" ON "prefunding_invoices"("practice_id");

-- CreateIndex
CREATE INDEX "prefunding_invoice_line_items_prefunding_invoice_id_idx" ON "prefunding_invoice_line_items"("prefunding_invoice_id");

-- AddForeignKey
ALTER TABLE "prefunding_practice_rates" ADD CONSTRAINT "prefunding_practice_rates_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prefunding_practice_rates" ADD CONSTRAINT "prefunding_practice_rates_prefunding_rate_id_fkey" FOREIGN KEY ("prefunding_rate_id") REFERENCES "prefunding_rates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prefunding_invoices" ADD CONSTRAINT "prefunding_invoices_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prefunding_invoice_line_items" ADD CONSTRAINT "prefunding_invoice_line_items_prefunding_invoice_id_fkey" FOREIGN KEY ("prefunding_invoice_id") REFERENCES "prefunding_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
