import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

function asOptionalDate(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${fieldName}.`);
  }

  return parsed;
}

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

    const parsedVersionNumber = Number(versionNumber);
    if (!Number.isInteger(parsedVersionNumber) || parsedVersionNumber <= 0) {
      return res.status(400).json({
        message: "versionNumber must be a positive integer.",
      });
    }

    const agreement = await prisma.agreement.findUnique({
      where: { id: agreementId as string },
      include: {
        versions: true,
      },
    });

    if (!agreement) {
      return res.status(404).json({ message: "Agreement not found." });
    }

    const parsedEffectiveDate = asOptionalDate(effectiveDate, "effectiveDate");
    const parsedEndDate = asOptionalDate(endDate, "endDate");

    if (
      parsedEffectiveDate &&
      parsedEndDate &&
      parsedEffectiveDate > parsedEndDate
    ) {
      return res.status(400).json({
        message: "effectiveDate must be before endDate.",
      });
    }

    const existingVersionNumber = agreement.versions.find(
      (version) => version.versionNumber === parsedVersionNumber,
    );

    if (existingVersionNumber) {
      return res.status(409).json({
        message: "This versionNumber already exists for the agreement.",
      });
    }

    // If this is set to current, unset others for the same agreement
    const shouldBeCurrent =
      typeof isCurrent === "boolean"
        ? isCurrent
        : agreement.versions.length === 0;

    if (shouldBeCurrent) {
      await prisma.agreementVersion.updateMany({
        where: { agreementId: agreementId as string, isCurrent: true },
        data: { isCurrent: false },
      });
    }

    const version = await prisma.agreementVersion.create({
      data: {
        agreementId: agreementId as string,
        versionNumber: parsedVersionNumber,
        isCurrent: shouldBeCurrent,
        effectiveDate: parsedEffectiveDate,
        endDate: parsedEndDate,
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
      include: {
        agreement: {
          include: {
            versions: true,
          },
        },
      },
    });

    if (!existingVersion) {
      return res.status(404).json({ message: "Agreement version not found." });
    }

    const parsedEffectiveDate = asOptionalDate(effectiveDate, "effectiveDate");
    const parsedEndDate = asOptionalDate(endDate, "endDate");

    if (
      parsedEffectiveDate &&
      parsedEndDate &&
      parsedEffectiveDate > parsedEndDate
    ) {
      return res.status(400).json({
        message: "effectiveDate must be before endDate.",
      });
    }

    if (versionNumber !== undefined) {
      const parsedVersionNumber = Number(versionNumber);
      if (!Number.isInteger(parsedVersionNumber) || parsedVersionNumber <= 0) {
        return res.status(400).json({
          message: "versionNumber must be a positive integer.",
        });
      }

      const conflictingVersion = existingVersion.agreement.versions.find(
        (version) =>
          version.id !== existingVersion.id &&
          version.versionNumber === parsedVersionNumber,
      );

      if (conflictingVersion) {
        return res.status(409).json({
          message: "This versionNumber already exists for the agreement.",
        });
      }
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
        versionNumber:
          versionNumber !== undefined ? Number(versionNumber) : undefined,
        isCurrent: isCurrent ?? undefined,
        effectiveDate: parsedEffectiveDate,
        endDate: parsedEndDate,
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
      include: {
        serviceTerms: {
          select: { id: true },
        },
      },
    });

    if (!existingVersion) {
      return res.status(404).json({ message: "Agreement version not found." });
    }

    if (existingVersion.serviceTerms.length > 0) {
      return res.status(400).json({
        message:
          "Agreement version cannot be deleted while service terms are linked to it.",
      });
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
