-- AlterTable system_settings
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "credentialing_reminder_days" INTEGER NOT NULL DEFAULT 5;

-- AlterTable credentialing_requests
ALTER TABLE "credentialing_requests" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "credentialing_requests" ADD COLUMN IF NOT EXISTS "enrollment_id" TEXT;
