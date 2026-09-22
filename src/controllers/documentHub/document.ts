import { Response } from "express";
import {
  HubDocumentActivityAction,
  HubDocumentStatus,
  Prisma,
} from "../../../generated/prisma/client";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { routeParam } from "../../middleware/documentHubUpload";
import { prisma } from "../../lib/prisma";
import {
  archiveHubDocument,
  canSoftDeleteDocument,
  createHubDocument,
  createHubDocumentVersion,
  createDownloadPayload,
  findChecksumDuplicates,
  getRequestIp,
  hardDeleteDocumentFamily,
  hubDocumentInclude,
  isAdminRole,
  isContentManagerRole,
  listLatestDocumentIds,
  logDocumentActivity,
  parseBoolean,
  parseIdList,
  serializeHubDocument,
  updateHubDocumentMetadata,
} from "../../services/documentHub/documentHub.service";

function requireUser(req: AuthenticatedRequest, res: Response) {
  if (!req.user?.sub) {
    res.status(401).json({ message: "Unauthorized." });
    return null;
  }
  return req.user;
}

export async function createDocument(req: AuthenticatedRequest, res: Response) {
  try {
    const user = requireUser(req, res);
    if (!user) {
      return;
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: "A file is required." });
    }

    const title = String(req.body?.title || "").trim();
    const categoryIds = parseIdList(req.body?.categoryIds ?? req.body?.categoryId);
    const tags = parseIdList(req.body?.tags);
    const practiceIds = parseIdList(req.body?.practiceIds);
    const dealIds = parseIdList(req.body?.dealIds);
    const personIds = parseIdList(req.body?.personIds);
    const isPublicShareable = parseBoolean(req.body?.isPublicShareable) || false;
    const description =
      req.body?.description !== undefined ? String(req.body.description) : undefined;

    if (!title) {
      return res.status(400).json({ message: "title is required." });
    }
    if (!categoryIds.length) {
      return res.status(400).json({ message: "At least one category is required." });
    }

    const document = await createHubDocument({
      title,
      description,
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer,
      categoryIds,
      tags,
      practiceIds,
      dealIds,
      personIds,
      isPublicShareable,
      uploadedById: user.sub,
    });

    await logDocumentActivity({
      documentId: document.id,
      userId: user.sub,
      action: HubDocumentActivityAction.UPLOAD,
      ipAddress: getRequestIp(req),
    });

    const duplicateOf = await findChecksumDuplicates(document.checksumSha256, document.id);

    return res.status(201).json({
      message: "Document uploaded successfully.",
      document: serializeHubDocument(document, { isLatest: true }),
      duplicateOf,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload document.";
    const status = message.includes("required") || message.includes("Unsupported") || message.includes("exceeds") || message.includes("not found") || message.includes("match")
      ? 400
      : 500;
    return res.status(status).json({
      message: status === 500 ? "Unable to upload document." : message,
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getDocuments(req: AuthenticatedRequest, res: Response) {
  try {
    if (!requireUser(req, res)) {
      return;
    }

    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20);
    const skip = (page - 1) * limit;
    const search = req.query.search ? String(req.query.search).trim() : "";
    const categoryId = req.query.categoryId ? String(req.query.categoryId) : undefined;
    const tag = req.query.tag ? String(req.query.tag).trim().toLowerCase() : undefined;
    const uploadedById = req.query.uploadedById ? String(req.query.uploadedById) : undefined;
    const personId = req.query.personId ? String(req.query.personId) : undefined;
    const practiceId = req.query.practiceId ? String(req.query.practiceId) : undefined;
    const dealId = req.query.dealId ? String(req.query.dealId) : undefined;
    const mimeType = req.query.mimeType ? String(req.query.mimeType) : undefined;
    const fileType = req.query.fileType ? String(req.query.fileType).toLowerCase() : undefined;
    const statusParam = req.query.status ? String(req.query.status).toUpperCase() : HubDocumentStatus.ACTIVE;
    const from = req.query.from ? new Date(String(req.query.from)) : undefined;
    const to = req.query.to ? new Date(String(req.query.to)) : undefined;
    const latestOnly = String(req.query.latestOnly || "true") !== "false";
    const sort = String(req.query.sort || "newest");

    const where: Prisma.HubDocumentWhereInput = {};

    if (statusParam !== "ALL") {
      if (!Object.values(HubDocumentStatus).includes(statusParam as HubDocumentStatus)) {
        return res.status(400).json({
          message: "Invalid status.",
          allowed: Object.values(HubDocumentStatus),
        });
      }
      where.status = statusParam as HubDocumentStatus;
    }

    if (uploadedById) {
      where.uploadedById = uploadedById;
    }
    if (mimeType) {
      where.mimeType = mimeType;
    }
    if (fileType) {
      const typeMap: Record<string, string> = {
        pdf: "application/pdf",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
      };
      if (typeMap[fileType]) {
        where.mimeType = typeMap[fileType];
      }
    }
    if (from || to) {
      where.createdAt = {
        ...(from && !Number.isNaN(from.getTime()) ? { gte: from } : {}),
        ...(to && !Number.isNaN(to.getTime()) ? { lte: to } : {}),
      };
    }
    if (categoryId) {
      where.categoryLinks = { some: { categoryId } };
    }
    if (tag) {
      where.tagLinks = { some: { tag: { name: tag } } };
    }
    if (personId) {
      where.personLinks = { some: { personId } };
    }
    if (practiceId) {
      where.practiceLinks = { some: { practiceId } };
    }
    if (dealId) {
      where.dealLinks = { some: { dealId } };
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { originalFilename: { contains: search, mode: "insensitive" } },
        { tagLinks: { some: { tag: { name: { contains: search, mode: "insensitive" } } } } },
      ];
    }

    let filteredIds: string[] | undefined;
    if (latestOnly) {
      filteredIds = await listLatestDocumentIds(where);
      if (!filteredIds.length) {
        return res.status(200).json({
          message: "Documents fetched successfully.",
          documents: [],
          pagination: { totalRecords: 0, totalPages: 0, currentPage: page, limit },
        });
      }
    }

    const listWhere: Prisma.HubDocumentWhereInput = filteredIds
      ? { id: { in: filteredIds } }
      : where;

    let orderBy: Prisma.HubDocumentOrderByWithRelationInput = { createdAt: "desc" };
    if (sort === "oldest") {
      orderBy = { createdAt: "asc" };
    } else if (sort === "alphabetical") {
      orderBy = { title: "asc" };
    } else if (sort === "mostDownloaded") {
      orderBy = { downloadCount: "desc" };
    }

    const [documents, totalRecords] = await Promise.all([
      prisma.hubDocument.findMany({
        where: listWhere,
        include: hubDocumentInclude,
        orderBy,
        skip,
        take: limit,
      }),
      prisma.hubDocument.count({ where: listWhere }),
    ]);

    return res.status(200).json({
      message: "Documents fetched successfully.",
      documents: documents.map((document) =>
        serializeHubDocument(document, { isLatest: true }),
      ),
      pagination: {
        totalRecords,
        totalPages: Math.ceil(totalRecords / limit) || 0,
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch documents.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getDocument(req: AuthenticatedRequest, res: Response) {
  try {
    if (!requireUser(req, res)) {
      return;
    }

    const id = routeParam(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Document id is required." });
    }

    const document = await prisma.hubDocument.findUnique({
      where: { id },
      include: hubDocumentInclude,
    });

    if (!document) {
      return res.status(404).json({ message: "Document not found." });
    }

    const versionHistory = await prisma.hubDocument.findMany({
      where: { rootDocumentId: document.rootDocumentId },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { version: "desc" },
    });

    const latestVersion = versionHistory[0]?.version || document.version;

    return res.status(200).json({
      message: "Document fetched successfully.",
      document: serializeHubDocument(document, {
        isLatest: document.version === latestVersion,
      }),
      versionHistory: versionHistory.map((version) => ({
        id: version.id,
        version: version.version,
        title: version.title,
        originalFilename: version.originalFilename,
        status: version.status,
        uploadedBy: version.uploadedBy,
        createdAt: version.createdAt,
        fileSizeBytes: version.fileSizeBytes,
      })),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch document.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updateDocument(req: AuthenticatedRequest, res: Response) {
  try {
    const user = requireUser(req, res);
    if (!user) {
      return;
    }

    const id = routeParam(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Document id is required." });
    }

    const existing = await prisma.hubDocument.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Document not found." });
    }

    if (!isContentManagerRole(user.role)) {
      return res.status(403).json({ message: "Forbidden." });
    }

    const statusValue =
      req.body?.status !== undefined
        ? String(req.body.status).toUpperCase()
        : undefined;
    if (
      statusValue &&
      !Object.values(HubDocumentStatus).includes(statusValue as HubDocumentStatus)
    ) {
      return res.status(400).json({ message: "Invalid status." });
    }

    const previousStatus = existing.status;
    const document = await updateHubDocumentMetadata({
      documentId: id,
      title: req.body?.title,
      description: req.body?.description,
      categoryIds:
        req.body?.categoryIds !== undefined ? parseIdList(req.body.categoryIds) : undefined,
      tags: req.body?.tags !== undefined ? parseIdList(req.body.tags) : undefined,
      practiceIds:
        req.body?.practiceIds !== undefined ? parseIdList(req.body.practiceIds) : undefined,
      dealIds: req.body?.dealIds !== undefined ? parseIdList(req.body.dealIds) : undefined,
      personIds: req.body?.personIds !== undefined ? parseIdList(req.body.personIds) : undefined,
      isPublicShareable: parseBoolean(req.body?.isPublicShareable),
      status: statusValue as HubDocumentStatus | undefined,
    });

    let action: HubDocumentActivityAction = HubDocumentActivityAction.METADATA_EDIT;
    if (statusValue === HubDocumentStatus.ARCHIVED && previousStatus !== HubDocumentStatus.ARCHIVED) {
      action = HubDocumentActivityAction.ARCHIVE;
    } else if (
      statusValue === HubDocumentStatus.ACTIVE &&
      previousStatus === HubDocumentStatus.ARCHIVED
    ) {
      action = HubDocumentActivityAction.RESTORE;
    }

    await logDocumentActivity({
      documentId: id,
      userId: user.sub,
      action,
      ipAddress: getRequestIp(req),
    });

    return res.status(200).json({
      message: "Document updated successfully.",
      document: serializeHubDocument(document),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update document.";
    const status = message.includes("not found") || message.includes("required") ? 400 : 500;
    return res.status(status).json({
      message: status === 500 ? "Unable to update document." : message,
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function createDocumentVersion(req: AuthenticatedRequest, res: Response) {
  try {
    const user = requireUser(req, res);
    if (!user) {
      return;
    }

    const id = routeParam(req.params.id);
    const file = req.file;
    if (!id) {
      return res.status(400).json({ message: "Document id is required." });
    }
    if (!file) {
      return res.status(400).json({ message: "A file is required." });
    }

    const document = await createHubDocumentVersion({
      parentDocumentId: id,
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer,
      uploadedById: user.sub,
      title: req.body?.title,
      description: req.body?.description,
    });

    await logDocumentActivity({
      documentId: document.id,
      userId: user.sub,
      action: HubDocumentActivityAction.UPLOAD,
      ipAddress: getRequestIp(req),
    });

    const duplicateOf = await findChecksumDuplicates(document.checksumSha256, document.id);

    return res.status(201).json({
      message: "Document version uploaded successfully.",
      document: serializeHubDocument(document, { isLatest: true }),
      duplicateOf,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload version.";
    const status = message.includes("not found")
      ? 404
      : message.includes("Unsupported") || message.includes("exceeds") || message.includes("match")
        ? 400
        : 500;
    return res.status(status).json({
      message: status === 500 ? "Unable to upload document version." : message,
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function archiveDocument(req: AuthenticatedRequest, res: Response) {
  try {
    const user = requireUser(req, res);
    if (!user) {
      return;
    }

    const id = routeParam(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Document id is required." });
    }

    const existing = await prisma.hubDocument.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Document not found." });
    }

    if (
      !canSoftDeleteDocument({
        role: user.role,
        userId: user.sub,
        uploadedById: existing.uploadedById,
      })
    ) {
      return res.status(403).json({
        message: "Forbidden. You can only archive your own uploads.",
      });
    }

    const document = await archiveHubDocument(id);
    await logDocumentActivity({
      documentId: id,
      userId: user.sub,
      action: HubDocumentActivityAction.ARCHIVE,
      ipAddress: getRequestIp(req),
    });

    return res.status(200).json({
      message: "Document archived successfully.",
      document: serializeHubDocument(document),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to archive document.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function hardDeleteDocument(req: AuthenticatedRequest, res: Response) {
  try {
    const user = requireUser(req, res);
    if (!user) {
      return;
    }

    if (!isAdminRole(user.role)) {
      return res.status(403).json({ message: "Forbidden." });
    }

    const id = routeParam(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Document id is required." });
    }

    const existing = await prisma.hubDocument.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Document not found." });
    }

    await logDocumentActivity({
      documentId: existing.id,
      userId: user.sub,
      action: HubDocumentActivityAction.DELETE,
      ipAddress: getRequestIp(req),
      details: `Hard deleted "${existing.title}" (root ${existing.rootDocumentId})`,
    });

    const result = await hardDeleteDocumentFamily(id);

    return res.status(200).json({
      message: "Document permanently deleted.",
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete document.";
    const status = message.includes("not found") ? 404 : 500;
    return res.status(status).json({
      message: status === 500 ? "Unable to delete document." : message,
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function downloadDocument(req: AuthenticatedRequest, res: Response) {
  try {
    const user = requireUser(req, res);
    if (!user) {
      return;
    }

    const id = routeParam(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Document id is required." });
    }

    const document = await prisma.hubDocument.findUnique({ where: { id } });
    if (!document) {
      return res.status(404).json({ message: "Document not found." });
    }

    await prisma.hubDocument.update({
      where: { id },
      data: { downloadCount: { increment: 1 } },
    });
    await logDocumentActivity({
      documentId: id,
      userId: user.sub,
      action: HubDocumentActivityAction.DOWNLOAD,
      ipAddress: getRequestIp(req),
    });

    return res.status(200).json({
      message: "Download URL generated.",
      ...createDownloadPayload(document),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to generate download URL.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
