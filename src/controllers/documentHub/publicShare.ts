import { Request, Response } from "express";
import {
  createDownloadPayload,
  getRequestIp,
  getValidPublicLink,
  recordPublicLinkAccess,
} from "../../services/documentHub/documentHub.service";
import { routeParam } from "../../middleware/documentHubUpload";

const UNAVAILABLE_MESSAGE = "This link is no longer available.";

export async function getPublicShare(req: Request, res: Response) {
  try {
    const token = routeParam(req.params.token);
    if (!token) {
      return res.status(400).json({ message: "Share token is required." });
    }

    const result = await getValidPublicLink(token);
    if ("error" in result) {
      const status = result.error === "not_found" ? 410 : 410;
      return res.status(status).json({ message: UNAVAILABLE_MESSAGE });
    }

    await recordPublicLinkAccess({
      publicLinkId: result.publicLink.id,
      documentId: result.publicLink.documentId,
      ipAddress: getRequestIp(req),
    });

    const { document } = result.publicLink;
    return res.status(200).json({
      title: document.title,
      description: document.description,
      mimeType: document.mimeType,
      originalFilename: document.originalFilename,
      allowDownload: result.publicLink.allowDownload,
      expiresAt: result.publicLink.expiresAt,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to load shared document.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function downloadPublicShare(req: Request, res: Response) {
  try {
    const token = routeParam(req.params.token);
    if (!token) {
      return res.status(400).json({ message: "Share token is required." });
    }

    const result = await getValidPublicLink(token);
    if ("error" in result) {
      return res.status(410).json({ message: UNAVAILABLE_MESSAGE });
    }

    if (!result.publicLink.allowDownload) {
      return res.status(403).json({
        message: "Download is not enabled for this link.",
      });
    }

    await recordPublicLinkAccess({
      publicLinkId: result.publicLink.id,
      documentId: result.publicLink.documentId,
      ipAddress: getRequestIp(req),
    });

    return res.status(200).json({
      message: "Download URL generated.",
      ...createDownloadPayload(result.publicLink.document),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to download shared document.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
