-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRoles" AS ENUM ('ADMIN', 'SALES', 'ACCOUNTMANAGER', 'OPERATIONS', 'FINANCE', 'VIEWER');

-- CreateEnum
CREATE TYPE "PracticeStatus" AS ENUM ('LEAD', 'ACTIVE', 'INACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "PracticeSource" AS ENUM ('DIRECT', 'REFERRAL', 'CHANNEL_PARTNER', 'OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "PersonRole" AS ENUM ('OWNER', 'ADMIN', 'FINANCE', 'OPERATIONS', 'CLINICAL', 'PROCUREMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "PersonStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "InfluenceLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'DECISION_MAKER');

-- CreateEnum
CREATE TYPE "DealStage" AS ENUM ('LEAD', 'PROSPECTING', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST', 'AGREEMENT_SENT', 'ONBOARDING');

-- CreateEnum
CREATE TYPE "AgreementType" AS ENUM ('MSA', 'SOW', 'RENEWAL', 'ADDENDUM');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('DRAFT', 'SENT', 'ACTIVE', 'INACTIVE', 'EXPIRED', 'TERMINATED', 'SIGNED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VendorType" AS ENUM ('BILLING', 'CODING', 'RCM', 'COMPLIANCE', 'TECHNOLOGY', 'OTHER');

-- CreateEnum
CREATE TYPE "AuditType" AS ENUM ('COMPLIANCE', 'CODING', 'DOCUMENTATION', 'REVENUE_CYCLE', 'OPERATIONAL');

-- CreateEnum
CREATE TYPE "OnboardingType" AS ENUM ('SINGLE_PRACTICE', 'MULTIPLE_PRACTICES', 'SINGLE_PRACTICE_NOW');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContactRole" AS ENUM ('EXECUTIVE_OWNER', 'OFFICE_MANAGER', 'PRACTICE_MANAGER', 'BILLING', 'CREDENTIALING', 'CLINICAL_STAFF', 'IT_TECHNICAL', 'CONSULTANT', 'OTHER');

-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('INDEPENDENT_PRACTICE', 'MEDICAL_GROUP', 'MULTI_SPECIALTY_GROUP', 'MSO', 'IPA', 'DSO', 'FQHC', 'HOSPITAL_AFFILIATED_GROUP', 'PHARMACY_ORGANIZATION', 'OTHER');

-- CreateEnum
CREATE TYPE "OwnershipType" AS ENUM ('PHYSICIAN_OWNED', 'CORPORATE_OWNED', 'PRIVATE_EQUITY_BACKED', 'HOSPITAL_AFFILIATED', 'FAMILY_OWNED', 'PARTNERSHIP', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentTypes" AS ENUM ('W9', 'SIGNED_AGREEMENT', 'BAA', 'COI', 'PROVIDER_ROSTER', 'CAQH', 'ENROLLMENT_LETTER', 'BRANDING_ASSET', 'BILLING_REPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('NOT_REQUESTED', 'REQUESTED', 'RECEIVED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('CREDENTIALING', 'BILLING_RCM', 'APCM', 'CCM', 'RPM', 'PCM', 'RTM', 'BHI', 'TCM', 'LAB_RELATIONSHIP_SUPPORT', 'PHARMACY_PROGRAM_SUPPORT', 'PATIENT_ACQUISITION_BRAND_GROWTH', 'PATIENT_ACQUISITION', 'BRAND_GROWTH', 'MSP_TECH_SUPPORT', 'AI_VISIBILITY', 'OTHER');

-- CreateEnum
CREATE TYPE "CredentialingIssues" AS ENUM ('INCORRECT_SPECIALTY_ENROLLMENT', 'MISSING_PAYER_ENROLLMENT', 'EXPIRED_ENROLLMENT', 'RECREDENTIALING_LETTER', 'BRANDING_ASSET', 'BILLING_REPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "BillingModel" AS ENUM ('IN_HOUSE', 'OUTSOURCED', 'HYBRID');

-- CreateEnum
CREATE TYPE "PricingModel" AS ENUM ('FIXED_MONTHLY', 'FIXED_ONE_TIME', 'PER_UNIT', 'PER_ENCOUNTER', 'PER_PATIENT', 'PER_PROVIDER', 'PER_SITE', 'PER_CPT_CODE', 'PERCENT_COLLECTIONS', 'PERCENT_REVENUE', 'PERCENT_PROFIT', 'TIERED_VOLUME', 'MONTHLY_MINIMUM', 'HYBRID', 'MULTI_COMPONENT', 'RETAINER', 'SUCCESS_FEE', 'CUSTOM_ATTACHMENT_DEFINED');

-- CreateEnum
CREATE TYPE "BillingRunStatus" AS ENUM ('PENDING', 'RUNNING', 'CALCULATED', 'REVIEW_REQUIRED', 'APPROVED', 'POSTED', 'FAILED', 'CLOSED');

-- CreateEnum
CREATE TYPE "VendorPayableStatus" AS ENUM ('DRAFT', 'CALCULATED', 'APPROVED', 'ON_HOLD', 'RELEASED', 'SENT_TO_VENDOR', 'PAYABLE', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReleasePolicy" AS ENUM ('ON_INVOICE_APPROVAL', 'ON_CLIENT_PAYMENT', 'MANUAL');

-- CreateEnum
CREATE TYPE "ApprovalEntityType" AS ENUM ('BILLING_RUN', 'BILLING_RUN_ITEM', 'CLIENT_INVOICE', 'VENDOR_PAYABLE', 'AGREEMENT_TERM');

-- CreateEnum
CREATE TYPE "ApprovalDecisionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'OVERRIDDEN');

-- CreateEnum
CREATE TYPE "ExceptionSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ExceptionStatus" AS ENUM ('OPEN', 'RESOLVED', 'OVERRIDDEN');

-- CreateEnum
CREATE TYPE "ExternalSystem" AS ENUM ('STRIPE', 'QUICKBOOKS', 'MERCURY');

-- CreateEnum
CREATE TYPE "ExternalEntityType" AS ENUM ('CUSTOMER', 'VENDOR', 'INVOICE', 'PAYMENT', 'BILL', 'BILL_PAYMENT', 'JOURNAL_ENTRY');

-- CreateEnum
CREATE TYPE "ExternalSyncStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SYNCED', 'FAILED', 'RETRYING');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'PARTIALLY_ALLOCATED', 'ALLOCATED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "StripeTransferStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ChannelPartnerType" AS ENUM ('RESELLER', 'REFERRAL', 'IMPLEMENTATION', 'STRATEGIC');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('LEAD', 'CUSTOMER', 'PARTNER', 'INACTIVE');

-- CreateEnum
CREATE TYPE "EntityStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PracticeTypes" AS ENUM ('PRIMARY_CARE', 'FAMILY_MEDICINE', 'INTERNAL_MEDICINE', 'PEDIATRICS', 'CARDIOLOGY', 'GASTROENTEROLOGY', 'ENDOCRINOLOGY', 'PULMONOLOGY', 'NEPHROLOGY', 'NEUROLOGY', 'BEHAVIORAL_HEALTH', 'MULTI_SPECIALTY', 'OTHER');

-- CreateEnum
CREATE TYPE "ContactRoles" AS ENUM ('OWNER', 'PRACTICE_MANAGER', 'OFFICE_MANAGER', 'BILLING_CONTACT', 'CREDENTIALING_CONTACT', 'CLINICAL_LEAD', 'TECHNICAL_CONTACT', 'COMPLIANCE_CONTACT', 'MARKETING_CONTACT', 'AUTHORIZED_SIGNER', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "CredentialingRequestStatus" AS ENUM ('NOT_STARTED', 'APPLICATION_SUBMITTED', 'IN_PROCESS_PAYER_REVIEW', 'PENDING_ADDITIONAL_INFO', 'CONTRACTED_DIRECT', 'CONTRACTED_IPA_DELEGATED', 'OUT_OF_NETWORK', 'DECLINED_APPLICATION_REJECTED', 'RE_CREDENTIALING_DUE', 'TERMINATED');

-- CreateEnum
CREATE TYPE "CredentialingRequestType" AS ENUM ('NEW_CREDENTIALING', 'RE_CREDENTIALING', 'DEMOGRAPHIC_UPDATE', 'ADD_LOCATION');

-- CreateEnum
CREATE TYPE "CredentialingContractType" AS ENUM ('DIRECT_CONTRACT', 'IPA_DELEGATED', 'UNKNOWN_PENDING_CONFIRMATION');

-- CreateEnum
CREATE TYPE "CredentialingVerificationStatus" AS ENUM ('YES', 'NO', 'PENDING');

-- CreateEnum
CREATE TYPE "CredentialingPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "CredentialingCommunicationChannel" AS ENUM ('PHONE', 'EMAIL', 'PAYER_PORTAL', 'FAX', 'MAIL');

-- CreateEnum
CREATE TYPE "CredentialingDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "CredentialingDocumentType" AS ENUM ('MEDICAL_LICENSE', 'DEA', 'BOARD_CERTIFICATE', 'CV', 'W9', 'INSURANCE_CERTIFICATE', 'OTHER_DOCUMENTS');

-- CreateEnum
CREATE TYPE "CredentialingActivityType" AS ENUM ('CREATED', 'UPDATED', 'EDITED', 'STATUS_CHANGED', 'DOCUMENT_UPLOADED', 'FOLLOW_UP_LOGGED', 'DELETED');

-- CreateEnum
CREATE TYPE "InsuranceCarrierType" AS ENUM ('COMMERCIAL', 'GOVERNMENT', 'MEDICARE', 'MEDICAID', 'TPA', 'MANAGED_CARE', 'OTHER');

-- CreateEnum
CREATE TYPE "InsurancePlanType" AS ENUM ('HMO', 'PPO', 'POS', 'EPO', 'INDEMNITY', 'OTHER');

-- CreateEnum
CREATE TYPE "InsuranceStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "userName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "UserRoles" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "industry" TEXT,
    "size" INTEGER,
    "revenue" DECIMAL(15,2),
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "street" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "zip" TEXT,
    "status" "CompanyStatus" NOT NULL DEFAULT 'LEAD',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quickbooks_connections" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "realm_id" TEXT NOT NULL,
    "is_sandbox" BOOLEAN NOT NULL DEFAULT true,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "access_token_expires_at" TIMESTAMP(3),
    "refresh_token_expires_at" TIMESTAMP(3),
    "connected_by_user_id" UUID,
    "default_income_item_id" TEXT,
    "default_expense_account_id" TEXT,
    "last_sync_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quickbooks_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_groups" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "company_id" UUID NOT NULL,
    "parent_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practice_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practices" (
    "id" UUID NOT NULL,
    "company_id" UUID,
    "practice_group_id" UUID,
    "tax_id_id" UUID,
    "name" TEXT NOT NULL,
    "npi" TEXT,
    "status" "PracticeStatus" NOT NULL,
    "region" TEXT,
    "source" "PracticeSource" NOT NULL,
    "bucket" TEXT[],
    "stripe_customer_id" TEXT,
    "quickbooks_customer_id" TEXT,
    "default_currency" TEXT DEFAULT 'USD',
    "bill_to_tax_id_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_ids" (
    "id" UUID NOT NULL,
    "tax_id_number" TEXT NOT NULL,
    "legal_entity_name" TEXT NOT NULL,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "company_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_ids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_persons" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,

    CONSTRAINT "practice_persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_persons" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,

    CONSTRAINT "company_persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_npis" (
    "id" UUID NOT NULL,
    "group_npi_number" TEXT NOT NULL,
    "group_name" TEXT NOT NULL,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "tax_id" UUID,
    "practice_group_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_npis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "role" "PersonRole" NOT NULL,
    "status" "PersonStatus" NOT NULL DEFAULT 'ACTIVE',
    "designation" TEXT,
    "influence" "InfluenceLevel" NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

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
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activity_count" INTEGER NOT NULL DEFAULT 0,
    "company_id" UUID,
    "last_activity_at" TIMESTAMP(3),
    "next_task_due_at" TIMESTAMP(3),
    "next_task_title" TEXT,
    "primary_contact_id" UUID,

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
    "external_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "docuseal_submissions" (
    "id" UUID NOT NULL,
    "agreement_id" UUID NOT NULL,
    "docuseal_submission_id" INTEGER,
    "person_id" UUID,
    "url" TEXT,
    "docSlug" TEXT,
    "signed_doc_url" TEXT,
    "audit_log_url" TEXT,
    "status" TEXT,
    "approval_status" TEXT,
    "submissionApprovalStatus" TEXT,
    "submissionApprovalNote" TEXT,
    "template_id" INTEGER,
    "field_values" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "docuseal_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "docu_signers" (
    "id" UUID NOT NULL,
    "external_id" INTEGER,
    "signer_uuid" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "submissionSlug" TEXT,
    "signed_url" TEXT,
    "audit_url" TEXT,
    "signed_at" TIMESTAMP(3),
    "ip_address" TEXT,
    "order" INTEGER NOT NULL,
    "submission_id" UUID NOT NULL,

    CONSTRAINT "docu_signers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "category" TEXT,
    "stripe_connected_account_id" TEXT,
    "vendor_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

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
    "invoice_number" TEXT,
    "currency" TEXT DEFAULT 'USD',
    "billing_period_start" TIMESTAMP(3),
    "billing_period_end" TIMESTAMP(3),
    "subtotal_amount" DECIMAL(12,2),
    "payment_method" TEXT,
    "processing_fee_amount" DECIMAL(12,2),
    "tax_amount" DECIMAL(12,2),
    "discount_amount" DECIMAL(12,2),
    "stripe_invoice_id" TEXT,
    "stripe_hosted_invoice_url" TEXT,
    "stripe_invoice_pdf_url" TEXT,
    "invoice_pdf_blob_url" TEXT,
    "receipt_pdf_blob_url" TEXT,
    "quickbooks_invoice_id" TEXT,
    "due_reminder_5_days_sent" BOOLEAN NOT NULL DEFAULT false,
    "due_reminder_overdue_sent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_line_items" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "stripe_connected_account_id" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "total_price" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "billing_run_item_id" UUID,
    "billing_run_item_component_id" UUID,
    "agreement_service_term_id" UUID,
    "billing_period_start" TIMESTAMP(3),
    "billing_period_end" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_connected_account_transfers" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "stripe_connected_account_id" TEXT NOT NULL,
    "stripe_transfer_id" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "StripeTransferStatus" NOT NULL DEFAULT 'PENDING',
    "failure_message" TEXT,
    "transfer_group" TEXT,
    "service_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "invoice_line_item_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_connected_account_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "total_cost" DECIMAL(12,2) NOT NULL,
    "vendor_payable_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "VendorType" NOT NULL,
    "renewal_date" TIMESTAMP(3),
    "quickbooks_vendor_id" TEXT,
    "remit_email" TEXT,
    "payment_terms" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agreement_versions" (
    "id" UUID NOT NULL,
    "agreement_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "effective_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agreement_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agreement_service_terms" (
    "id" UUID NOT NULL,
    "agreement_id" UUID NOT NULL,
    "agreement_version_id" UUID,
    "service_id" UUID NOT NULL,
    "vendor_id" UUID,
    "pricing_model" "PricingModel" NOT NULL,
    "pricing_config" JSONB NOT NULL,
    "currency" TEXT DEFAULT 'USD',
    "priority" INTEGER NOT NULL DEFAULT 1,
    "minimum_fee" DECIMAL(12,2),
    "effective_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "external_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approval_status" "ApprovalDecisionStatus",

    CONSTRAINT "agreement_service_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_runs" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "status" "BillingRunStatus" NOT NULL DEFAULT 'PENDING',
    "approved_by_user_id" UUID,
    "approved_at" TIMESTAMP(3),
    "notes" TEXT,
    "payment_method" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agreement_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "billing_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_input_snapshots" (
    "id" UUID NOT NULL,
    "billing_run_id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "service_id" UUID,
    "metric_key" TEXT NOT NULL,
    "metric_value" DECIMAL(18,4),
    "metric_text_value" TEXT,
    "metric_json_value" JSONB,
    "source_type" TEXT,
    "source_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_input_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_run_items" (
    "id" UUID NOT NULL,
    "billing_run_id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "vendor_id" UUID,
    "agreement_service_term_id" UUID,
    "client_amount" DECIMAL(12,2) NOT NULL,
    "vendor_amount" DECIMAL(12,2),
    "margin_amount" DECIMAL(12,2),
    "currency" TEXT DEFAULT 'USD',
    "formula_snapshot" JSONB,
    "source_snapshot" JSONB,
    "exception_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_run_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_run_item_components" (
    "id" UUID NOT NULL,
    "billing_run_item_id" UUID NOT NULL,
    "component_type" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(18,4),
    "rate" DECIMAL(12,4),
    "amount" DECIMAL(12,2) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_run_item_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_payables" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "invoice_id" UUID,
    "billing_run_id" UUID,
    "payable_number" TEXT,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT DEFAULT 'USD',
    "status" "VendorPayableStatus" NOT NULL DEFAULT 'DRAFT',
    "release_policy" "ReleasePolicy" NOT NULL DEFAULT 'ON_CLIENT_PAYMENT',
    "released_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "quickbooks_bill_id" TEXT,
    "quickbooks_bill_payment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_payables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_payable_line_items" (
    "id" UUID NOT NULL,
    "vendor_payable_id" UUID NOT NULL,
    "service_id" UUID,
    "description" TEXT,
    "quantity" DECIMAL(18,4),
    "unit_cost" DECIMAL(12,4),
    "total_cost" DECIMAL(12,2) NOT NULL,
    "billing_run_item_id" UUID,
    "billing_run_item_component_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_payable_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_decisions" (
    "id" UUID NOT NULL,
    "entity_type" "ApprovalEntityType" NOT NULL,
    "entity_id" UUID NOT NULL,
    "decision" "ApprovalDecisionStatus" NOT NULL,
    "decided_by_user_id" UUID,
    "reason" TEXT,
    "note" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exception_events" (
    "id" UUID NOT NULL,
    "entity_type" "ApprovalEntityType" NOT NULL,
    "entity_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" "ExceptionSeverity" NOT NULL,
    "status" "ExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "resolved_by_user_id" UUID,
    "resolved_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exception_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_sync_jobs" (
    "id" UUID NOT NULL,
    "system" "ExternalSystem" NOT NULL,
    "entity_type" "ExternalEntityType" NOT NULL,
    "entity_id" UUID NOT NULL,
    "external_id" TEXT,
    "status" "ExternalSyncStatus" NOT NULL DEFAULT 'PENDING',
    "direction" TEXT,
    "payload" JSONB,
    "last_error" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_sync_attempts" (
    "id" UUID NOT NULL,
    "external_sync_job_id" UUID NOT NULL,
    "status" "ExternalSyncStatus" NOT NULL,
    "request_payload" JSONB,
    "response_payload" JSONB,
    "error_message" TEXT,
    "attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_sync_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT DEFAULT 'USD',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "payment_date" TIMESTAMP(3),
    "payment_method" TEXT,
    "stripe_payment_intent_id" TEXT,
    "stripe_charge_id" TEXT,
    "quickbooks_payment_id" TEXT,
    "external_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "allocated_amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
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
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "responses" JSONB NOT NULL,
    "score" DECIMAL(5,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboardings" (
    "id" UUID NOT NULL,
    "practice_id" UUID,
    "person_id" UUID,
    "onboarding_type" "OnboardingType",
    "is_authorized_person" BOOLEAN,
    "non_authorized_role" TEXT,
    "number_of_practices" INTEGER,
    "number_of_locations" INTEGER,
    "billing_managed_centrally" TEXT,
    "credentialing_managed_centrally" TEXT,
    "contracting_managed_centrally" TEXT,
    "one_main_contact" BOOLEAN,
    "legal_company_name" TEXT,
    "dba_name" TEXT,
    "organization_type" "OrganizationType",
    "tax_id_ein" TEXT,
    "main_company_phone" TEXT,
    "main_company_fax" TEXT,
    "main_company_email" TEXT,
    "company_website" TEXT,
    "company_address_line_1" TEXT,
    "company_address_line_2" TEXT,
    "company_city" TEXT,
    "company_state" TEXT,
    "company_zip" TEXT,
    "ownership_type" "OwnershipType",
    "states_of_operation" TEXT[],
    "is_legal_contracting_entity" BOOLEAN,
    "is_billing_entity" BOOLEAN,
    "is_credentialing_entity" BOOLEAN,
    "primary_specialty" TEXT,
    "additional_specialties" TEXT[],
    "requested_services" TEXT[],
    "primary_service_to_launch" TEXT,
    "requested_go_live_date" TIMESTAMP(3),
    "priority_level" TEXT,
    "services_for_all_practices" TEXT,
    "selected_practices" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "replacing_existing_vendor" BOOLEAN,
    "current_vendor_name" TEXT,
    "current_vendor_end_date" TIMESTAMP(3),
    "engagement_goals" TEXT,
    "information_accurate" BOOLEAN,
    "authorize_use" BOOLEAN,
    "submitted_by_name" TEXT,
    "submitted_by_title" TEXT,
    "submission_date" TIMESTAMP(3),
    "status" "OnboardingStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboardings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_contacts" (
    "id" UUID NOT NULL,
    "onboarding_id" UUID NOT NULL,
    "full_name" TEXT,
    "job_title" TEXT,
    "contact_role" "ContactRoles",
    "email" TEXT,
    "phone" TEXT,
    "extension" TEXT,
    "preferred_contact_method" TEXT,
    "best_time_to_reach" TEXT,
    "is_primary_decision_maker" BOOLEAN,
    "can_sign_agreements" BOOLEAN,
    "additional_responsibilities" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_practices" (
    "id" UUID NOT NULL,
    "onboarding_id" UUID NOT NULL,
    "practice_name" TEXT,
    "practice_dba_name" TEXT,
    "is_part_of_parent_company" BOOLEAN,
    "practice_type" "PracticeTypes",
    "additional_specialty_areas" TEXT[],
    "group_npi" TEXT,
    "tax_id_ein" TEXT,
    "medicaid_id_number" TEXT,
    "group_medicaid_npi" TEXT,
    "group_medicare_ptan" TEXT,
    "group_taxonomy" TEXT,
    "ipa_affiliations" TEXT,
    "practice_manager_name" TEXT,
    "practice_manager_email" TEXT,
    "practice_manager_phone" TEXT,
    "billing_address" TEXT,
    "mailing_address" TEXT,
    "practice_work_start_date" TIMESTAMP(3),
    "railroad_medicare_group" TEXT,
    "approximate_number_of_providers" INTEGER,
    "approximate_number_of_locations" INTEGER,
    "approximate_monthly_patient_volume" INTEGER,
    "approximate_medicare_patient_volume" INTEGER,
    "approximate_medicaid_patient_volume" INTEGER,
    "approximate_commercial_patient_volume" INTEGER,
    "offers_care_management_services" BOOLEAN,
    "current_services_offered" TEXT[],
    "operational_pain_points" TEXT[],
    "additional_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_practices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_locations" (
    "id" UUID NOT NULL,
    "onboarding_practice_id" UUID NOT NULL,
    "location_name" TEXT,
    "is_primary_location" BOOLEAN,
    "address_line_1" TEXT,
    "address_line_2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip_code" TEXT,
    "main_phone_number" TEXT,
    "main_fax_number" TEXT,
    "office_email" TEXT,
    "hours_of_operation" TEXT,
    "office_manager_name" TEXT,
    "patient_outreach_managed" TEXT,
    "billing_managed" TEXT,
    "clia_number" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_providers" (
    "id" UUID NOT NULL,
    "onboarding_practice_id" UUID NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "full_name" TEXT,
    "date_of_birth" TIMESTAMP(3),
    "gender" TEXT,
    "credentials" TEXT,
    "provider_type" TEXT,
    "specialty" TEXT,
    "npi" TEXT,
    "caqh_id" TEXT,
    "ssn_full_digits" TEXT,
    "license_number" TEXT,
    "license_expiry_date" TIMESTAMP(3),
    "state_of_license" TEXT,
    "license_type" TEXT,
    "taxonomy" TEXT,
    "primary_specialty" TEXT,
    "secondary_specialty" TEXT,
    "board_certifications" TEXT,
    "caqh_username" TEXT,
    "caqh_password" TEXT,
    "caqh_last_attestation_date" TIMESTAMP(3),
    "languages_spoken" TEXT,
    "telehealth_available" BOOLEAN,
    "malpractice_carrier" TEXT,
    "malpractice_policy_number" TEXT,
    "malpractice_effective_date" TIMESTAMP(3),
    "malpractice_expiry_date" TIMESTAMP(3),
    "hospital_affiliations" TEXT,
    "personal_cell_number" TEXT,
    "personal_email" TEXT,
    "practice_email" TEXT,
    "medicare_ptan_individual" TEXT,
    "medicaid_id_individual" TEXT,
    "ipa_affiliations_provider_level" TEXT,
    "nppes_username" TEXT,
    "nppes_password" TEXT,
    "railroad_medicare_individual" TEXT,
    "copy_of_board_certification" TEXT,
    "copy_of_professional_liability_insurance" TEXT,
    "copy_of_bachelors_degree" TEXT,
    "copy_of_masters_degree" TEXT,
    "copy_of_social_security_card" TEXT,
    "copy_of_drivers_license" TEXT,
    "passport_sized_photo" TEXT,
    "resume" TEXT,
    "provider_effective_date_with_group" TIMESTAMP(3),
    "country_of_birth" TEXT,
    "state_place_of_birth" TEXT,
    "home_address" TEXT,
    "state_license_number" TEXT,
    "dea_number" TEXT,
    "board_certified" BOOLEAN,
    "employment_status" TEXT,
    "participating_locations" TEXT[],
    "credentialing_needed" TEXT,
    "recredentialing_needed" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_documents" (
    "id" UUID NOT NULL,
    "onboarding_id" UUID NOT NULL,
    "document_type" "DocumentTypes"[],
    "file_name" TEXT,
    "file_url" TEXT,
    "required" BOOLEAN,
    "status" "DocumentStatus",
    "date_requested" TIMESTAMP(3),
    "date_received" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_billing" (
    "id" UUID NOT NULL,
    "onboarding_id" UUID NOT NULL,
    "current_billing_model" TEXT,
    "billing_company_name" TEXT,
    "main_billing_contact_name" TEXT,
    "main_billing_contact_email" TEXT,
    "main_billing_contact_phone" TEXT,
    "recent_w9_form" TEXT,
    "void_check" TEXT,
    "formal_letter_from_bank" TEXT,
    "currently_billed_services" TEXT[],
    "active_payers" TEXT,
    "eft_era_setup" TEXT,
    "invoice_recipient" TEXT,
    "invoice_email" TEXT,
    "preferred_reporting_cadence" TEXT,
    "billing_pain_points" TEXT[],
    "additional_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_billing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_credentialing" (
    "id" UUID NOT NULL,
    "onboarding_id" UUID NOT NULL,
    "credentialing_needed" BOOLEAN,
    "credentialing_for" TEXT[],
    "payers_to_enroll" TEXT,
    "approved_insurances_tracker" TEXT,
    "designated_portal_contact_name" TEXT,
    "designated_portal_contact_email" TEXT,
    "designated_portal_contact_phone" TEXT,
    "irs_document_147c" TEXT,
    "desired_insurance_plans" TEXT,
    "caqh_maintained" BOOLEAN,
    "current_credentialing_issues" "CredentialingIssues"[],
    "medicare_ptan_available" TEXT,
    "medicaid_enrollment_active" TEXT,
    "additional_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_credentialing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_technology" (
    "id" UUID NOT NULL,
    "onboarding_id" UUID NOT NULL,
    "ehr_system" TEXT,
    "practice_management_system" TEXT,
    "patient_portal_available" BOOLEAN,
    "patient_list_exportable" BOOLEAN,
    "appointment_list_exportable" BOOLEAN,
    "api_access_available" BOOLEAN,
    "clearinghouse" TEXT,
    "fax_platform" TEXT,
    "phone_platform" TEXT,
    "current_care_management_platform" TEXT,
    "it_contact_name" TEXT,
    "it_contact_email" TEXT,
    "additional_technical_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_technology_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_outreach" (
    "id" UUID NOT NULL,
    "onboarding_id" UUID NOT NULL,
    "preferred_channels" TEXT[],
    "patient_text_consent" BOOLEAN,
    "preferred_languages" TEXT[],
    "interpreter_services" BOOLEAN,
    "outreach_from_practice" BOOLEAN,
    "approved_outreach_hours" TEXT,
    "messaging_requirements" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_outreach_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_lab_pharmacy" (
    "id" UUID NOT NULL,
    "onboarding_id" UUID NOT NULL,
    "preferred_lab" TEXT,
    "existing_lab_relationship" BOOLEAN,
    "lab_interface_status" TEXT,
    "lab_contact_name" TEXT,
    "lab_contact_email" TEXT,
    "pharmacy_partner_name" TEXT,
    "pharmacy_partner_involved" BOOLEAN,
    "additional_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_lab_pharmacy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_compliance" (
    "id" UUID NOT NULL,
    "onboarding_id" UUID NOT NULL,
    "hipaa_contact_name" TEXT,
    "hipaa_contact_email" TEXT,
    "baa_required" BOOLEAN,
    "security_questionnaire" BOOLEAN,
    "current_concerns" TEXT[],
    "additional_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_compliance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_care_program" (
    "id" UUID NOT NULL,
    "onboarding_id" UUID NOT NULL,
    "programs_planned" TEXT[],
    "estimated_eligible_patients" INTEGER,
    "current_enrolled_patients" INTEGER,
    "patient_enrollment_handler" TEXT,
    "monthly_follow_up_handler" TEXT,
    "consent_forms_in_place" BOOLEAN,
    "existing_care_plan_workflow" BOOLEAN,
    "patient_minutes_tracker" TEXT,
    "compliance_concerns" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_care_program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_event_logs" (
    "id" UUID NOT NULL,
    "stripe_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "stripe_object_type" TEXT,
    "stripe_object_id" TEXT,
    "invoice_id" UUID,
    "payload" JSONB,
    "processed_at" TIMESTAMP(3),
    "status" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_event_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entry_links" (
    "id" UUID NOT NULL,
    "source_entity_type" TEXT NOT NULL,
    "source_entity_id" UUID NOT NULL,
    "quickbooks_journal_entry_id" TEXT,
    "entry_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entry_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_partners" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ChannelPartnerType" NOT NULL,
    "agreement_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL,
    "organization_name" TEXT NOT NULL DEFAULT 'Tristate MSO',
    "domain" TEXT NOT NULL DEFAULT 'tristate-mso.com',
    "address" TEXT,
    "support_email" TEXT DEFAULT 'support@tristate-mso.com',
    "authorized_signer" TEXT,
    "notify_to" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "invoice_due_days" INTEGER NOT NULL DEFAULT 15,
    "invoice_reminder_days" INTEGER NOT NULL DEFAULT 5,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_selected_services" (
    "id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_selected_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_reports" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "submitted_by" TEXT,
    "due_date" TIMESTAMP(3),
    "month" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingMarketing" (
    "id" UUID NOT NULL,
    "onboarding_id" UUID NOT NULL,
    "website_url" TEXT,
    "social_media_channels" TEXT[],
    "current_marketing_channels" TEXT[],
    "target_patient_demographics" TEXT,
    "monthly_marketing_budget" TEXT,
    "existing_brand_assets" TEXT,
    "google_business_profile_claimed" BOOLEAN,
    "patient_acquisition_goals" TEXT,
    "ai_tools_used" TEXT,
    "additional_marketing_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingMarketing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credentialing_requests" (
    "id" UUID NOT NULL,
    "credentialing_id" TEXT NOT NULL,
    "practice_id" UUID NOT NULL,
    "provider_id" UUID,
    "provider_name" TEXT,
    "insurance_payer_name" TEXT NOT NULL,
    "request_type" "CredentialingRequestType" NOT NULL,
    "contract_type" "CredentialingContractType" NOT NULL,
    "ipa_delegated_entity_name" TEXT,
    "status" "CredentialingRequestStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "payer_provider_id" TEXT,
    "start_date" TIMESTAMP(3),
    "submission_date" TIMESTAMP(3),
    "approval_date" TIMESTAMP(3),
    "effective_date" TIMESTAMP(3),
    "expiration_date" TIMESTAMP(3),
    "next_follow_up_date" TIMESTAMP(3),
    "re_credentialing_due_date" TIMESTAMP(3),
    "last_activity_date" TIMESTAMP(3),
    "tin_verified" "CredentialingVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "address_verified" "CredentialingVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "lines_of_business" TEXT[],
    "priority" "CredentialingPriority" NOT NULL DEFAULT 'MEDIUM',
    "internal_notes" TEXT,
    "assigned_to_user_id" UUID,
    "created_by_user_id" UUID,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credentialing_requests_pkey" PRIMARY KEY ("id")
);

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
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

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
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insurance_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credentialing_follow_up_logs" (
    "id" UUID NOT NULL,
    "credentialing_request_id" UUID NOT NULL,
    "date_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" "CredentialingCommunicationChannel" NOT NULL,
    "direction" "CredentialingDirection" NOT NULL,
    "reference_number" TEXT,
    "summary" TEXT NOT NULL,
    "next_action" TEXT,
    "logged_by_name" TEXT,
    "logged_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credentialing_follow_up_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credentialing_documents" (
    "id" UUID NOT NULL,
    "credentialing_request_id" UUID NOT NULL,
    "document_type" "CredentialingDocumentType" NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT,
    "file_size" INTEGER,
    "mime_type" TEXT,
    "expiry_date" TIMESTAMP(3),
    "uploaded_by_name" TEXT,
    "uploaded_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credentialing_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credentialing_activity_logs" (
    "id" UUID NOT NULL,
    "credentialing_request_id" UUID NOT NULL,
    "activity_type" "CredentialingActivityType" NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "actor_name" TEXT,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credentialing_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mercury_transactions" (
    "id" UUID NOT NULL,
    "mercury_transaction_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "description" TEXT,
    "counterparty_name" TEXT,
    "posted_at" TIMESTAMP(3),
    "raw_payload_json" JSONB,
    "matched_entity_type" TEXT,
    "matched_entity_id" UUID,
    "reconciliation_status" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mercury_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PracticeGroupNpis" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_PracticeGroupNpis_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_AgreementToService" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_AgreementToService_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_userName_key" ON "User"("userName");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "quickbooks_connections_company_id_key" ON "quickbooks_connections"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "quickbooks_connections_realm_id_key" ON "quickbooks_connections"("realm_id");

-- CreateIndex
CREATE INDEX "quickbooks_connections_company_id_idx" ON "quickbooks_connections"("company_id");

-- CreateIndex
CREATE INDEX "quickbooks_connections_realm_id_idx" ON "quickbooks_connections"("realm_id");

-- CreateIndex
CREATE INDEX "practice_groups_company_id_idx" ON "practice_groups"("company_id");

-- CreateIndex
CREATE INDEX "practice_groups_parent_id_idx" ON "practice_groups"("parent_id");

-- CreateIndex
CREATE INDEX "practices_company_id_idx" ON "practices"("company_id");

-- CreateIndex
CREATE INDEX "practices_practice_group_id_idx" ON "practices"("practice_group_id");

-- CreateIndex
CREATE INDEX "practices_tax_id_id_idx" ON "practices"("tax_id_id");

-- CreateIndex
CREATE INDEX "practices_bill_to_tax_id_id_idx" ON "practices"("bill_to_tax_id_id");

-- CreateIndex
CREATE UNIQUE INDEX "tax_ids_tax_id_number_key" ON "tax_ids"("tax_id_number");

-- CreateIndex
CREATE INDEX "tax_ids_company_id_idx" ON "tax_ids"("company_id");

-- CreateIndex
CREATE INDEX "practice_persons_practice_id_idx" ON "practice_persons"("practice_id");

-- CreateIndex
CREATE INDEX "practice_persons_person_id_idx" ON "practice_persons"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "practice_persons_practice_id_person_id_key" ON "practice_persons"("practice_id", "person_id");

-- CreateIndex
CREATE INDEX "company_persons_company_id_idx" ON "company_persons"("company_id");

-- CreateIndex
CREATE INDEX "company_persons_person_id_idx" ON "company_persons"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_persons_company_id_person_id_key" ON "company_persons"("company_id", "person_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_npis_group_npi_number_key" ON "group_npis"("group_npi_number");

-- CreateIndex
CREATE INDEX "group_npis_tax_id_idx" ON "group_npis"("tax_id");

-- CreateIndex
CREATE INDEX "group_npis_practice_group_id_idx" ON "group_npis"("practice_group_id");

-- CreateIndex
CREATE INDEX "deals_practice_id_idx" ON "deals"("practice_id");

-- CreateIndex
CREATE INDEX "deals_company_id_idx" ON "deals"("company_id");

-- CreateIndex
CREATE INDEX "deals_primary_contact_id_idx" ON "deals"("primary_contact_id");

-- CreateIndex
CREATE INDEX "agreements_practice_id_idx" ON "agreements"("practice_id");

-- CreateIndex
CREATE INDEX "agreements_deal_id_idx" ON "agreements"("deal_id");

-- CreateIndex
CREATE UNIQUE INDEX "docuseal_submissions_docuseal_submission_id_key" ON "docuseal_submissions"("docuseal_submission_id");

-- CreateIndex
CREATE INDEX "docuseal_submissions_agreement_id_idx" ON "docuseal_submissions"("agreement_id");

-- CreateIndex
CREATE INDEX "docuseal_submissions_person_id_idx" ON "docuseal_submissions"("person_id");

-- CreateIndex
CREATE INDEX "docu_signers_submission_id_idx" ON "docu_signers"("submission_id");

-- CreateIndex
CREATE INDEX "docu_signers_signer_uuid_idx" ON "docu_signers"("signer_uuid");

-- CreateIndex
CREATE INDEX "services_stripe_connected_account_id_idx" ON "services"("stripe_connected_account_id");

-- CreateIndex
CREATE INDEX "services_vendor_id_idx" ON "services"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "invoices_practice_id_idx" ON "invoices"("practice_id");

-- CreateIndex
CREATE INDEX "invoices_agreement_id_idx" ON "invoices"("agreement_id");

-- CreateIndex
CREATE INDEX "invoice_line_items_invoice_id_idx" ON "invoice_line_items"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_line_items_service_id_idx" ON "invoice_line_items"("service_id");

-- CreateIndex
CREATE INDEX "invoice_line_items_billing_run_item_id_idx" ON "invoice_line_items"("billing_run_item_id");

-- CreateIndex
CREATE INDEX "invoice_line_items_billing_run_item_component_id_idx" ON "invoice_line_items"("billing_run_item_component_id");

-- CreateIndex
CREATE INDEX "invoice_line_items_agreement_service_term_id_idx" ON "invoice_line_items"("agreement_service_term_id");

-- CreateIndex
CREATE INDEX "invoice_line_items_stripe_connected_account_id_idx" ON "invoice_line_items"("stripe_connected_account_id");

-- CreateIndex
CREATE INDEX "invoice_connected_account_transfers_invoice_id_idx" ON "invoice_connected_account_transfers"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_connected_account_transfers_stripe_connected_accoun_idx" ON "invoice_connected_account_transfers"("stripe_connected_account_id");

-- CreateIndex
CREATE INDEX "invoice_connected_account_transfers_status_idx" ON "invoice_connected_account_transfers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_connected_account_transfers_invoice_id_stripe_conne_key" ON "invoice_connected_account_transfers"("invoice_id", "stripe_connected_account_id");

-- CreateIndex
CREATE INDEX "purchase_orders_vendor_id_idx" ON "purchase_orders"("vendor_id");

-- CreateIndex
CREATE INDEX "purchase_orders_invoice_id_idx" ON "purchase_orders"("invoice_id");

-- CreateIndex
CREATE INDEX "purchase_orders_vendor_payable_id_idx" ON "purchase_orders"("vendor_payable_id");

-- CreateIndex
CREATE INDEX "agreement_versions_agreement_id_idx" ON "agreement_versions"("agreement_id");

-- CreateIndex
CREATE UNIQUE INDEX "agreement_versions_agreement_id_version_number_key" ON "agreement_versions"("agreement_id", "version_number");

-- CreateIndex
CREATE INDEX "agreement_service_terms_agreement_id_idx" ON "agreement_service_terms"("agreement_id");

-- CreateIndex
CREATE INDEX "agreement_service_terms_agreement_version_id_idx" ON "agreement_service_terms"("agreement_version_id");

-- CreateIndex
CREATE INDEX "agreement_service_terms_service_id_idx" ON "agreement_service_terms"("service_id");

-- CreateIndex
CREATE INDEX "agreement_service_terms_vendor_id_idx" ON "agreement_service_terms"("vendor_id");

-- CreateIndex
CREATE INDEX "agreement_service_terms_effective_date_end_date_idx" ON "agreement_service_terms"("effective_date", "end_date");

-- CreateIndex
CREATE INDEX "billing_runs_practice_id_idx" ON "billing_runs"("practice_id");

-- CreateIndex
CREATE INDEX "billing_runs_approved_by_user_id_idx" ON "billing_runs"("approved_by_user_id");

-- CreateIndex
CREATE INDEX "billing_runs_period_start_period_end_idx" ON "billing_runs"("period_start", "period_end");

-- CreateIndex
CREATE INDEX "billing_input_snapshots_billing_run_id_idx" ON "billing_input_snapshots"("billing_run_id");

-- CreateIndex
CREATE INDEX "billing_input_snapshots_practice_id_idx" ON "billing_input_snapshots"("practice_id");

-- CreateIndex
CREATE INDEX "billing_input_snapshots_service_id_idx" ON "billing_input_snapshots"("service_id");

-- CreateIndex
CREATE INDEX "billing_input_snapshots_metric_key_idx" ON "billing_input_snapshots"("metric_key");

-- CreateIndex
CREATE INDEX "billing_run_items_billing_run_id_idx" ON "billing_run_items"("billing_run_id");

-- CreateIndex
CREATE INDEX "billing_run_items_practice_id_idx" ON "billing_run_items"("practice_id");

-- CreateIndex
CREATE INDEX "billing_run_items_service_id_idx" ON "billing_run_items"("service_id");

-- CreateIndex
CREATE INDEX "billing_run_items_vendor_id_idx" ON "billing_run_items"("vendor_id");

-- CreateIndex
CREATE INDEX "billing_run_items_agreement_service_term_id_idx" ON "billing_run_items"("agreement_service_term_id");

-- CreateIndex
CREATE INDEX "billing_run_item_components_billing_run_item_id_idx" ON "billing_run_item_components"("billing_run_item_id");

-- CreateIndex
CREATE INDEX "billing_run_item_components_component_type_idx" ON "billing_run_item_components"("component_type");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_payables_payable_number_key" ON "vendor_payables"("payable_number");

-- CreateIndex
CREATE INDEX "vendor_payables_practice_id_idx" ON "vendor_payables"("practice_id");

-- CreateIndex
CREATE INDEX "vendor_payables_vendor_id_idx" ON "vendor_payables"("vendor_id");

-- CreateIndex
CREATE INDEX "vendor_payables_invoice_id_idx" ON "vendor_payables"("invoice_id");

-- CreateIndex
CREATE INDEX "vendor_payables_billing_run_id_idx" ON "vendor_payables"("billing_run_id");

-- CreateIndex
CREATE INDEX "vendor_payable_line_items_vendor_payable_id_idx" ON "vendor_payable_line_items"("vendor_payable_id");

-- CreateIndex
CREATE INDEX "vendor_payable_line_items_service_id_idx" ON "vendor_payable_line_items"("service_id");

-- CreateIndex
CREATE INDEX "vendor_payable_line_items_billing_run_item_id_idx" ON "vendor_payable_line_items"("billing_run_item_id");

-- CreateIndex
CREATE INDEX "vendor_payable_line_items_billing_run_item_component_id_idx" ON "vendor_payable_line_items"("billing_run_item_component_id");

-- CreateIndex
CREATE INDEX "approval_decisions_entity_type_entity_id_idx" ON "approval_decisions"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "approval_decisions_decided_by_user_id_idx" ON "approval_decisions"("decided_by_user_id");

-- CreateIndex
CREATE INDEX "exception_events_entity_type_entity_id_idx" ON "exception_events"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "exception_events_resolved_by_user_id_idx" ON "exception_events"("resolved_by_user_id");

-- CreateIndex
CREATE INDEX "exception_events_status_idx" ON "exception_events"("status");

-- CreateIndex
CREATE INDEX "external_sync_jobs_system_entity_type_entity_id_idx" ON "external_sync_jobs"("system", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "external_sync_jobs_status_idx" ON "external_sync_jobs"("status");

-- CreateIndex
CREATE INDEX "external_sync_attempts_external_sync_job_id_idx" ON "external_sync_attempts"("external_sync_job_id");

-- CreateIndex
CREATE INDEX "external_sync_attempts_status_idx" ON "external_sync_attempts"("status");

-- CreateIndex
CREATE INDEX "payments_practice_id_idx" ON "payments"("practice_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payment_allocations_payment_id_idx" ON "payment_allocations"("payment_id");

-- CreateIndex
CREATE INDEX "payment_allocations_invoice_id_idx" ON "payment_allocations"("invoice_id");

-- CreateIndex
CREATE INDEX "audits_practice_id_idx" ON "audits"("practice_id");

-- CreateIndex
CREATE INDEX "audits_deal_id_idx" ON "audits"("deal_id");

-- CreateIndex
CREATE INDEX "assessments_practice_id_idx" ON "assessments"("practice_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboardings_practice_id_key" ON "onboardings"("practice_id");

-- CreateIndex
CREATE INDEX "onboardings_person_id_idx" ON "onboardings"("person_id");

-- CreateIndex
CREATE INDEX "onboarding_contacts_onboarding_id_idx" ON "onboarding_contacts"("onboarding_id");

-- CreateIndex
CREATE INDEX "onboarding_practices_onboarding_id_idx" ON "onboarding_practices"("onboarding_id");

-- CreateIndex
CREATE INDEX "onboarding_locations_onboarding_practice_id_idx" ON "onboarding_locations"("onboarding_practice_id");

-- CreateIndex
CREATE INDEX "onboarding_providers_onboarding_practice_id_idx" ON "onboarding_providers"("onboarding_practice_id");

-- CreateIndex
CREATE INDEX "onboarding_documents_onboarding_id_idx" ON "onboarding_documents"("onboarding_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_billing_onboarding_id_key" ON "onboarding_billing"("onboarding_id");

-- CreateIndex
CREATE INDEX "onboarding_billing_onboarding_id_idx" ON "onboarding_billing"("onboarding_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_credentialing_onboarding_id_key" ON "onboarding_credentialing"("onboarding_id");

-- CreateIndex
CREATE INDEX "onboarding_credentialing_onboarding_id_idx" ON "onboarding_credentialing"("onboarding_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_technology_onboarding_id_key" ON "onboarding_technology"("onboarding_id");

-- CreateIndex
CREATE INDEX "onboarding_technology_onboarding_id_idx" ON "onboarding_technology"("onboarding_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_outreach_onboarding_id_key" ON "onboarding_outreach"("onboarding_id");

-- CreateIndex
CREATE INDEX "onboarding_outreach_onboarding_id_idx" ON "onboarding_outreach"("onboarding_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_lab_pharmacy_onboarding_id_key" ON "onboarding_lab_pharmacy"("onboarding_id");

-- CreateIndex
CREATE INDEX "onboarding_lab_pharmacy_onboarding_id_idx" ON "onboarding_lab_pharmacy"("onboarding_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_compliance_onboarding_id_key" ON "onboarding_compliance"("onboarding_id");

-- CreateIndex
CREATE INDEX "onboarding_compliance_onboarding_id_idx" ON "onboarding_compliance"("onboarding_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_care_program_onboarding_id_key" ON "onboarding_care_program"("onboarding_id");

-- CreateIndex
CREATE INDEX "onboarding_care_program_onboarding_id_idx" ON "onboarding_care_program"("onboarding_id");

-- CreateIndex
CREATE INDEX "stripe_event_logs_stripe_event_id_idx" ON "stripe_event_logs"("stripe_event_id");

-- CreateIndex
CREATE INDEX "stripe_event_logs_invoice_id_idx" ON "stripe_event_logs"("invoice_id");

-- CreateIndex
CREATE INDEX "stripe_event_logs_event_type_idx" ON "stripe_event_logs"("event_type");

-- CreateIndex
CREATE INDEX "journal_entry_links_source_entity_type_source_entity_id_idx" ON "journal_entry_links"("source_entity_type", "source_entity_id");

-- CreateIndex
CREATE INDEX "channel_partners_agreement_id_idx" ON "channel_partners"("agreement_id");

-- CreateIndex
CREATE INDEX "deal_selected_services_deal_id_idx" ON "deal_selected_services"("deal_id");

-- CreateIndex
CREATE INDEX "deal_selected_services_service_id_idx" ON "deal_selected_services"("service_id");

-- CreateIndex
CREATE UNIQUE INDEX "deal_selected_services_deal_id_service_id_key" ON "deal_selected_services"("deal_id", "service_id");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_reports_service_id_key" ON "monthly_reports"("service_id");

-- CreateIndex
CREATE INDEX "monthly_reports_practice_id_idx" ON "monthly_reports"("practice_id");

-- CreateIndex
CREATE INDEX "monthly_reports_service_id_idx" ON "monthly_reports"("service_id");

-- CreateIndex
CREATE INDEX "monthly_reports_status_idx" ON "monthly_reports"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingMarketing_onboarding_id_key" ON "OnboardingMarketing"("onboarding_id");

-- CreateIndex
CREATE INDEX "OnboardingMarketing_onboarding_id_idx" ON "OnboardingMarketing"("onboarding_id");

-- CreateIndex
CREATE UNIQUE INDEX "credentialing_requests_credentialing_id_key" ON "credentialing_requests"("credentialing_id");

-- CreateIndex
CREATE INDEX "credentialing_requests_practice_id_idx" ON "credentialing_requests"("practice_id");

-- CreateIndex
CREATE INDEX "credentialing_requests_provider_id_idx" ON "credentialing_requests"("provider_id");

-- CreateIndex
CREATE INDEX "credentialing_requests_assigned_to_user_id_idx" ON "credentialing_requests"("assigned_to_user_id");

-- CreateIndex
CREATE INDEX "credentialing_requests_status_idx" ON "credentialing_requests"("status");

-- CreateIndex
CREATE INDEX "credentialing_requests_insurance_payer_name_idx" ON "credentialing_requests"("insurance_payer_name");

-- CreateIndex
CREATE INDEX "credentialing_requests_next_follow_up_date_idx" ON "credentialing_requests"("next_follow_up_date");

-- CreateIndex
CREATE INDEX "credentialing_requests_re_credentialing_due_date_idx" ON "credentialing_requests"("re_credentialing_due_date");

-- CreateIndex
CREATE INDEX "credentialing_requests_updated_at_idx" ON "credentialing_requests"("updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "credentialing_requests_practice_id_provider_id_insurance_pa_key" ON "credentialing_requests"("practice_id", "provider_id", "insurance_payer_name");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_carriers_carrier_code_key" ON "insurance_carriers"("carrier_code");

-- CreateIndex
CREATE INDEX "insurance_carriers_carrier_name_idx" ON "insurance_carriers"("carrier_name");

-- CreateIndex
CREATE INDEX "insurance_carriers_carrier_type_idx" ON "insurance_carriers"("carrier_type");

-- CreateIndex
CREATE INDEX "insurance_carriers_status_idx" ON "insurance_carriers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_plans_plan_code_key" ON "insurance_plans"("plan_code");

-- CreateIndex
CREATE INDEX "insurance_plans_carrier_id_idx" ON "insurance_plans"("carrier_id");

-- CreateIndex
CREATE INDEX "insurance_plans_plan_name_idx" ON "insurance_plans"("plan_name");

-- CreateIndex
CREATE INDEX "insurance_plans_status_idx" ON "insurance_plans"("status");

-- CreateIndex
CREATE INDEX "credentialing_follow_up_logs_credentialing_request_id_idx" ON "credentialing_follow_up_logs"("credentialing_request_id");

-- CreateIndex
CREATE INDEX "credentialing_follow_up_logs_date_time_idx" ON "credentialing_follow_up_logs"("date_time");

-- CreateIndex
CREATE INDEX "credentialing_follow_up_logs_logged_by_user_id_idx" ON "credentialing_follow_up_logs"("logged_by_user_id");

-- CreateIndex
CREATE INDEX "credentialing_documents_credentialing_request_id_idx" ON "credentialing_documents"("credentialing_request_id");

-- CreateIndex
CREATE INDEX "credentialing_documents_document_type_idx" ON "credentialing_documents"("document_type");

-- CreateIndex
CREATE INDEX "credentialing_documents_expiry_date_idx" ON "credentialing_documents"("expiry_date");

-- CreateIndex
CREATE INDEX "credentialing_documents_uploaded_by_user_id_idx" ON "credentialing_documents"("uploaded_by_user_id");

-- CreateIndex
CREATE INDEX "credentialing_activity_logs_credentialing_request_id_idx" ON "credentialing_activity_logs"("credentialing_request_id");

-- CreateIndex
CREATE INDEX "credentialing_activity_logs_activity_type_idx" ON "credentialing_activity_logs"("activity_type");

-- CreateIndex
CREATE INDEX "credentialing_activity_logs_created_by_user_id_idx" ON "credentialing_activity_logs"("created_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "mercury_transactions_mercury_transaction_id_key" ON "mercury_transactions"("mercury_transaction_id");

-- CreateIndex
CREATE INDEX "mercury_transactions_account_id_idx" ON "mercury_transactions"("account_id");

-- CreateIndex
CREATE INDEX "mercury_transactions_status_idx" ON "mercury_transactions"("status");

-- CreateIndex
CREATE INDEX "mercury_transactions_reconciliation_status_idx" ON "mercury_transactions"("reconciliation_status");

-- CreateIndex
CREATE INDEX "mercury_transactions_posted_at_idx" ON "mercury_transactions"("posted_at");

-- CreateIndex
CREATE INDEX "_PracticeGroupNpis_B_index" ON "_PracticeGroupNpis"("B");

-- CreateIndex
CREATE INDEX "_AgreementToService_B_index" ON "_AgreementToService"("B");

-- AddForeignKey
ALTER TABLE "quickbooks_connections" ADD CONSTRAINT "quickbooks_connections_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quickbooks_connections" ADD CONSTRAINT "quickbooks_connections_connected_by_user_id_fkey" FOREIGN KEY ("connected_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_groups" ADD CONSTRAINT "practice_groups_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_groups" ADD CONSTRAINT "practice_groups_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "practice_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practices" ADD CONSTRAINT "practices_bill_to_tax_id_id_fkey" FOREIGN KEY ("bill_to_tax_id_id") REFERENCES "tax_ids"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practices" ADD CONSTRAINT "practices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practices" ADD CONSTRAINT "practices_practice_group_id_fkey" FOREIGN KEY ("practice_group_id") REFERENCES "practice_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practices" ADD CONSTRAINT "practices_tax_id_id_fkey" FOREIGN KEY ("tax_id_id") REFERENCES "tax_ids"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_ids" ADD CONSTRAINT "tax_ids_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_persons" ADD CONSTRAINT "practice_persons_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_persons" ADD CONSTRAINT "practice_persons_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_persons" ADD CONSTRAINT "company_persons_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_persons" ADD CONSTRAINT "company_persons_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_npis" ADD CONSTRAINT "group_npis_practice_group_id_fkey" FOREIGN KEY ("practice_group_id") REFERENCES "practice_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_npis" ADD CONSTRAINT "group_npis_tax_id_fkey" FOREIGN KEY ("tax_id") REFERENCES "tax_ids"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_primary_contact_id_fkey" FOREIGN KEY ("primary_contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docuseal_submissions" ADD CONSTRAINT "docuseal_submissions_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docuseal_submissions" ADD CONSTRAINT "docuseal_submissions_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docu_signers" ADD CONSTRAINT "docu_signers_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "docuseal_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_agreement_service_term_id_fkey" FOREIGN KEY ("agreement_service_term_id") REFERENCES "agreement_service_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_billing_run_item_component_id_fkey" FOREIGN KEY ("billing_run_item_component_id") REFERENCES "billing_run_item_components"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_billing_run_item_id_fkey" FOREIGN KEY ("billing_run_item_id") REFERENCES "billing_run_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_connected_account_transfers" ADD CONSTRAINT "invoice_connected_account_transfers_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendor_payable_id_fkey" FOREIGN KEY ("vendor_payable_id") REFERENCES "vendor_payables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreement_versions" ADD CONSTRAINT "agreement_versions_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreement_service_terms" ADD CONSTRAINT "agreement_service_terms_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreement_service_terms" ADD CONSTRAINT "agreement_service_terms_agreement_version_id_fkey" FOREIGN KEY ("agreement_version_id") REFERENCES "agreement_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreement_service_terms" ADD CONSTRAINT "agreement_service_terms_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreement_service_terms" ADD CONSTRAINT "agreement_service_terms_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_runs" ADD CONSTRAINT "billing_runs_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_runs" ADD CONSTRAINT "billing_runs_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_input_snapshots" ADD CONSTRAINT "billing_input_snapshots_billing_run_id_fkey" FOREIGN KEY ("billing_run_id") REFERENCES "billing_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_input_snapshots" ADD CONSTRAINT "billing_input_snapshots_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_input_snapshots" ADD CONSTRAINT "billing_input_snapshots_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_run_items" ADD CONSTRAINT "billing_run_items_agreement_service_term_id_fkey" FOREIGN KEY ("agreement_service_term_id") REFERENCES "agreement_service_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_run_items" ADD CONSTRAINT "billing_run_items_billing_run_id_fkey" FOREIGN KEY ("billing_run_id") REFERENCES "billing_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_run_items" ADD CONSTRAINT "billing_run_items_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_run_items" ADD CONSTRAINT "billing_run_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_run_items" ADD CONSTRAINT "billing_run_items_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_run_item_components" ADD CONSTRAINT "billing_run_item_components_billing_run_item_id_fkey" FOREIGN KEY ("billing_run_item_id") REFERENCES "billing_run_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payables" ADD CONSTRAINT "vendor_payables_billing_run_id_fkey" FOREIGN KEY ("billing_run_id") REFERENCES "billing_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payables" ADD CONSTRAINT "vendor_payables_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payables" ADD CONSTRAINT "vendor_payables_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payables" ADD CONSTRAINT "vendor_payables_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payable_line_items" ADD CONSTRAINT "vendor_payable_line_items_billing_run_item_component_id_fkey" FOREIGN KEY ("billing_run_item_component_id") REFERENCES "billing_run_item_components"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payable_line_items" ADD CONSTRAINT "vendor_payable_line_items_billing_run_item_id_fkey" FOREIGN KEY ("billing_run_item_id") REFERENCES "billing_run_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payable_line_items" ADD CONSTRAINT "vendor_payable_line_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payable_line_items" ADD CONSTRAINT "vendor_payable_line_items_vendor_payable_id_fkey" FOREIGN KEY ("vendor_payable_id") REFERENCES "vendor_payables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exception_events" ADD CONSTRAINT "exception_events_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_sync_attempts" ADD CONSTRAINT "external_sync_attempts_external_sync_job_id_fkey" FOREIGN KEY ("external_sync_job_id") REFERENCES "external_sync_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audits" ADD CONSTRAINT "audits_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audits" ADD CONSTRAINT "audits_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboardings" ADD CONSTRAINT "onboardings_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboardings" ADD CONSTRAINT "onboardings_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_contacts" ADD CONSTRAINT "onboarding_contacts_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_practices" ADD CONSTRAINT "onboarding_practices_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_locations" ADD CONSTRAINT "onboarding_locations_onboarding_practice_id_fkey" FOREIGN KEY ("onboarding_practice_id") REFERENCES "onboarding_practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_providers" ADD CONSTRAINT "onboarding_providers_onboarding_practice_id_fkey" FOREIGN KEY ("onboarding_practice_id") REFERENCES "onboarding_practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_documents" ADD CONSTRAINT "onboarding_documents_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_billing" ADD CONSTRAINT "onboarding_billing_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_credentialing" ADD CONSTRAINT "onboarding_credentialing_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_technology" ADD CONSTRAINT "onboarding_technology_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_outreach" ADD CONSTRAINT "onboarding_outreach_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_lab_pharmacy" ADD CONSTRAINT "onboarding_lab_pharmacy_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_compliance" ADD CONSTRAINT "onboarding_compliance_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_care_program" ADD CONSTRAINT "onboarding_care_program_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stripe_event_logs" ADD CONSTRAINT "stripe_event_logs_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_partners" ADD CONSTRAINT "channel_partners_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_selected_services" ADD CONSTRAINT "deal_selected_services_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_selected_services" ADD CONSTRAINT "deal_selected_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_reports" ADD CONSTRAINT "monthly_reports_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_reports" ADD CONSTRAINT "monthly_reports_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingMarketing" ADD CONSTRAINT "OnboardingMarketing_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentialing_requests" ADD CONSTRAINT "credentialing_requests_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentialing_requests" ADD CONSTRAINT "credentialing_requests_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentialing_requests" ADD CONSTRAINT "credentialing_requests_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentialing_requests" ADD CONSTRAINT "credentialing_requests_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentialing_requests" ADD CONSTRAINT "credentialing_requests_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_plans" ADD CONSTRAINT "insurance_plans_carrier_id_fkey" FOREIGN KEY ("carrier_id") REFERENCES "insurance_carriers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentialing_follow_up_logs" ADD CONSTRAINT "credentialing_follow_up_logs_credentialing_request_id_fkey" FOREIGN KEY ("credentialing_request_id") REFERENCES "credentialing_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentialing_follow_up_logs" ADD CONSTRAINT "credentialing_follow_up_logs_logged_by_user_id_fkey" FOREIGN KEY ("logged_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentialing_documents" ADD CONSTRAINT "credentialing_documents_credentialing_request_id_fkey" FOREIGN KEY ("credentialing_request_id") REFERENCES "credentialing_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentialing_documents" ADD CONSTRAINT "credentialing_documents_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentialing_activity_logs" ADD CONSTRAINT "credentialing_activity_logs_credentialing_request_id_fkey" FOREIGN KEY ("credentialing_request_id") REFERENCES "credentialing_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentialing_activity_logs" ADD CONSTRAINT "credentialing_activity_logs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PracticeGroupNpis" ADD CONSTRAINT "_PracticeGroupNpis_A_fkey" FOREIGN KEY ("A") REFERENCES "group_npis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PracticeGroupNpis" ADD CONSTRAINT "_PracticeGroupNpis_B_fkey" FOREIGN KEY ("B") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AgreementToService" ADD CONSTRAINT "_AgreementToService_A_fkey" FOREIGN KEY ("A") REFERENCES "agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AgreementToService" ADD CONSTRAINT "_AgreementToService_B_fkey" FOREIGN KEY ("B") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

