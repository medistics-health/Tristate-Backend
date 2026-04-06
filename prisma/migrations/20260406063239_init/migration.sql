-- CreateEnum
CREATE TYPE "UserRoles" AS ENUM ('SALES', 'ACCOUNTMANAGER', 'OPERATIONS', 'FINANCE', 'VIEWER');

-- CreateEnum
CREATE TYPE "PracticeStatus" AS ENUM ('LEAD', 'ACTIVE', 'INACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "PracticeSource" AS ENUM ('DIRECT', 'REFERRAL', 'CHANNEL_PARTNER', 'OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "ContactRole" AS ENUM ('OWNER', 'ADMIN', 'FINANCE', 'OPERATIONS', 'CLINICAL', 'PROCUREMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "InfluenceLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'DECISION_MAKER');

-- CreateEnum
CREATE TYPE "DealStage" AS ENUM ('PROSPECTING', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "AgreementType" AS ENUM ('MSA', 'SOW', 'RENEWAL', 'ADDENDUM');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VendorType" AS ENUM ('BILLING', 'CODING', 'RCM', 'COMPLIANCE', 'TECHNOLOGY', 'OTHER');

-- CreateEnum
CREATE TYPE "AuditType" AS ENUM ('COMPLIANCE', 'CODING', 'DOCUMENTATION', 'REVENUE_CYCLE', 'OPERATIONAL');

-- CreateEnum
CREATE TYPE "ChannelPartnerType" AS ENUM ('RESELLER', 'REFERRAL', 'IMPLEMENTATION', 'STRATEGIC');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "userName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "UserRoles" NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practices" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "PracticeStatus" NOT NULL,
    "region" TEXT NOT NULL,
    "source" "PracticeSource" NOT NULL,
    "bucket" TEXT[],
    "owner_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "role" "ContactRole" NOT NULL,
    "influence" "InfluenceLevel" NOT NULL,
    "email" TEXT,
    "phone" TEXT,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "stage" "DealStage" NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "probability" INTEGER NOT NULL,
    "expected_close_date" TIMESTAMP(3),

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agreements" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "deal_id" UUID,
    "type" "AgreementType" NOT NULL,
    "status" "AgreementStatus" NOT NULL,
    "effective_date" TIMESTAMP(3),
    "renewal_date" TIMESTAMP(3),

    CONSTRAINT "agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "client_rate" DECIMAL(12,2) NOT NULL,
    "vendor_rate" DECIMAL(12,2) NOT NULL,
    "margin" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "agreement_id" UUID,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "status" "InvoiceStatus" NOT NULL,
    "due_date" TIMESTAMP(3),

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_line_items" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "total_price" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "invoice_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "total_cost" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "VendorType" NOT NULL,
    "renewal_date" TIMESTAMP(3),

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audits" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "deal_id" UUID,
    "type" "AuditType" NOT NULL,
    "score" DECIMAL(5,2),
    "findings" JSONB NOT NULL,
    "recommendations" JSONB NOT NULL,

    CONSTRAINT "audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "responses" JSONB NOT NULL,
    "score" DECIMAL(5,2),

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_partners" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ChannelPartnerType" NOT NULL,
    "agreement_id" UUID,

    CONSTRAINT "channel_partners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_userName_key" ON "User"("userName");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "practices_owner_id_idx" ON "practices"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_email_key" ON "contacts"("email");

-- CreateIndex
CREATE INDEX "contacts_practice_id_idx" ON "contacts"("practice_id");

-- CreateIndex
CREATE INDEX "deals_practice_id_idx" ON "deals"("practice_id");

-- CreateIndex
CREATE INDEX "agreements_practice_id_idx" ON "agreements"("practice_id");

-- CreateIndex
CREATE INDEX "agreements_deal_id_idx" ON "agreements"("deal_id");

-- CreateIndex
CREATE INDEX "invoices_practice_id_idx" ON "invoices"("practice_id");

-- CreateIndex
CREATE INDEX "invoices_agreement_id_idx" ON "invoices"("agreement_id");

-- CreateIndex
CREATE INDEX "invoice_line_items_invoice_id_idx" ON "invoice_line_items"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_line_items_service_id_idx" ON "invoice_line_items"("service_id");

-- CreateIndex
CREATE INDEX "purchase_orders_vendor_id_idx" ON "purchase_orders"("vendor_id");

-- CreateIndex
CREATE INDEX "purchase_orders_invoice_id_idx" ON "purchase_orders"("invoice_id");

-- CreateIndex
CREATE INDEX "audits_practice_id_idx" ON "audits"("practice_id");

-- CreateIndex
CREATE INDEX "audits_deal_id_idx" ON "audits"("deal_id");

-- CreateIndex
CREATE INDEX "assessments_practice_id_idx" ON "assessments"("practice_id");

-- CreateIndex
CREATE INDEX "channel_partners_agreement_id_idx" ON "channel_partners"("agreement_id");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audits" ADD CONSTRAINT "audits_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audits" ADD CONSTRAINT "audits_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_partners" ADD CONSTRAINT "channel_partners_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
