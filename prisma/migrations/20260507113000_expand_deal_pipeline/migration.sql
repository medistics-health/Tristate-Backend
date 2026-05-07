ALTER TYPE "DealStage" ADD VALUE IF NOT EXISTS 'AGREEMENT_SENT';
ALTER TYPE "DealStage" ADD VALUE IF NOT EXISTS 'ONBOARDING';

ALTER TABLE "deals"
ADD COLUMN "company_id" UUID,
ADD COLUMN "primary_contact_id" UUID,
ADD COLUMN "next_task_title" TEXT,
ADD COLUMN "next_task_due_at" TIMESTAMP(3),
ADD COLUMN "last_activity_at" TIMESTAMP(3),
ADD COLUMN "activity_count" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "deal_selected_services" (
    "id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_selected_services_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "deal_selected_services_deal_id_service_id_key" ON "deal_selected_services"("deal_id", "service_id");
CREATE INDEX "deals_company_id_idx" ON "deals"("company_id");
CREATE INDEX "deals_primary_contact_id_idx" ON "deals"("primary_contact_id");
CREATE INDEX "deal_selected_services_deal_id_idx" ON "deal_selected_services"("deal_id");
CREATE INDEX "deal_selected_services_service_id_idx" ON "deal_selected_services"("service_id");

ALTER TABLE "deals" ADD CONSTRAINT "deals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_primary_contact_id_fkey" FOREIGN KEY ("primary_contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "deal_selected_services" ADD CONSTRAINT "deal_selected_services_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deal_selected_services" ADD CONSTRAINT "deal_selected_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
