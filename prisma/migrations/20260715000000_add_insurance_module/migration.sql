-- CreateEnum
CREATE TYPE "InsuranceCarrierType" AS ENUM (
  'COMMERCIAL',
  'GOVERNMENT',
  'MEDICARE',
  'MEDICAID',
  'TPA',
  'MANAGED_CARE',
  'OTHER'
);

-- CreateEnum
CREATE TYPE "InsurancePlanType" AS ENUM (
  'HMO',
  'PPO',
  'POS',
  'EPO',
  'INDEMNITY',
  'OTHER'
);

-- CreateEnum
CREATE TYPE "InsuranceStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "insurance_carriers" (
  "id" UUID NOT NULL,
  "carrier_name" TEXT NOT NULL,
  "carrier_code" TEXT NOT NULL,
  "carrier_type" "InsuranceCarrierType" NOT NULL,
  "status" "InsuranceStatus" NOT NULL,
  "website" TEXT,
  "telecom" JSONB,
  "address" JSONB,
  "notes" TEXT,
  "contacts" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "insurance_carriers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_plans" (
  "id" UUID NOT NULL,
  "carrier_id" UUID NOT NULL,
  "plan_name" TEXT NOT NULL,
  "plan_code" TEXT NOT NULL,
  "plan_type" "InsurancePlanType" NOT NULL,
  "status" "InsuranceStatus" NOT NULL,
  "address" JSONB,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "insurance_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "insurance_carriers_carrier_code_key"
ON "insurance_carriers"("carrier_code");

-- CreateIndex
CREATE INDEX "insurance_carriers_carrier_name_idx"
ON "insurance_carriers"("carrier_name");

-- CreateIndex
CREATE INDEX "insurance_carriers_carrier_type_idx"
ON "insurance_carriers"("carrier_type");

-- CreateIndex
CREATE INDEX "insurance_carriers_status_idx"
ON "insurance_carriers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_plans_plan_code_key"
ON "insurance_plans"("plan_code");

-- CreateIndex
CREATE INDEX "insurance_plans_carrier_id_idx"
ON "insurance_plans"("carrier_id");

-- CreateIndex
CREATE INDEX "insurance_plans_plan_name_idx"
ON "insurance_plans"("plan_name");

-- CreateIndex
CREATE INDEX "insurance_plans_status_idx"
ON "insurance_plans"("status");

-- AddForeignKey
ALTER TABLE "insurance_plans"
ADD CONSTRAINT "insurance_plans_carrier_id_fkey"
FOREIGN KEY ("carrier_id") REFERENCES "insurance_carriers"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
