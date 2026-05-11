import { Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

export async function getSystemSettings(req: AuthenticatedRequest, res: Response) {
  try {
    let settings = await prisma.systemSettings.findFirst();

    if (!settings) {
      // Initialize with defaults if none exist
      settings = await prisma.systemSettings.create({
        data: {
          organizationName: "Tristate MSO",
          domain: "tristate-mso.com",
          address: "123 Enterprise Way, Suite 500, New Jersey, NJ 07102",
        },
      });
    }

    return res.status(200).json({
      message: "Settings fetched successfully.",
      settings,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch settings.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updateSystemSettings(req: AuthenticatedRequest, res: Response) {
  try {
    const { organizationName, domain, address, supportEmail } = req.body;

    const existing = await prisma.systemSettings.findFirst();

    let settings;
    if (existing) {
      settings = await prisma.systemSettings.update({
        where: { id: existing.id },
        data: { organizationName, domain, address, supportEmail },
      });
    } else {
      settings = await prisma.systemSettings.create({
        data: { organizationName, domain, address, supportEmail },
      });
    }

    return res.status(200).json({
      message: "Settings updated successfully.",
      settings,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to update settings.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
