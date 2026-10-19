-- CreateEnum
CREATE TYPE "FormStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED');
CREATE TYPE "FormResponseMode" AS ENUM ('IDENTIFIED', 'ANONYMOUS');
CREATE TYPE "FormDisplayMode" AS ENUM ('SINGLE_PAGE', 'MULTI_PAGE');
CREATE TYPE "FormQuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'DROPDOWN', 'SHORT_TEXT', 'LONG_TEXT', 'RATING', 'DATE', 'NUMBER', 'PRICE', 'FEES', 'YES_NO', 'IMAGE_UPLOAD', 'IMAGE_CHOICE', 'EMAIL', 'PHONE', 'CONTENT');
CREATE TYPE "FormRecipientSource" AS ENUM ('PRACTICE', 'PERSON', 'PRACTICE_EMAIL', 'NEW_EMAIL');
CREATE TYPE "FormRecipientStatus" AS ENUM ('PENDING', 'NOT_OPENED', 'IN_PROGRESS', 'COMPLETED', 'BOUNCED', 'FAILED', 'EXPIRED', 'REMOVED');
CREATE TYPE "FormDeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED');
CREATE TYPE "FormResponseStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED');
CREATE TYPE "FormTemplateVisibility" AS ENUM ('PRIVATE', 'SHARED');
CREATE TYPE "FormEmailKind" AS ENUM ('INVITE', 'REMINDER', 'TEST', 'CREATOR_NOTICE');
CREATE TYPE "FormExportStatus" AS ENUM ('PENDING', 'READY', 'FAILED', 'EXPIRED');
CREATE TYPE "FormExportFormat" AS ENUM ('CSV', 'XLSX', 'PDF');

-- CreateTable
CREATE TABLE "forms" (
    "id" UUID NOT NULL,
    "ref_code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "status" "FormStatus" NOT NULL DEFAULT 'DRAFT',
    "owner_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL DEFAULT 1,
    "parent_form_id" UUID,
    "template_id" UUID,
    "template_version_no" INTEGER,
    "response_mode" "FormResponseMode" NOT NULL DEFAULT 'IDENTIFIED',
    "record_practice_when_anonymous" BOOLEAN NOT NULL DEFAULT true,
    "min_group_size" INTEGER NOT NULL DEFAULT 3,
    "allow_multiple_responses" BOOLEAN NOT NULL DEFAULT false,
    "allow_edit_until_close" BOOLEAN NOT NULL DEFAULT false,
    "display_mode" "FormDisplayMode" NOT NULL DEFAULT 'SINGLE_PAGE',
    "show_progress_bar" BOOLEAN NOT NULL DEFAULT true,
    "show_question_numbers" BOOLEAN NOT NULL DEFAULT true,
    "allow_save_resume" BOOLEAN NOT NULL DEFAULT true,
    "confirmation_message" TEXT,
    "redirect_url" TEXT,
    "privacy_notice" TEXT,
    "send_receipt" BOOLEAN NOT NULL DEFAULT false,
    "send_at" TIMESTAMP(3),
    "close_at" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "invites_dispatched_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "public_link_enabled" BOOLEAN NOT NULL DEFAULT false,
    "public_link_token_hash" TEXT,
    "public_link_token_encrypted" TEXT,
    "invite_subject" TEXT NOT NULL DEFAULT 'Please complete {{form_title}}',
    "invite_body" TEXT NOT NULL DEFAULT '',
    "sender_name" TEXT,
    "reply_to" TEXT,
    "email_batch_size" INTEGER NOT NULL DEFAULT 100,
    "published_snapshot" JSONB,
    "lock_version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "forms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "form_sections" (
    "id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order_index" INTEGER NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "form_sections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "form_questions" (
    "id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "type" "FormQuestionType" NOT NULL,
    "label" TEXT NOT NULL,
    "help_text" TEXT,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "order_index" INTEGER NOT NULL,
    "config_json" JSONB NOT NULL DEFAULT '{}',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "form_questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "form_question_options" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "image_ref" TEXT,
    "is_other" BOOLEAN NOT NULL DEFAULT false,
    "order_index" INTEGER NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "form_question_options_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "form_logic_rules" (
    "id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "match_type" TEXT NOT NULL DEFAULT 'all',
    "skip_to_section_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "form_logic_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "form_logic_conditions" (
    "id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "source_question_id" UUID NOT NULL,
    "operator" TEXT NOT NULL,
    "value_json" JSONB NOT NULL DEFAULT 'null',
    "order_index" INTEGER NOT NULL,
    CONSTRAINT "form_logic_conditions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "form_recipients" (
    "id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "source_type" "FormRecipientSource" NOT NULL,
    "practice_id" UUID,
    "person_id" UUID,
    "email" TEXT NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "display_name" TEXT,
    "practice_name" TEXT,
    "token_hash" TEXT NOT NULL,
    "token_encrypted" TEXT NOT NULL,
    "status" "FormRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "delivery_status" "FormDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "sent_at" TIMESTAMP(3),
    "opened_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "reminder_count" INTEGER NOT NULL DEFAULT 0,
    "last_reminder_at" TIMESTAMP(3),
    "removed_at" TIMESTAMP(3),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3),
    "last_error" TEXT,
    "wave" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "form_recipients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "form_responses" (
    "id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "form_version_no" INTEGER NOT NULL,
    "recipient_id" UUID,
    "practice_id" UUID,
    "status" "FormResponseStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "submission_slot" TEXT NOT NULL DEFAULT 'single',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "idempotency_key" TEXT NOT NULL,
    "ip_hash" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "form_responses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "form_response_answers" (
    "id" UUID NOT NULL,
    "response_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "value_text" TEXT,
    "value_number" DECIMAL(18,4),
    "value_date" TIMESTAMP(3),
    "value_json" JSONB,
    "file_refs" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "form_response_answers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "form_reminder_settings" (
    "id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "first_after_days" INTEGER NOT NULL DEFAULT 3,
    "repeat_every_days" INTEGER NOT NULL DEFAULT 3,
    "max_count" INTEGER NOT NULL DEFAULT 2,
    "final_before_close_days" INTEGER,
    "subject" TEXT NOT NULL DEFAULT 'Reminder: {{form_title}}',
    "body" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "form_reminder_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "form_email_logs" (
    "id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "recipient_id" UUID,
    "kind" "FormEmailKind" NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "provider_message_id" TEXT,
    "error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "form_email_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "form_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'General',
    "visibility" "FormTemplateVisibility" NOT NULL DEFAULT 'PRIVATE',
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "owner_id" UUID,
    "version_no" INTEGER NOT NULL DEFAULT 1,
    "content_json" JSONB NOT NULL,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMP(3),
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "form_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "form_activity_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "form_id" UUID,
    "summary" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "form_activity_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "form_exports" (
    "id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "format" "FormExportFormat" NOT NULL,
    "status" "FormExportStatus" NOT NULL DEFAULT 'PENDING',
    "filters" JSONB,
    "file_name" TEXT,
    "blob_url" TEXT,
    "local_path" TEXT,
    "error" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "form_exports_pkey" PRIMARY KEY ("id")
);

-- Indexes and uniques
CREATE UNIQUE INDEX "forms_ref_code_key" ON "forms"("ref_code");
CREATE UNIQUE INDEX "forms_public_link_token_hash_key" ON "forms"("public_link_token_hash");
CREATE INDEX "forms_owner_id_idx" ON "forms"("owner_id");
CREATE INDEX "forms_status_idx" ON "forms"("status");
CREATE INDEX "forms_parent_form_id_idx" ON "forms"("parent_form_id");
CREATE INDEX "forms_template_id_idx" ON "forms"("template_id");
CREATE INDEX "forms_send_at_idx" ON "forms"("send_at");
CREATE INDEX "forms_close_at_idx" ON "forms"("close_at");
CREATE INDEX "forms_deleted_at_idx" ON "forms"("deleted_at");

CREATE INDEX "form_sections_form_id_idx" ON "form_sections"("form_id");
CREATE UNIQUE INDEX "form_questions_form_id_key_key" ON "form_questions"("form_id", "key");
CREATE INDEX "form_questions_form_id_idx" ON "form_questions"("form_id");
CREATE INDEX "form_questions_section_id_idx" ON "form_questions"("section_id");
CREATE INDEX "form_question_options_question_id_idx" ON "form_question_options"("question_id");
CREATE UNIQUE INDEX "form_logic_rules_form_id_target_type_target_id_key" ON "form_logic_rules"("form_id", "target_type", "target_id");
CREATE INDEX "form_logic_rules_form_id_idx" ON "form_logic_rules"("form_id");
CREATE INDEX "form_logic_conditions_rule_id_idx" ON "form_logic_conditions"("rule_id");
CREATE INDEX "form_logic_conditions_source_question_id_idx" ON "form_logic_conditions"("source_question_id");
CREATE UNIQUE INDEX "form_recipients_token_hash_key" ON "form_recipients"("token_hash");
CREATE UNIQUE INDEX "form_recipients_form_id_email_normalized_key" ON "form_recipients"("form_id", "email_normalized");
CREATE INDEX "form_recipients_form_id_idx" ON "form_recipients"("form_id");
CREATE INDEX "form_recipients_practice_id_idx" ON "form_recipients"("practice_id");
CREATE INDEX "form_recipients_person_id_idx" ON "form_recipients"("person_id");
CREATE INDEX "form_recipients_status_idx" ON "form_recipients"("status");
CREATE INDEX "form_recipients_token_hash_idx" ON "form_recipients"("token_hash");
CREATE UNIQUE INDEX "form_responses_idempotency_key_key" ON "form_responses"("idempotency_key");
CREATE UNIQUE INDEX "form_responses_form_id_recipient_id_submission_slot_key" ON "form_responses"("form_id", "recipient_id", "submission_slot");
CREATE INDEX "form_responses_form_id_idx" ON "form_responses"("form_id");
CREATE INDEX "form_responses_recipient_id_idx" ON "form_responses"("recipient_id");
CREATE INDEX "form_responses_practice_id_idx" ON "form_responses"("practice_id");
CREATE INDEX "form_responses_submitted_at_idx" ON "form_responses"("submitted_at");
CREATE INDEX "form_responses_status_idx" ON "form_responses"("status");
CREATE UNIQUE INDEX "form_response_answers_response_id_question_id_key" ON "form_response_answers"("response_id", "question_id");
CREATE INDEX "form_response_answers_response_id_idx" ON "form_response_answers"("response_id");
CREATE INDEX "form_response_answers_question_id_idx" ON "form_response_answers"("question_id");
CREATE UNIQUE INDEX "form_reminder_settings_form_id_key" ON "form_reminder_settings"("form_id");
CREATE INDEX "form_email_logs_form_id_idx" ON "form_email_logs"("form_id");
CREATE INDEX "form_email_logs_recipient_id_idx" ON "form_email_logs"("recipient_id");
CREATE INDEX "form_email_logs_kind_idx" ON "form_email_logs"("kind");
CREATE INDEX "form_templates_owner_id_idx" ON "form_templates"("owner_id");
CREATE INDEX "form_templates_visibility_idx" ON "form_templates"("visibility");
CREATE INDEX "form_templates_category_idx" ON "form_templates"("category");
CREATE INDEX "form_activity_logs_form_id_idx" ON "form_activity_logs"("form_id");
CREATE INDEX "form_activity_logs_user_id_idx" ON "form_activity_logs"("user_id");
CREATE INDEX "form_activity_logs_entity_type_entity_id_idx" ON "form_activity_logs"("entity_type", "entity_id");
CREATE INDEX "form_activity_logs_created_at_idx" ON "form_activity_logs"("created_at");
CREATE INDEX "form_exports_form_id_idx" ON "form_exports"("form_id");
CREATE INDEX "form_exports_requested_by_id_idx" ON "form_exports"("requested_by_id");
CREATE INDEX "form_exports_status_idx" ON "form_exports"("status");

-- Foreign keys
ALTER TABLE "forms" ADD CONSTRAINT "forms_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "forms" ADD CONSTRAINT "forms_parent_form_id_fkey" FOREIGN KEY ("parent_form_id") REFERENCES "forms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "forms" ADD CONSTRAINT "forms_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "form_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "form_sections" ADD CONSTRAINT "form_sections_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_questions" ADD CONSTRAINT "form_questions_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_questions" ADD CONSTRAINT "form_questions_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "form_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_question_options" ADD CONSTRAINT "form_question_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "form_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_logic_rules" ADD CONSTRAINT "form_logic_rules_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_logic_conditions" ADD CONSTRAINT "form_logic_conditions_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "form_logic_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_logic_conditions" ADD CONSTRAINT "form_logic_conditions_source_question_id_fkey" FOREIGN KEY ("source_question_id") REFERENCES "form_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_recipients" ADD CONSTRAINT "form_recipients_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_recipients" ADD CONSTRAINT "form_recipients_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "form_recipients" ADD CONSTRAINT "form_recipients_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "form_recipients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "form_response_answers" ADD CONSTRAINT "form_response_answers_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "form_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_response_answers" ADD CONSTRAINT "form_response_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "form_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "form_reminder_settings" ADD CONSTRAINT "form_reminder_settings_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_email_logs" ADD CONSTRAINT "form_email_logs_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_email_logs" ADD CONSTRAINT "form_email_logs_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "form_recipients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "form_templates" ADD CONSTRAINT "form_templates_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "form_activity_logs" ADD CONSTRAINT "form_activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "form_activity_logs" ADD CONSTRAINT "form_activity_logs_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "form_exports" ADD CONSTRAINT "form_exports_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_exports" ADD CONSTRAINT "form_exports_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
