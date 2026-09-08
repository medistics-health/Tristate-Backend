-- AlterEnum
ALTER TYPE "OnboardingTaskPhase" ADD VALUE IF NOT EXISTS 'HYPERCARE_OPTIMIZATION';

-- AlterTable
ALTER TABLE "onboarding_task_dependencies" ADD COLUMN IF NOT EXISTS "dependency_type" TEXT NOT NULL DEFAULT 'BLOCKS_START';
ALTER TABLE "onboarding_task_dependencies" ADD COLUMN IF NOT EXISTS "required_status" "OnboardingTaskStatus" NOT NULL DEFAULT 'COMPLETE';
