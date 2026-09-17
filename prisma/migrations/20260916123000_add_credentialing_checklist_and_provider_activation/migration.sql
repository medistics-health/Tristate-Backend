-- AlterEnum
ALTER TYPE "OnboardingTaskPhase" ADD VALUE IF NOT EXISTS 'PROVIDER_ACTIVATION';

-- AlterTable
ALTER TABLE "credentialing_requests" ADD COLUMN IF NOT EXISTS "checklist" JSONB;
