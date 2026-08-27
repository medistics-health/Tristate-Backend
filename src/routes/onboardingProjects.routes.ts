import { Router } from "express";
import { verifyAuthToken, requireRoles, ROLE_GROUPS } from "../middleware/auth.middleware";
import {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
} from "../controllers/onboarding-projects/task.controller";
import {
  getProjects,
  createProject,
  updateProject,
} from "../controllers/onboarding-projects/project.controller";

import {
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from "../controllers/onboarding-projects/template.controller";

import {
  getMilestones,
  createMilestone,
  updateMilestone,
  deleteMilestone,
} from "../controllers/onboarding-projects/milestone.controller";

const onboardingProjectsRouter = Router();

onboardingProjectsRouter.use(verifyAuthToken);

// Project Endpoints
onboardingProjectsRouter.get("/projects", getProjects);
onboardingProjectsRouter.post("/projects", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), createProject);
onboardingProjectsRouter.patch("/projects/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), updateProject);

// Task Endpoints
onboardingProjectsRouter.get("/tasks", getTasks);
onboardingProjectsRouter.post("/tasks", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), createTask);
onboardingProjectsRouter.patch("/tasks/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), updateTask);
onboardingProjectsRouter.delete("/tasks/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), deleteTask);

// Template Endpoints
onboardingProjectsRouter.get("/templates", getTemplates);
onboardingProjectsRouter.post("/templates", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), createTemplate);
onboardingProjectsRouter.patch("/templates/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), updateTemplate);
onboardingProjectsRouter.delete("/templates/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), deleteTemplate);

// Milestone Endpoints
onboardingProjectsRouter.get("/milestones", getMilestones);
onboardingProjectsRouter.post("/milestones", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), createMilestone);
onboardingProjectsRouter.patch("/milestones/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), updateMilestone);
onboardingProjectsRouter.delete("/milestones/:id", requireRoles(ROLE_GROUPS.BUSINESS_WRITE), deleteMilestone);

export default onboardingProjectsRouter;
