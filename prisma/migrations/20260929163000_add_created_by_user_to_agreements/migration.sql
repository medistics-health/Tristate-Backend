-- AlterTable
ALTER TABLE "agreements" ADD COLUMN "created_by_user_id" UUID;

-- CreateIndex
CREATE INDEX "agreements_created_by_user_id_idx" ON "agreements"("created_by_user_id");

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
