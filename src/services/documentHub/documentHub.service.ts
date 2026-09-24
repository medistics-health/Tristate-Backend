import crypto from "crypto";
import { Request } from "express";
import {
  HubDocumentActivityAction,
  HubDocumentStatus,
  Prisma,
  UserRoles,
} from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import {
  buildDocumentHubBlobName,
  createDocumentHubDownloadSasUrl,
  deleteDocumentHubBlob,
  resolveDocumentHubContentType,
  uploadDocumentHubBuffer,
  validateDocumentHubFile,
} from "../../utils/documentHubBlob";

export const hubDocumentInclude = {
  uploadedBy: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
    },
  },
  categoryLinks: { include: { category: true } },
  tagLinks: { include: { tag: true } },
  practiceLinks: {
    include: { practice: { select: { id: true, name: true } } },
  },
  dealLinks: {
    include: {
      deal: { select: { id: true, stage: true, practiceId: true } },
    },
  },
  personLinks: {
    include: {
      person: {
        select: { id: true, firstName: true, lastName: true, email: true, role: true },
      },
    },
  },
} satisfies Prisma.HubDocumentInclude;

export type HubDocumentWithRelations = Prisma.HubDocumentGetPayload<{
  include: typeof hubDocumentInclude;
}>;

export function normalizeRole(role?: string) {
  return typeof role === "string" ? role.trim().toUpperCase() : "";
}

export function isAdminRole(role?: string) {
  return normalizeRole(role) === UserRoles.ADMIN;
}

export function isContentManagerRole(role?: string) {
  return isAdminRole(role);
}

export function canSoftDeleteDocument(params: {
  role?: string;
  userId: string;
  uploadedById: string;
}) {
  return isAdminRole(params.role);
}

export function canRevokePublicLink(params: {
  role?: string;
  userId: string;
  uploadedById: string;
}) {
  return canSoftDeleteDocument(params);
}

export function parseHubDocumentPublishStatus(
  value: unknown,
  fallback: HubDocumentStatus = HubDocumentStatus.ACTIVE,
): HubDocumentStatus {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }
  const status = String(value).toUpperCase();
  if (status === HubDocumentStatus.DRAFT || status === HubDocumentStatus.ACTIVE) {
    return status;
  }
  throw new Error("Status must be DRAFT or ACTIVE. Use archive to retire a document.");
}

export function isHubDocumentPubliclyAvailable(document: {
  status: HubDocumentStatus;
  isPublicShareable: boolean;
}) {
  return document.isPublicShareable && document.status === HubDocumentStatus.ACTIVE;
}

export function serializeHubDocument(
  document: HubDocumentWithRelations,
  extras?: { isLatest?: boolean },
) {
  return {
    id: document.id,
    title: document.title,
    description: document.description,
    fileKey: document.fileKey,
    originalFilename: document.originalFilename,
    mimeType: document.mimeType,
    fileSizeBytes: document.fileSizeBytes,
    checksumSha256: document.checksumSha256,
    version: document.version,
    rootDocumentId: document.rootDocumentId,
    parentDocumentId: document.parentDocumentId,
    status: document.status,
    isPublicShareable: document.isPublicShareable,
    uploadedBy: document.uploadedBy,
    downloadCount: document.downloadCount,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    isLatest: extras?.isLatest,
    categories: document.categoryLinks.map((link) => link.category),
    tags: document.tagLinks.map((link) => link.tag),
    practices: document.practiceLinks.map((link) => link.practice),
    deals: document.dealLinks.map((link) => link.deal),
    persons: document.personLinks.map((link) => link.person),
  };
}

export const linkedHubDocumentInclude = {
  document: {
    include: {
      uploadedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      categoryLinks: { include: { category: true } },
      tagLinks: { include: { tag: true } },
    },
  },
} as const;

export function serializeLinkedHubDocuments(
  links: Array<{
    document: {
      id: string;
      title: string;
      description: string | null;
      originalFilename: string;
      mimeType: string;
      fileSizeBytes: number;
      version: number;
      rootDocumentId: string;
      status: HubDocumentStatus;
      createdAt: Date;
      uploadedBy: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
      };
      categoryLinks: Array<{ category: { id: string; name: string } }>;
      tagLinks: Array<{ tag: { id: string; name: string } }>;
    };
  }>,
) {
  const latestByRoot = new Map<string, (typeof links)[number]["document"]>();
  for (const link of links) {
    const document = link.document;
    if (document.status !== HubDocumentStatus.ACTIVE) {
      continue;
    }
    const existing = latestByRoot.get(document.rootDocumentId);
    if (!existing || document.version > existing.version) {
      latestByRoot.set(document.rootDocumentId, document);
    }
  }

  return [...latestByRoot.values()]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((document) => ({
      id: document.id,
      title: document.title,
      description: document.description,
      originalFilename: document.originalFilename,
      mimeType: document.mimeType,
      fileSizeBytes: document.fileSizeBytes,
      version: document.version,
      status: document.status,
      createdAt: document.createdAt,
      uploadedBy: document.uploadedBy,
      categories: document.categoryLinks.map((link) => link.category),
      tags: document.tagLinks.map((link) => link.tag),
    }));
}

export function parseIdList(value: unknown): string[] {
  if (value == null || value === "") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      // comma-separated fallback
    }
    return trimmed
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export function parseBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no"].includes(normalized)) {
    return false;
  }
  return undefined;
}

export function normalizeTagName(value: string) {
  return value.trim().toLowerCase();
}

export function getRequestIp(req: Pick<Request, "ip" | "headers">) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || null;
}

export async function logDocumentActivity(params: {
  documentId?: string | null;
  userId?: string | null;
  action: HubDocumentActivityAction;
  ipAddress?: string | null;
  details?: string | null;
}) {
  await prisma.hubDocumentActivityLog.create({
    data: {
      documentId: params.documentId || null,
      userId: params.userId || null,
      action: params.action,
      ipAddress: params.ipAddress || null,
      details: params.details || null,
    },
  });
}

async function syncCategories(documentId: string, categoryIds: string[]) {
  const uniqueIds = [...new Set(categoryIds)];
  const categories = await prisma.hubDocumentCategory.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true },
  });
  if (categories.length !== uniqueIds.length) {
    throw new Error("One or more categories were not found.");
  }

  await prisma.hubDocumentCategoryLink.deleteMany({ where: { documentId } });
  await prisma.hubDocumentCategoryLink.createMany({
    data: uniqueIds.map((categoryId) => ({ documentId, categoryId })),
  });
}

async function syncTags(documentId: string, tags: string[]) {
  const normalized = [
    ...new Set(tags.map(normalizeTagName).filter((name) => name.length > 0)),
  ];

  await prisma.hubDocumentTagLink.deleteMany({ where: { documentId } });
  if (normalized.length === 0) {
    return;
  }

  for (const name of normalized) {
    const tag = await prisma.hubDocumentTag.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    await prisma.hubDocumentTagLink.create({
      data: { documentId, tagId: tag.id },
    });
  }
}

async function syncPractices(documentId: string, practiceIds: string[]) {
  const uniqueIds = [...new Set(practiceIds)];
  if (uniqueIds.length) {
    const practices = await prisma.practice.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true },
    });
    if (practices.length !== uniqueIds.length) {
      throw new Error("One or more practices were not found.");
    }
  }

  await prisma.hubDocumentPractice.deleteMany({ where: { documentId } });
  if (uniqueIds.length) {
    await prisma.hubDocumentPractice.createMany({
      data: uniqueIds.map((practiceId) => ({ documentId, practiceId })),
    });
  }
}

async function syncDeals(documentId: string, dealIds: string[]) {
  const uniqueIds = [...new Set(dealIds)];
  if (uniqueIds.length) {
    const deals = await prisma.deal.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true },
    });
    if (deals.length !== uniqueIds.length) {
      throw new Error("One or more deals were not found.");
    }
  }

  await prisma.hubDocumentDeal.deleteMany({ where: { documentId } });
  if (uniqueIds.length) {
    await prisma.hubDocumentDeal.createMany({
      data: uniqueIds.map((dealId) => ({ documentId, dealId })),
    });
  }
}

async function syncPersons(documentId: string, personIds: string[]) {
  const uniqueIds = [...new Set(personIds)];
  if (uniqueIds.length) {
    const persons = await prisma.person.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true },
    });
    if (persons.length !== uniqueIds.length) {
      throw new Error("One or more persons were not found.");
    }
  }

  await prisma.hubDocumentPerson.deleteMany({ where: { documentId } });
  if (uniqueIds.length) {
    await prisma.hubDocumentPerson.createMany({
      data: uniqueIds.map((personId) => ({ documentId, personId })),
    });
  }
}

export async function findChecksumDuplicates(checksumSha256: string, excludeId?: string) {
  return prisma.hubDocument.findMany({
    where: {
      checksumSha256,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, title: true, version: true, rootDocumentId: true },
    take: 10,
  });
}

export async function createHubDocument(params: {
  title: string;
  description?: string | null;
  originalFilename: string;
  mimeType?: string;
  buffer: Buffer;
  categoryIds: string[];
  tags?: string[];
  practiceIds?: string[];
  dealIds?: string[];
  personIds?: string[];
  isPublicShareable?: boolean;
  status?: HubDocumentStatus;
  uploadedById: string;
}) {
  const fileError = validateDocumentHubFile({
    originalFilename: params.originalFilename,
    mimeType: params.mimeType,
    fileSizeBytes: params.buffer.length,
  });
  if (fileError) {
    throw new Error(fileError);
  }
  if (!params.title.trim()) {
    throw new Error("title is required.");
  }
  if (!params.categoryIds.length) {
    throw new Error("At least one category is required.");
  }

  const documentId = crypto.randomUUID();
  const version = 1;
  const checksumSha256 = crypto.createHash("sha256").update(params.buffer).digest("hex");
  const contentType = resolveDocumentHubContentType({
    originalFilename: params.originalFilename,
    mimeType: params.mimeType,
  });
  const fileKey = buildDocumentHubBlobName({
    documentId,
    version,
    originalFilename: params.originalFilename,
  });

  await uploadDocumentHubBuffer({
    blobName: fileKey,
    buffer: params.buffer,
    contentType,
  });

  try {
    const document = await prisma.hubDocument.create({
      data: {
        id: documentId,
        title: params.title.trim(),
        description: params.description?.trim() || null,
        fileKey,
        originalFilename: params.originalFilename,
        mimeType: contentType,
        fileSizeBytes: params.buffer.length,
        checksumSha256,
        version,
        rootDocumentId: documentId,
        status: params.status ?? HubDocumentStatus.ACTIVE,
        isPublicShareable: Boolean(params.isPublicShareable),
        uploadedById: params.uploadedById,
      },
      include: hubDocumentInclude,
    });

    await syncCategories(document.id, params.categoryIds);
    await syncTags(document.id, params.tags || []);
    await syncPractices(document.id, params.practiceIds || []);
    await syncDeals(document.id, params.dealIds || []);
    await syncPersons(document.id, params.personIds || []);

    return prisma.hubDocument.findUniqueOrThrow({
      where: { id: document.id },
      include: hubDocumentInclude,
    });
  } catch (error) {
    await deleteDocumentHubBlob(fileKey).catch(() => undefined);
    throw error;
  }
}

export async function createHubDocumentVersion(params: {
  parentDocumentId: string;
  originalFilename: string;
  mimeType?: string;
  buffer: Buffer;
  uploadedById: string;
  title?: string;
  description?: string | null;
}) {
  const parent = await prisma.hubDocument.findUnique({
    where: { id: params.parentDocumentId },
    include: {
      categoryLinks: true,
      tagLinks: true,
      practiceLinks: true,
      dealLinks: true,
      personLinks: true,
    },
  });

  if (!parent) {
    throw new Error("Document not found.");
  }

  const fileError = validateDocumentHubFile({
    originalFilename: params.originalFilename,
    mimeType: params.mimeType,
    fileSizeBytes: params.buffer.length,
  });
  if (fileError) {
    throw new Error(fileError);
  }

  const latest = await prisma.hubDocument.findFirst({
    where: { rootDocumentId: parent.rootDocumentId },
    orderBy: { version: "desc" },
  });
  const version = (latest?.version || parent.version) + 1;
  const documentId = crypto.randomUUID();
  const checksumSha256 = crypto.createHash("sha256").update(params.buffer).digest("hex");
  const contentType = resolveDocumentHubContentType({
    originalFilename: params.originalFilename,
    mimeType: params.mimeType,
  });
  const fileKey = buildDocumentHubBlobName({
    documentId,
    version,
    originalFilename: params.originalFilename,
  });

  await uploadDocumentHubBuffer({
    blobName: fileKey,
    buffer: params.buffer,
    contentType,
  });

  try {
    const document = await prisma.hubDocument.create({
      data: {
        id: documentId,
        title: (params.title ?? parent.title).trim(),
        description:
          params.description !== undefined
            ? params.description?.trim() || null
            : parent.description,
        fileKey,
        originalFilename: params.originalFilename,
        mimeType: contentType,
        fileSizeBytes: params.buffer.length,
        checksumSha256,
        version,
        rootDocumentId: parent.rootDocumentId,
        parentDocumentId: parent.id,
        status:
          parent.status === HubDocumentStatus.ARCHIVED
            ? HubDocumentStatus.ACTIVE
            : parent.status,
        isPublicShareable: parent.isPublicShareable,
        uploadedById: params.uploadedById,
      },
    });

    await syncCategories(
      document.id,
      parent.categoryLinks.map((link) => link.categoryId),
    );
    await prisma.hubDocumentTagLink.createMany({
      data: parent.tagLinks.map((link) => ({
        documentId: document.id,
        tagId: link.tagId,
      })),
    });
    await prisma.hubDocumentPractice.createMany({
      data: parent.practiceLinks.map((link) => ({
        documentId: document.id,
        practiceId: link.practiceId,
      })),
    });
    await prisma.hubDocumentDeal.createMany({
      data: parent.dealLinks.map((link) => ({
        documentId: document.id,
        dealId: link.dealId,
      })),
    });
    await prisma.hubDocumentPerson.createMany({
      data: parent.personLinks.map((link) => ({
        documentId: document.id,
        personId: link.personId,
      })),
    });

    return prisma.hubDocument.findUniqueOrThrow({
      where: { id: document.id },
      include: hubDocumentInclude,
    });
  } catch (error) {
    await deleteDocumentHubBlob(fileKey).catch(() => undefined);
    throw error;
  }
}

export async function updateHubDocumentMetadata(params: {
  documentId: string;
  title?: string;
  description?: string | null;
  categoryIds?: string[];
  tags?: string[];
  practiceIds?: string[];
  dealIds?: string[];
  personIds?: string[];
  isPublicShareable?: boolean;
  status?: HubDocumentStatus;
}) {
  const existing = await prisma.hubDocument.findUnique({
    where: { id: params.documentId },
  });
  if (!existing) {
    throw new Error("Document not found.");
  }

  if (params.categoryIds && params.categoryIds.length === 0) {
    throw new Error("At least one category is required.");
  }

  await prisma.hubDocument.update({
    where: { id: params.documentId },
    data: {
      ...(params.title !== undefined ? { title: params.title.trim() } : {}),
      ...(params.description !== undefined
        ? { description: params.description?.trim() || null }
        : {}),
      ...(params.isPublicShareable !== undefined
        ? { isPublicShareable: params.isPublicShareable }
        : {}),
      ...(params.status !== undefined ? { status: params.status } : {}),
    },
  });

  if (params.categoryIds) {
    await syncCategories(params.documentId, params.categoryIds);
  }
  if (params.tags) {
    await syncTags(params.documentId, params.tags);
  }
  if (params.practiceIds) {
    await syncPractices(params.documentId, params.practiceIds);
  }
  if (params.dealIds) {
    await syncDeals(params.documentId, params.dealIds);
  }
  if (params.personIds) {
    await syncPersons(params.documentId, params.personIds);
  }

  return prisma.hubDocument.findUniqueOrThrow({
    where: { id: params.documentId },
    include: hubDocumentInclude,
  });
}

export async function archiveHubDocument(documentId: string) {
  const existing = await prisma.hubDocument.findUnique({
    where: { id: documentId },
  });
  if (!existing) {
    throw new Error("Document not found.");
  }

  return prisma.hubDocument.update({
    where: { id: documentId },
    data: { status: HubDocumentStatus.ARCHIVED },
    include: hubDocumentInclude,
  });
}

export async function hardDeleteDocumentFamily(documentId: string) {
  const existing = await prisma.hubDocument.findUnique({
    where: { id: documentId },
  });
  if (!existing) {
    throw new Error("Document not found.");
  }

  const versions = await prisma.hubDocument.findMany({
    where: { rootDocumentId: existing.rootDocumentId },
    select: { id: true, fileKey: true },
  });

  await prisma.hubDocumentPublicLink.updateMany({
    where: { documentId: { in: versions.map((version) => version.id) }, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  for (const version of versions) {
    await deleteDocumentHubBlob(version.fileKey).catch(() => undefined);
  }

  const nonRootIds = versions
    .map((version) => version.id)
    .filter((id) => id !== existing.rootDocumentId);

  if (nonRootIds.length) {
    await prisma.hubDocument.deleteMany({ where: { id: { in: nonRootIds } } });
  }
  await prisma.hubDocument.delete({ where: { id: existing.rootDocumentId } });

  return { rootDocumentId: existing.rootDocumentId, deletedCount: versions.length };
}

export async function listLatestDocumentIds(where: Prisma.HubDocumentWhereInput) {
  const grouped = await prisma.hubDocument.groupBy({
    by: ["rootDocumentId"],
    where,
    _max: { version: true },
  });

  if (!grouped.length) {
    return [];
  }

  const latest = await prisma.hubDocument.findMany({
    where: {
      OR: grouped.map((group) => ({
        rootDocumentId: group.rootDocumentId,
        version: group._max.version || 1,
      })),
    },
    select: { id: true },
  });

  return latest.map((document) => document.id);
}

export function buildShareUrl(token: string) {
  const frontendUrl = (process.env.FRONTEND_URL || "").replace(/\/$/, "");
  const path = `/share/${token}`;
  return {
    path,
    url: frontendUrl ? `${frontendUrl}${path}` : path,
  };
}

const publicLinkUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

export const publicLinkInclude = {
  createdBy: { select: publicLinkUserSelect },
  revokedBy: { select: publicLinkUserSelect },
};

export function serializePublicLink<
  T extends {
    token: string;
    createdBy?: unknown;
    revokedBy?: unknown;
  },
>(link: T) {
  const { token, ...rest } = link;
  return {
    ...rest,
    ...buildShareUrl(token),
  };
}

export async function createPublicLink(params: {
  documentId: string;
  createdById: string;
  expiresAt?: Date | null;
  allowDownload?: boolean;
}) {
  const document = await prisma.hubDocument.findUnique({
    where: { id: params.documentId },
  });
  if (!document) {
    throw new Error("Document not found.");
  }
  if (!isHubDocumentPubliclyAvailable(document)) {
    throw new Error(
      document.status !== HubDocumentStatus.ACTIVE
        ? "Only active documents can be shared publicly."
        : "This document is not marked as public-shareable.",
    );
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const publicLink = await prisma.hubDocumentPublicLink.create({
    data: {
      documentId: params.documentId,
      token,
      createdById: params.createdById,
      expiresAt: params.expiresAt || null,
      allowDownload: params.allowDownload !== false,
    },
    include: publicLinkInclude,
  });

  return serializePublicLink(publicLink);
}

export async function getValidPublicLink(token: string) {
  const publicLink = await prisma.hubDocumentPublicLink.findUnique({
    where: { token },
    include: {
      document: {
        select: {
          id: true,
          title: true,
          description: true,
          mimeType: true,
          originalFilename: true,
          fileKey: true,
          isPublicShareable: true,
          status: true,
        },
      },
    },
  });

  if (!publicLink) {
    return { error: "not_found" as const };
  }
  if (publicLink.revokedAt) {
    return { error: "unavailable" as const };
  }
  if (publicLink.expiresAt && publicLink.expiresAt.getTime() < Date.now()) {
    return { error: "unavailable" as const };
  }
  if (!isHubDocumentPubliclyAvailable(publicLink.document)) {
    return { error: "unavailable" as const };
  }

  return { publicLink };
}

export async function recordPublicLinkAccess(params: {
  publicLinkId: string;
  documentId: string;
  ipAddress?: string | null;
}) {
  await prisma.$transaction([
    prisma.hubDocumentPublicLink.update({
      where: { id: params.publicLinkId },
      data: {
        viewCount: { increment: 1 },
        lastAccessedAt: new Date(),
      },
    }),
    prisma.hubDocumentActivityLog.create({
      data: {
        documentId: params.documentId,
        userId: null,
        action: HubDocumentActivityAction.PUBLIC_VIEW,
        ipAddress: params.ipAddress || null,
      },
    }),
  ]);
}

export function createDownloadPayload(document: {
  fileKey: string;
  originalFilename: string;
  mimeType: string;
}) {
  return {
    sasUrl: createDocumentHubDownloadSasUrl(document.fileKey),
    fileName: document.originalFilename,
    mimeType: document.mimeType,
  };
}

export { HubDocumentStatus, HubDocumentActivityAction };
