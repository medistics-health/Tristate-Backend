-- AlterTable
ALTER TABLE "billing_runs" ADD COLUMN     "created_by_user_id" UUID;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "created_by_user_id" UUID;

-- CreateIndex
CREATE INDEX "billing_runs_created_by_user_id_idx" ON "billing_runs"("created_by_user_id");

-- CreateIndex
CREATE INDEX "invoices_created_by_user_id_idx" ON "invoices"("created_by_user_id");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_runs" ADD CONSTRAINT "billing_runs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
