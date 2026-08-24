/*
  Warnings:

  - You are about to drop the column `approval_date` on the `credentialing_requests` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "OnboardingProjectStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'AT_RISK', 'BLOCKED', 'COMPLETE');

-- CreateEnum
CREATE TYPE "OnboardingWorkstreamStatus" AS ENUM ('COMPLETE_CONTRACTED', 'WAITING_ON_CLIENT', 'PENDING', 'IN_PROGRESS', 'INTERNAL_ACTION_REQUIRED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "OnboardingTaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETE');

-- CreateEnum
CREATE TYPE "OnboardingTaskPhase" AS ENUM ('ONBOARDING_ACCESS', 'ASSESSMENT_DISCOVERY', 'PLANNING_CONFIGURATION', 'TESTING_VALIDATION', 'GO_LIVE_STABILIZATION');

-- CreateEnum
CREATE TYPE "OnboardingMilestoneStatus" AS ENUM ('NOT_STARTED', 'ON_TRACK', 'AT_RISK', 'COMPLETE');

-- CreateEnum
CREATE TYPE "OnboardingRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "OnboardingRiskRating" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "OnboardingRiskStatus" AS ENUM ('OPEN', 'MITIGATED', 'CLOSED');

-- CreateEnum
CREATE TYPE "OnboardingActionItemStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE');

-- AlterTable
ALTER TABLE "credentialing_requests" DROP COLUMN "approval_date";

-- CreateTable
CREATE TABLE "onboarding_projects" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "status" "OnboardingProjectStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "go_live_target" TIMESTAMP(3),
    "kickoff_date" TIMESTAMP(3),
    "practice_manager_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_workstreams" (
    "id" UUID NOT NULL,
    "onboarding_project_id" UUID NOT NULL,
    "service_line" "OnboardingServiceLine" NOT NULL,
    "status" "OnboardingWorkstreamStatus" NOT NULL DEFAULT 'PENDING',
    "owner_user_id" UUID,
    "kickoff_date" TIMESTAMP(3),
    "target_date" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_workstreams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_tasks" (
    "id" UUID NOT NULL,
    "workstream_id" UUID NOT NULL,
    "task_number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "phase" "OnboardingTaskPhase" NOT NULL,
    "status" "OnboardingTaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "owner_user_id" UUID,
    "start_date" TIMESTAMP(3),
    "due_date" TIMESTAMP(3),
    "deliverable" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_task_dependencies" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "depends_on_task_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_task_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_task_templates" (
    "id" UUID NOT NULL,
    "service_line" "OnboardingServiceLine" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_task_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_task_template_items" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "task_number" INTEGER NOT NULL,
    "task_name" TEXT NOT NULL,
    "phase" "OnboardingTaskPhase" NOT NULL,
    "default_owner_id" UUID,
    "start_offset_days" INTEGER,
    "due_offset_days" INTEGER,
    "deliverable" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_task_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_milestones" (
    "id" UUID NOT NULL,
    "workstream_id" UUID NOT NULL,
    "milestone_code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "target_week" TEXT,
    "target_date" TIMESTAMP(3),
    "status" "OnboardingMilestoneStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_risks" (
    "id" UUID NOT NULL,
    "onboarding_project_id" UUID NOT NULL,
    "workstream_id" UUID,
    "risk_number" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "impact" "OnboardingRiskLevel" NOT NULL,
    "probability" "OnboardingRiskLevel" NOT NULL,
    "rating" "OnboardingRiskRating" NOT NULL,
    "mitigation" TEXT,
    "owner_user_id" UUID,
    "status" "OnboardingRiskStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_risks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_action_items" (
    "id" UUID NOT NULL,
    "onboarding_project_id" UUID NOT NULL,
    "task_id" UUID,
    "note" TEXT NOT NULL,
    "responsible_user_id" UUID,
    "status" "OnboardingActionItemStatus" NOT NULL DEFAULT 'PENDING',
    "logged_by_user_id" UUID NOT NULL,
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_action_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_task_activities" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_task_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "onboarding_projects_practiceId_idx" ON "onboarding_projects"("practiceId");

-- CreateIndex
CREATE INDEX "onboarding_projects_status_idx" ON "onboarding_projects"("status");

-- CreateIndex
CREATE INDEX "onboarding_projects_go_live_target_idx" ON "onboarding_projects"("go_live_target");

-- CreateIndex
CREATE INDEX "onboarding_workstreams_onboarding_project_id_idx" ON "onboarding_workstreams"("onboarding_project_id");

-- CreateIndex
CREATE INDEX "onboarding_workstreams_owner_user_id_idx" ON "onboarding_workstreams"("owner_user_id");

-- CreateIndex
CREATE INDEX "onboarding_workstreams_status_idx" ON "onboarding_workstreams"("status");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_workstreams_onboarding_project_id_service_line_key" ON "onboarding_workstreams"("onboarding_project_id", "service_line");

-- CreateIndex
CREATE INDEX "onboarding_tasks_workstream_id_idx" ON "onboarding_tasks"("workstream_id");

-- CreateIndex
CREATE INDEX "onboarding_tasks_owner_user_id_idx" ON "onboarding_tasks"("owner_user_id");

-- CreateIndex
CREATE INDEX "onboarding_tasks_status_idx" ON "onboarding_tasks"("status");

-- CreateIndex
CREATE INDEX "onboarding_tasks_due_date_idx" ON "onboarding_tasks"("due_date");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_tasks_workstream_id_task_number_key" ON "onboarding_tasks"("workstream_id", "task_number");

-- CreateIndex
CREATE INDEX "onboarding_task_dependencies_task_id_idx" ON "onboarding_task_dependencies"("task_id");

-- CreateIndex
CREATE INDEX "onboarding_task_dependencies_depends_on_task_id_idx" ON "onboarding_task_dependencies"("depends_on_task_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_task_dependencies_task_id_depends_on_task_id_key" ON "onboarding_task_dependencies"("task_id", "depends_on_task_id");

-- CreateIndex
CREATE INDEX "onboarding_task_templates_service_line_idx" ON "onboarding_task_templates"("service_line");

-- CreateIndex
CREATE INDEX "onboarding_task_templates_is_active_idx" ON "onboarding_task_templates"("is_active");

-- CreateIndex
CREATE INDEX "onboarding_task_template_items_template_id_idx" ON "onboarding_task_template_items"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_task_template_items_template_id_task_number_key" ON "onboarding_task_template_items"("template_id", "task_number");

-- CreateIndex
CREATE INDEX "onboarding_milestones_workstream_id_idx" ON "onboarding_milestones"("workstream_id");

-- CreateIndex
CREATE INDEX "onboarding_milestones_target_date_idx" ON "onboarding_milestones"("target_date");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_milestones_workstream_id_milestone_code_key" ON "onboarding_milestones"("workstream_id", "milestone_code");

-- CreateIndex
CREATE INDEX "onboarding_risks_onboarding_project_id_idx" ON "onboarding_risks"("onboarding_project_id");

-- CreateIndex
CREATE INDEX "onboarding_risks_workstream_id_idx" ON "onboarding_risks"("workstream_id");

-- CreateIndex
CREATE INDEX "onboarding_risks_owner_user_id_idx" ON "onboarding_risks"("owner_user_id");

-- CreateIndex
CREATE INDEX "onboarding_risks_status_idx" ON "onboarding_risks"("status");

-- CreateIndex
CREATE INDEX "onboarding_risks_rating_idx" ON "onboarding_risks"("rating");

-- CreateIndex
CREATE INDEX "onboarding_action_items_onboarding_project_id_idx" ON "onboarding_action_items"("onboarding_project_id");

-- CreateIndex
CREATE INDEX "onboarding_action_items_task_id_idx" ON "onboarding_action_items"("task_id");

-- CreateIndex
CREATE INDEX "onboarding_action_items_responsible_user_id_idx" ON "onboarding_action_items"("responsible_user_id");

-- CreateIndex
CREATE INDEX "onboarding_action_items_status_idx" ON "onboarding_action_items"("status");

-- CreateIndex
CREATE INDEX "onboarding_action_items_logged_at_idx" ON "onboarding_action_items"("logged_at");

-- CreateIndex
CREATE INDEX "onboarding_task_activities_task_id_idx" ON "onboarding_task_activities"("task_id");

-- CreateIndex
CREATE INDEX "onboarding_task_activities_user_id_idx" ON "onboarding_task_activities"("user_id");

-- CreateIndex
CREATE INDEX "onboarding_task_activities_created_at_idx" ON "onboarding_task_activities"("created_at");

-- AddForeignKey
ALTER TABLE "onboarding_projects" ADD CONSTRAINT "onboarding_projects_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_projects" ADD CONSTRAINT "onboarding_projects_practice_manager_id_fkey" FOREIGN KEY ("practice_manager_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_workstreams" ADD CONSTRAINT "onboarding_workstreams_onboarding_project_id_fkey" FOREIGN KEY ("onboarding_project_id") REFERENCES "onboarding_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_workstreams" ADD CONSTRAINT "onboarding_workstreams_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_workstream_id_fkey" FOREIGN KEY ("workstream_id") REFERENCES "onboarding_workstreams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_task_dependencies" ADD CONSTRAINT "onboarding_task_dependencies_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "onboarding_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_task_dependencies" ADD CONSTRAINT "onboarding_task_dependencies_depends_on_task_id_fkey" FOREIGN KEY ("depends_on_task_id") REFERENCES "onboarding_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_task_template_items" ADD CONSTRAINT "onboarding_task_template_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "onboarding_task_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_task_template_items" ADD CONSTRAINT "onboarding_task_template_items_default_owner_id_fkey" FOREIGN KEY ("default_owner_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_milestones" ADD CONSTRAINT "onboarding_milestones_workstream_id_fkey" FOREIGN KEY ("workstream_id") REFERENCES "onboarding_workstreams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_risks" ADD CONSTRAINT "onboarding_risks_onboarding_project_id_fkey" FOREIGN KEY ("onboarding_project_id") REFERENCES "onboarding_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_risks" ADD CONSTRAINT "onboarding_risks_workstream_id_fkey" FOREIGN KEY ("workstream_id") REFERENCES "onboarding_workstreams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_risks" ADD CONSTRAINT "onboarding_risks_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_action_items" ADD CONSTRAINT "onboarding_action_items_onboarding_project_id_fkey" FOREIGN KEY ("onboarding_project_id") REFERENCES "onboarding_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_action_items" ADD CONSTRAINT "onboarding_action_items_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "onboarding_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_action_items" ADD CONSTRAINT "onboarding_action_items_responsible_user_id_fkey" FOREIGN KEY ("responsible_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_action_items" ADD CONSTRAINT "onboarding_action_items_logged_by_user_id_fkey" FOREIGN KEY ("logged_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_task_activities" ADD CONSTRAINT "onboarding_task_activities_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "onboarding_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_task_activities" ADD CONSTRAINT "onboarding_task_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
