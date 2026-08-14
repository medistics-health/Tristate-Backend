-- Move CLIA and Railroad Medicare (Group) onto onboarding providers

ALTER TABLE "onboarding_providers"
ADD COLUMN IF NOT EXISTS "railroad_medicare_group" TEXT;

ALTER TABLE "onboarding_providers"
ADD COLUMN IF NOT EXISTS "clia_number" TEXT;
