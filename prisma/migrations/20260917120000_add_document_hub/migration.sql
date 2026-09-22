-- AlterEnum
ALTER TYPE "UserRoles" ADD VALUE 'MARKETING';

-- CreateEnum
CREATE TYPE "HubDocumentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "HubDocumentActivityAction" AS ENUM (
  'UPLOAD',
  'DOWNLOAD',
  'METADATA_EDIT',
  'ARCHIVE',
  'RESTORE',
  'DELETE',
  'PUBLIC_LINK_CREATED',
  'PUBLIC_LINK_REVOKED',
  'PUBLIC_VIEW'
);

-- CreateTable
CREATE TABLE "hub_documents" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "file_key" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "checksum_sha256" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "root_document_id" UUID NOT NULL,
    "parent_document_id" UUID,
    "status" "HubDocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_public_shareable" BOOLEAN NOT NULL DEFAULT false,
    "uploaded_by" UUID NOT NULL,
    "download_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hub_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hub_document_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "parent_category_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hub_document_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hub_document_category_links" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,

    CONSTRAINT "hub_document_category_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hub_document_tags" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "hub_document_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hub_document_tag_links" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "hub_document_tag_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hub_document_practices" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,

    CONSTRAINT "hub_document_practices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hub_document_deals" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,

    CONSTRAINT "hub_document_deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hub_document_public_links" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "last_accessed_at" TIMESTAMP(3),
    "allow_download" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "hub_document_public_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hub_document_activity_logs" (
    "id" UUID NOT NULL,
    "document_id" UUID,
    "user_id" UUID,
    "action" "HubDocumentActivityAction" NOT NULL,
    "ip_address" TEXT,
    "details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hub_document_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hub_documents_root_document_id_version_key" ON "hub_documents"("root_document_id", "version");
CREATE INDEX "hub_documents_root_document_id_idx" ON "hub_documents"("root_document_id");
CREATE INDEX "hub_documents_parent_document_id_idx" ON "hub_documents"("parent_document_id");
CREATE INDEX "hub_documents_uploaded_by_idx" ON "hub_documents"("uploaded_by");
CREATE INDEX "hub_documents_status_idx" ON "hub_documents"("status");
CREATE INDEX "hub_documents_created_at_idx" ON "hub_documents"("created_at");
CREATE INDEX "hub_documents_checksum_sha256_idx" ON "hub_documents"("checksum_sha256");
CREATE INDEX "hub_documents_mime_type_idx" ON "hub_documents"("mime_type");

CREATE UNIQUE INDEX "hub_document_categories_name_key" ON "hub_document_categories"("name");
CREATE INDEX "hub_document_categories_parent_category_id_idx" ON "hub_document_categories"("parent_category_id");

CREATE UNIQUE INDEX "hub_document_category_links_document_id_category_id_key" ON "hub_document_category_links"("document_id", "category_id");
CREATE INDEX "hub_document_category_links_document_id_idx" ON "hub_document_category_links"("document_id");
CREATE INDEX "hub_document_category_links_category_id_idx" ON "hub_document_category_links"("category_id");

CREATE UNIQUE INDEX "hub_document_tags_name_key" ON "hub_document_tags"("name");

CREATE UNIQUE INDEX "hub_document_tag_links_document_id_tag_id_key" ON "hub_document_tag_links"("document_id", "tag_id");
CREATE INDEX "hub_document_tag_links_document_id_idx" ON "hub_document_tag_links"("document_id");
CREATE INDEX "hub_document_tag_links_tag_id_idx" ON "hub_document_tag_links"("tag_id");

CREATE UNIQUE INDEX "hub_document_practices_document_id_practice_id_key" ON "hub_document_practices"("document_id", "practice_id");
CREATE INDEX "hub_document_practices_document_id_idx" ON "hub_document_practices"("document_id");
CREATE INDEX "hub_document_practices_practice_id_idx" ON "hub_document_practices"("practice_id");

CREATE UNIQUE INDEX "hub_document_deals_document_id_deal_id_key" ON "hub_document_deals"("document_id", "deal_id");
CREATE INDEX "hub_document_deals_document_id_idx" ON "hub_document_deals"("document_id");
CREATE INDEX "hub_document_deals_deal_id_idx" ON "hub_document_deals"("deal_id");

CREATE UNIQUE INDEX "hub_document_public_links_token_key" ON "hub_document_public_links"("token");
CREATE INDEX "hub_document_public_links_document_id_idx" ON "hub_document_public_links"("document_id");
CREATE INDEX "hub_document_public_links_created_by_idx" ON "hub_document_public_links"("created_by");
CREATE INDEX "hub_document_public_links_token_idx" ON "hub_document_public_links"("token");

CREATE INDEX "hub_document_activity_logs_document_id_idx" ON "hub_document_activity_logs"("document_id");
CREATE INDEX "hub_document_activity_logs_user_id_idx" ON "hub_document_activity_logs"("user_id");
CREATE INDEX "hub_document_activity_logs_action_idx" ON "hub_document_activity_logs"("action");
CREATE INDEX "hub_document_activity_logs_created_at_idx" ON "hub_document_activity_logs"("created_at");

-- AddForeignKey
ALTER TABLE "hub_documents" ADD CONSTRAINT "hub_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hub_documents" ADD CONSTRAINT "hub_documents_parent_document_id_fkey" FOREIGN KEY ("parent_document_id") REFERENCES "hub_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "hub_document_categories" ADD CONSTRAINT "hub_document_categories_parent_category_id_fkey" FOREIGN KEY ("parent_category_id") REFERENCES "hub_document_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "hub_document_category_links" ADD CONSTRAINT "hub_document_category_links_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "hub_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hub_document_category_links" ADD CONSTRAINT "hub_document_category_links_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "hub_document_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hub_document_tag_links" ADD CONSTRAINT "hub_document_tag_links_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "hub_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hub_document_tag_links" ADD CONSTRAINT "hub_document_tag_links_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "hub_document_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hub_document_practices" ADD CONSTRAINT "hub_document_practices_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "hub_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hub_document_practices" ADD CONSTRAINT "hub_document_practices_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hub_document_deals" ADD CONSTRAINT "hub_document_deals_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "hub_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hub_document_deals" ADD CONSTRAINT "hub_document_deals_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hub_document_public_links" ADD CONSTRAINT "hub_document_public_links_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "hub_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hub_document_public_links" ADD CONSTRAINT "hub_document_public_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "hub_document_activity_logs" ADD CONSTRAINT "hub_document_activity_logs_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "hub_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "hub_document_activity_logs" ADD CONSTRAINT "hub_document_activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default categories
INSERT INTO "hub_document_categories" ("id", "name") VALUES
  (gen_random_uuid(), 'Marketing Flyers'),
  (gen_random_uuid(), 'Sales Collateral'),
  (gen_random_uuid(), 'Compliance'),
  (gen_random_uuid(), 'Onboarding Templates');
