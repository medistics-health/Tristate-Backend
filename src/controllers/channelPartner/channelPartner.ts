import { ChannelPartnerType } from "../../../generated/prisma/client";
import { Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

type ChannelPartnerBody = {
  name?: string;
  type?: string;
  agreementId?: string | null;
};

function isChannelPartnerType(type: string): type is ChannelPartnerType {
  return Object.values(ChannelPartnerType).includes(type as ChannelPartnerType);
}

export async function createChannelPartner(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const { name, type, agreementId } = req.body as ChannelPartnerBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!name || !type) {
      return res.status(400).json({ message: "name and type are required." });
    }

    if (!isChannelPartnerType(type)) {
      return res.status(400).json({
        message: "Invalid channel partner type.",
        allowedTypes: Object.values(ChannelPartnerType),
      });
    }

    if (agreementId) {
      const agreement = await prisma.agreement.findFirst({
        where: { id: agreementId, practice: { ownerId: req.user.sub } },
      });
      if (!agreement) {
        return res.status(404).json({ message: "Agreement not found." });
      }
    }

    const channelPartner = await prisma.channelPartner.create({
      data: {
        name,
        type,
        agreementId: agreementId ?? undefined,
      },
    });

    return res.status(201).json({
      message: "Channel partner created successfully.",
      channelPartner,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to create channel partner.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getChannelPartner(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Channel partner id is required." });
    }

    const channelPartner = await prisma.channelPartner.findFirst({
      where: {
        id,
        OR: [
          { agreementId: null },
          { agreement: { practice: { ownerId: req.user.sub } } },
        ],
      },
      include: { agreement: true },
    });

    if (!channelPartner) {
      return res.status(404).json({ message: "Channel partner not found." });
    }

    return res.status(200).json({
      message: "Channel partner fetched successfully.",
      channelPartner,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch channel partner.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updateChannelPartner(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { name, type, agreementId } = req.body as ChannelPartnerBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Channel partner id is required." });
    }

    if (type !== undefined && !isChannelPartnerType(type)) {
      return res.status(400).json({
        message: "Invalid channel partner type.",
        allowedTypes: Object.values(ChannelPartnerType),
      });
    }

    const existingChannelPartner = await prisma.channelPartner.findFirst({
      where: {
        id,
        OR: [
          { agreementId: null },
          { agreement: { practice: { ownerId: req.user.sub } } },
        ],
      },
    });

    if (!existingChannelPartner) {
      return res.status(404).json({ message: "Channel partner not found." });
    }

    if (agreementId) {
      const agreement = await prisma.agreement.findFirst({
        where: { id: agreementId, practice: { ownerId: req.user.sub } },
      });
      if (!agreement) {
        return res.status(404).json({ message: "Agreement not found." });
      }
    }

    const channelPartner = await prisma.channelPartner.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(type !== undefined ? { type: type as ChannelPartnerType } : {}),
        ...(agreementId !== undefined ? { agreementId: agreementId || null } : {}),
      },
    });

    return res.status(200).json({
      message: "Channel partner updated successfully.",
      channelPartner,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to update channel partner.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function deleteChannelPartner(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Channel partner id is required." });
    }

    const existingChannelPartner = await prisma.channelPartner.findFirst({
      where: {
        id,
        OR: [
          { agreementId: null },
          { agreement: { practice: { ownerId: req.user.sub } } },
        ],
      },
    });

    if (!existingChannelPartner) {
      return res.status(404).json({ message: "Channel partner not found." });
    }

    await prisma.channelPartner.delete({ where: { id } });

    return res.status(200).json({
      message: "Channel partner deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete channel partner.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
