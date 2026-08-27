-- Add service lines to practices using the existing OnboardingServiceLine legend.

DO $$ BEGIN
    CREATE TYPE "OnboardingServiceLine" AS ENUM (
      'HR',
      'BENEFITS',
      'CREDENTIALING',
      'RCM',
      'CCM',
      'VBC',
      'BACK_OFFICE',
      'COMPLIANCE',
      'MSP_IT',
      'EMR',
      'SYNGATE',
      'SALES',
      'CREDIT_CARDS'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "practices"
ADD COLUMN IF NOT EXISTS "service_lines" "OnboardingServiceLine"[] NOT NULL DEFAULT ARRAY[]::"OnboardingServiceLine"[];
