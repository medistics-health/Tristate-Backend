import { Router } from "express";
import {
  ROLE_GROUPS,
  requireRoles,
  verifyAuthToken,
} from "../middleware/auth.middleware";
import { handleDocumentHubUpload } from "../middleware/documentHubUpload";
import {
  archiveDocument,
  createDocument,
  createDocumentVersion,
  downloadDocument,
  getDocument,
  getDocuments,
  hardDeleteDocument,
  updateDocument,
} from "../controllers/documentHub/document";
import {
  createCategory,
  deleteCategory,
  listCategories,
  mergeCategories,
  updateCategory,
} from "../controllers/documentHub/category";
import { listTags } from "../controllers/documentHub/tag";
import {
  createDocumentPublicLink,
  listDocumentPublicLinks,
  revokePublicLink,
} from "../controllers/documentHub/publicLink";

const documentRouter = Router();
documentRouter.use(verifyAuthToken);
documentRouter.get("/", getDocuments);
documentRouter.post(
  "/",
  requireRoles(ROLE_GROUPS.DOCUMENT_HUB_CONTENT),
  handleDocumentHubUpload,
  createDocument,
);
documentRouter.get("/:id/download", downloadDocument);
documentRouter.get("/:id/public-links", listDocumentPublicLinks);
documentRouter.post(
  "/:id/public-links",
  requireRoles(ROLE_GROUPS.DOCUMENT_HUB_SHARE),
  createDocumentPublicLink,
);
documentRouter.post(
  "/:id/versions",
  requireRoles(ROLE_GROUPS.DOCUMENT_HUB_CONTENT),
  handleDocumentHubUpload,
  createDocumentVersion,
);
documentRouter.delete(
  "/:id/hard",
  requireRoles(ROLE_GROUPS.DOCUMENT_HUB_HARD_DELETE),
  hardDeleteDocument,
);
documentRouter.get("/:id", getDocument);
documentRouter.patch(
  "/:id",
  requireRoles(ROLE_GROUPS.DOCUMENT_HUB_CONTENT),
  updateDocument,
);
documentRouter.delete(
  "/:id",
  requireRoles(ROLE_GROUPS.DOCUMENT_HUB_CONTENT),
  archiveDocument,
);

const documentCategoryRouter = Router();
documentCategoryRouter.use(verifyAuthToken);
documentCategoryRouter.get("/", listCategories);
documentCategoryRouter.post(
  "/",
  requireRoles(ROLE_GROUPS.DOCUMENT_HUB_CONTENT),
  createCategory,
);
documentCategoryRouter.patch(
  "/:id",
  requireRoles(ROLE_GROUPS.DOCUMENT_HUB_CONTENT),
  updateCategory,
);
documentCategoryRouter.delete(
  "/:id",
  requireRoles(ROLE_GROUPS.DOCUMENT_HUB_CONTENT),
  deleteCategory,
);
documentCategoryRouter.post(
  "/:id/merge",
  requireRoles(ROLE_GROUPS.DOCUMENT_HUB_CONTENT),
  mergeCategories,
);

const documentTagRouter = Router();
documentTagRouter.use(verifyAuthToken);
documentTagRouter.get("/", listTags);

const documentPublicLinkRouter = Router();
documentPublicLinkRouter.use(verifyAuthToken);
documentPublicLinkRouter.delete(
  "/:id",
  requireRoles(ROLE_GROUPS.DOCUMENT_HUB_CONTENT),
  revokePublicLink,
);

export {
  documentRouter,
  documentCategoryRouter,
  documentTagRouter,
  documentPublicLinkRouter,
};
