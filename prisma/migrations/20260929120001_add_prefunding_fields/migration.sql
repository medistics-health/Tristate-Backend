-- AlterTable
ALTER TABLE "practices" ADD COLUMN IF NOT EXISTS "is_prefunding_enabled" BOOLEAN DEFAULT false;
ALTER TABLE "practices" ADD COLUMN IF NOT EXISTS "prefunding_cycle" TEXT;
ALTER TABLE "practices" ADD COLUMN IF NOT EXISTS "prefunding_start_date" TIMESTAMP(3);
ALTER TABLE "practices" ADD COLUMN IF NOT EXISTS "prefunding_due_on" INTEGER;
ALTER TABLE "practices" ADD COLUMN IF NOT EXISTS "prefunding_reminder_on" INTEGER;
ALTER TABLE "practices" ADD COLUMN IF NOT EXISTS "prefunding_stripe_account_id" TEXT;
ALTER TABLE "practices" ADD COLUMN IF NOT EXISTS "prefunding_invoice_recipient_id" TEXT;
ALTER TABLE "practices" ADD COLUMN IF NOT EXISTS "prefunding_state" TEXT;
