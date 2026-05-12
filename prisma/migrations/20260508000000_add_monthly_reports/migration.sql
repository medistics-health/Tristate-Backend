CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'SUBMITTED');

CREATE TABLE "monthly_reports" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "submitted_by" TEXT,
    "due_date" TIMESTAMP(3),
    "month" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "monthly_reports_practice_id_service_id_month_year_key" ON "monthly_reports"("practice_id", "service_id", "month", "year");
CREATE INDEX "monthly_reports_practice_id_idx" ON "monthly_reports"("practice_id");
CREATE INDEX "monthly_reports_service_id_idx" ON "monthly_reports"("service_id");
CREATE INDEX "monthly_reports_status_idx" ON "monthly_reports"("status");

ALTER TABLE "monthly_reports" ADD CONSTRAINT "monthly_reports_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "monthly_reports" ADD CONSTRAINT "monthly_reports_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
