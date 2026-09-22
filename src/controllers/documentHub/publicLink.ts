import { Response } from "express";
import { HubDocumentActivityAction } from "../../../generated/prisma/client";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { routeParam } from "../../middleware/documentHubUpload";
import { prisma } from "../../lib/prisma";
import {
  buildShareUrl,
  canRevokePublicLink,
  createPublicLink,
  getRequestIp,
  logDocumentActivity,
  parseBoolean,
} from "../../services/documentHub/documentHub.service";

function requireUser(req: AuthenticatedRequest, res: Response) {
  if (!req.user?.sub) {
    res.status(401).json({ message: "Unauthorized." });
    return null;
  }
  return req.user;
}

export async function createDocumentPublicLink(req: AuthenticatedRequest, res: Response) {
  try {
    const user = requireUser(req, res);
    if (!user) {
      return;
    }

    const id = routeParam(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Document id is required." });
    }

    const expiresAtRaw = req.body?.expiresAt;
    const expiresAt =
      expiresAtRaw === null || expiresAtRaw === undefined || expiresAtRaw === ""
        ? null
        : new Date(String(expiresAtRaw));
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      return res.status(400).json({ message: "Invalid expiresAt." });
    }

    const publicLink = await createPublicLink({
      documentId: id,
      createdById: user.sub,
      expiresAt,
      allowDownload: parseBoolean(req.body?.allowDownload),
    });

    await logDocumentActivity({
      documentId: id,
      userId: user.sub,
      action: HubDocumentActivityAction.PUBLIC_LINK_CREATED,
      ipAddress: getRequestIp(req),
    });

    return res.status(201).json({
      message: "Public link created successfully.",
      publicLink,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create public link.";
    const status = message.includes("not found")
      ? 404
      : message.includes("public-shareable")
        ? 403
        : 500;
    return res.status(status).json({
      message: status === 500 ? "Unable to create public link." : message,
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function listDocumentPublicLinks(req: AuthenticatedRequest, res: Response) {
  try {
    if (!requireUser(req, res)) {
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

    const publicLinks = await prisma.hubDocumentPublicLink.findMany({
      where: { documentId: id },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      message: "Public links fetched successfully.",
      publicLinks: publicLinks.map((link) => ({
        ...link,
        ...buildShareUrl(link.token),
      })),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch public links.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function revokePublicLink(req: AuthenticatedRequest, res: Response) {
  try {
    const user = requireUser(req, res);
    if (!user) {
      return;
    }

    const id = routeParam(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Public link id is required." });
    }

    const publicLink = await prisma.hubDocumentPublicLink.findUnique({
      where: { id },
      include: { document: { select: { id: true, uploadedById: true } } },
    });
    if (!publicLink) {
      return res.status(404).json({ message: "Public link not found." });
    }

    if (
      !canRevokePublicLink({
        role: user.role,
        userId: user.sub,
        uploadedById: publicLink.document.uploadedById,
      })
    ) {
      return res.status(403).json({
        message: "Forbidden. You can only revoke links for your own uploads.",
      });
    }

    if (publicLink.revokedAt) {
      return res.status(200).json({
        message: "Public link is already revoked.",
        publicLink,
      });
    }

    const updated = await prisma.hubDocumentPublicLink.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    await logDocumentActivity({
      documentId: publicLink.documentId,
      userId: user.sub,
      action: HubDocumentActivityAction.PUBLIC_LINK_REVOKED,
      ipAddress: getRequestIp(req),
    });

    return res.status(200).json({
      message: "Public link revoked successfully.",
      publicLink: updated,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to revoke public link.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
