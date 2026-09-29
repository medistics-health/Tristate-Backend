-- AlterEnum
ALTER TYPE "PersonRole" ADD VALUE IF NOT EXISTS 'EMPLOYEE';
ALTER TYPE "PersonRole" ADD VALUE IF NOT EXISTS 'MANAGER';
ALTER TYPE "PersonRole" ADD VALUE IF NOT EXISTS 'ADMINISTRATOR';

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "roles" "PersonRole"[] DEFAULT ARRAY[]::"PersonRole"[];
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "budgeted_hours" DOUBLE PRECISION;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "buffer_percentage" DOUBLE PRECISION;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "date_of_joining" TIMESTAMP(3);
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "job_category" TEXT;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "pay_rate" DOUBLE PRECISION;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "pay_type" TEXT;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "state" TEXT;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "work_location" TEXT;

-- Data Migration: Copy existing 'role' to the new 'roles' array safely
UPDATE "contacts" SET "roles" = ARRAY["role"]::"PersonRole"[] WHERE "role" IS NOT NULL AND "roles" = ARRAY[]::"PersonRole"[];

-- Drop old column
ALTER TABLE "contacts" DROP COLUMN IF EXISTS "role";
