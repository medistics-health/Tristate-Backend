-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "StripeTransferStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "invoice_connected_account_transfers" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "stripe_connected_account_id" TEXT NOT NULL,
    "stripe_transfer_id" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "StripeTransferStatus" NOT NULL DEFAULT 'PENDING',
    "failure_message" TEXT,
    "transfer_group" TEXT,
    "service_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "invoice_line_item_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invoice_connected_account_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "invoice_connected_account_transfers_invoice_id_stripe_connected_account_id_key"
ON "invoice_connected_account_transfers" ("invoice_id", "stripe_connected_account_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoice_connected_account_transfers_invoice_id_idx"
ON "invoice_connected_account_transfers" ("invoice_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoice_connected_account_transfers_stripe_connected_account_id_idx"
ON "invoice_connected_account_transfers" ("stripe_connected_account_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoice_connected_account_transfers_status_idx"
ON "invoice_connected_account_transfers" ("status");

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "invoice_connected_account_transfers"
    ADD CONSTRAINT "invoice_connected_account_transfers_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
