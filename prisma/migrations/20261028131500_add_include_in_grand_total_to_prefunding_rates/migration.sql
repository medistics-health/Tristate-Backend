-- Migration: 20261028131500_add_include_in_grand_total_to_prefunding_rates
-- AlterTable: Add include_in_grand_total to prefunding_rates
ALTER TABLE "prefunding_rates" ADD COLUMN IF NOT EXISTS "include_in_grand_total" BOOLEAN NOT NULL DEFAULT true;
