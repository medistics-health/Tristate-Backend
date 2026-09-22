import { Response } from "express";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { prisma } from "../../lib/prisma";
import { normalizeTagName } from "../../services/documentHub/documentHub.service";

export async function listTags(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const q = req.query.q ? normalizeTagName(String(req.query.q)) : "";
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20));

    const tags = await prisma.hubDocumentTag.findMany({
      where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
      orderBy: { name: "asc" },
      take: limit,
      include: { _count: { select: { documentLinks: true } } },
    });

    return res.status(200).json({
      message: "Tags fetched successfully.",
      tags,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch tags.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
