-- Migration: 20261027133000_add_prefunding_permissions_and_reminder_tracking
-- Adds prefunding action-level permissions to User table, and reminder recipient / schedule delivery tracking keys to practices table.

-- 1. Add prefunding_permissions to User table
ALTER TABLE "User" 
  ADD COLUMN IF NOT EXISTS "prefunding_permissions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- 2. Add prefunding_reminder_recipient_id and cycle delivery tracking keys to practices table
ALTER TABLE "practices" 
  ADD COLUMN IF NOT EXISTS "prefunding_reminder_recipient_id" UUID,
  ADD COLUMN IF NOT EXISTS "last_prefunding_reminder_sent_cycle_key" TEXT,
  ADD COLUMN IF NOT EXISTS "last_prefunding_due_sent_cycle_key" TEXT;
