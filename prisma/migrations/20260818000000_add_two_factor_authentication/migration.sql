-- Migration for 2FA (two_factor_enabled & two_factor_secret) without data loss

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "two_factor_secret" TEXT;
