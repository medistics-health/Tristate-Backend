-- Migration: 20261014184500_add_line_item_sequence_and_grand_total
-- Adds sequence and include_in_grand_total columns to prefunding_invoice_line_items for production.

ALTER TABLE "prefunding_invoice_line_items" 
  ADD COLUMN IF NOT EXISTS "include_in_grand_total" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "sequence" INTEGER NOT NULL DEFAULT 0;
