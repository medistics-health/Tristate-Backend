-- AlterTable
ALTER TABLE "prefunding_invoices" ADD COLUMN IF NOT EXISTS "rejected_by_user_id" UUID REFERENCES "User"("id") ON DELETE SET NULL;
ALTER TABLE "prefunding_invoices" ADD COLUMN IF NOT EXISTS "rejected_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "prefunding_invoices_rejected_by_user_id_idx" ON "prefunding_invoices"("rejected_by_user_id");
