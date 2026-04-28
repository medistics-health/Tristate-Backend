import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

export async function getAgreementVersions(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const agreementId = req.query.agreementId as string;

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (agreementId) {
      where.agreementId = agreementId;
    }

    const [versions, totalRecords] = await Promise.all([
      prisma.agreementVersion.findMany({
        where,
        include: {
          agreement: true,
          serviceTerms: true,
        },
        skip,
        take: limit,
        orderBy: {
          versionNumber: "desc",
        },
      }),
      prisma.agreementVersion.count({ where }),
    ]);

    const totalPages = Math.ceil(totalRecords / limit);

    return res.status(200).json({
      message: "Agreement versions fetched successfully.",
      versions,
      pagination: {
        totalRecords,
        totalPages,
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch agreement versions.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getAgreementVersion(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const version = await prisma.agreementVersion.findUnique({
      where: { id },
      include: {
        agreement: true,
        serviceTerms: {
          include: {
            service: true,
            vendor: true,
          }
        },
      },
    });

    if (!version) {
      return res.status(404).json({ message: "Agreement version not found." });
    }

    return res.status(200).json({
      message: "Agreement version fetched successfully.",
      version,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch agreement version.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function createAgreementVersion(req: AuthenticatedRequest, res: Response) {
  try {
    const {
      agreementId,
      versionNumber,
      isCurrent,
      effectiveDate,
      endDate,
      notes,
    } = req.body;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!agreementId || versionNumber === undefined) {
      return res.status(400).json({
        message: "agreementId and versionNumber are required.",
      });
    }

    // If this is set to current, unset others for the same agreement
    if (isCurrent) {
      await prisma.agreementVersion.updateMany({
        where: { agreementId: agreementId as string, isCurrent: true },
        data: { isCurrent: false },
      });
    }

    const version = await prisma.agreementVersion.create({
      data: {
        agreementId: agreementId as string,
        versionNumber,
        isCurrent: isCurrent ?? true,
        effectiveDate: effectiveDate ? new Date(effectiveDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        notes,
      },
    });

    return res.status(201).json({
      message: "Agreement version created successfully.",
      version,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to create agreement version.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updateAgreementVersion(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string;
    const {
      versionNumber,
      isCurrent,
      effectiveDate,
      endDate,
      notes,
    } = req.body;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const existingVersion = await prisma.agreementVersion.findUnique({
      where: { id },
    });

    if (!existingVersion) {
      return res.status(404).json({ message: "Agreement version not found." });
    }

    // If this is being set to current, unset others for the same agreement
    if (isCurrent && !existingVersion.isCurrent) {
      await prisma.agreementVersion.updateMany({
        where: { agreementId: existingVersion.agreementId, isCurrent: true },
        data: { isCurrent: false },
      });
    }

    const version = await prisma.agreementVersion.update({
      where: { id },
      data: {
        versionNumber: versionNumber ?? undefined,
        isCurrent: isCurrent ?? undefined,
        effectiveDate: effectiveDate ? new Date(effectiveDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        notes: notes ?? undefined,
      },
    });

    return res.status(200).json({
      message: "Agreement version updated successfully.",
      version,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to update agreement version.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function deleteAgreementVersion(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const existingVersion = await prisma.agreementVersion.findUnique({
      where: { id },
    });

    if (!existingVersion) {
      return res.status(404).json({ message: "Agreement version not found." });
    }

    await prisma.agreementVersion.delete({
      where: { id },
    });

    return res.status(200).json({
      message: "Agreement version deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete agreement version.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
