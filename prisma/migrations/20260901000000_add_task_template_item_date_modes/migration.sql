-- Safe production migration to add task template item date calculation modes without data loss
ALTER TABLE "onboarding_task_template_items" ADD COLUMN IF NOT EXISTS "start_mode" TEXT;
ALTER TABLE "onboarding_task_template_items" ADD COLUMN IF NOT EXISTS "due_mode" TEXT;
ALTER TABLE "onboarding_task_template_items" ADD COLUMN IF NOT EXISTS "fixed_start_date" TEXT;
ALTER TABLE "onboarding_task_template_items" ADD COLUMN IF NOT EXISTS "fixed_due_date" TEXT;
