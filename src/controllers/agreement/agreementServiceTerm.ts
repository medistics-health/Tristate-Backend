import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { PricingModel } from "../../../generated/prisma/client";

function isPricingModel(value: string): value is PricingModel {
  return Object.values(PricingModel).includes(value as PricingModel);
}

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

function asNonNegativeNumber(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function validatePricingConfig(
  pricingModel: PricingModel,
  pricingConfig: Record<string, unknown>,
) {
  const fail = (message: string) => ({ valid: false as const, message });
  const hasNonNegative = (value: unknown) => asNonNegativeNumber(value) !== null;

  switch (pricingModel) {
    case PricingModel.FIXED_MONTHLY:
    case PricingModel.FIXED_ONE_TIME:
    case PricingModel.RETAINER:
      if (!hasNonNegative(pricingConfig.amount)) {
        return fail("Amount is required and must be 0 or greater.");
      }
      return { valid: true as const };

    case PricingModel.PERCENT_COLLECTIONS:
    case PricingModel.PERCENT_REVENUE:
    case PricingModel.PERCENT_PROFIT:
    case PricingModel.SUCCESS_FEE:
      if (
        !hasNonNegative(pricingConfig.percentage) &&
        !hasNonNegative(pricingConfig.ratePercent) &&
        !hasNonNegative(pricingConfig.rate)
      ) {
        return fail("Percentage is required and must be 0 or greater.");
      }
      return { valid: true as const };

    case PricingModel.PER_UNIT:
    case PricingModel.PER_ENCOUNTER:
    case PricingModel.PER_PATIENT:
    case PricingModel.PER_PROVIDER:
    case PricingModel.PER_SITE:
      if (!hasNonNegative(pricingConfig.unitRate) && !hasNonNegative(pricingConfig.rate)) {
        return fail("Rate is required and must be 0 or greater.");
      }
      return { valid: true as const };

    case PricingModel.PER_CPT_CODE: {
      const cptCodes = Array.isArray(pricingConfig.cptCodes) ? pricingConfig.cptCodes : [];
      if (cptCodes.length === 0) {
        return fail("At least one CPT code is required.");
      }
      const invalidRow = cptCodes.find((row) => {
        if (!row || typeof row !== "object") return true;
        const code = String((row as Record<string, unknown>).code ?? "").trim();
        return !code || asNonNegativeNumber((row as Record<string, unknown>).rate) === null;
      });
      if (invalidRow) {
        return fail("Each CPT entry must include a code and a non-negative rate.");
      }
      return { valid: true as const };
    }

    case PricingModel.HYBRID:
    case PricingModel.MULTI_COMPONENT: {
      const components = Array.isArray(pricingConfig.components)
        ? pricingConfig.components
        : [];
      if (components.length === 0) {
        return fail("At least one hybrid component is required.");
      }
      const invalidComponent = components.find((component) => {
        if (!component || typeof component !== "object") return true;
        return asNonNegativeNumber((component as Record<string, unknown>).value) === null;
      });
      if (invalidComponent) {
        return fail("Each hybrid component must have a non-negative value.");
      }
      return { valid: true as const };
    }

    default:
      return { valid: true as const };
  }
}

async function findOverlappingActiveTerm(params: {
  agreementId: string;
  serviceId: string;
  vendorId?: string | null;
  pricingModel: PricingModel;
  effectiveDate?: Date;
  endDate?: Date;
  excludeId?: string;
}) {
  const { agreementId, serviceId, vendorId, pricingModel, effectiveDate, endDate, excludeId } = params;

  return prisma.agreementServiceTerm.findFirst({
    where: {
      agreementId,
      serviceId,
      vendorId: vendorId || null,
      pricingModel,
      isActive: true,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
      AND: [
        {
          OR: [{ effectiveDate: null }, { effectiveDate: { lte: endDate ?? new Date("9999-12-31T23:59:59.999Z") } }],
        },
        {
          OR: [{ endDate: null }, { endDate: { gte: effectiveDate ?? new Date("1900-01-01T00:00:00.000Z") } }],
        },
      ],
    },
    select: { id: true },
  });
}

export async function getAgreementServiceTerms(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const agreementId = req.query.agreementId as string;
    const agreementVersionId = req.query.agreementVersionId as string;
    const serviceId = req.query.serviceId as string;

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (agreementId) where.agreementId = agreementId;
    if (agreementVersionId) where.agreementVersionId = agreementVersionId;
    if (serviceId) where.serviceId = serviceId;

    const [terms, totalRecords] = await Promise.all([
      prisma.agreementServiceTerm.findMany({
        where,
        include: {
          agreement: true,
          agreementVersion: true,
          service: true,
          vendor: true,
        },
        skip,
        take: limit,
        orderBy: {
          priority: "asc",
        },
      }),
      prisma.agreementServiceTerm.count({ where }),
    ]);

    const totalPages = Math.ceil(totalRecords / limit);

    return res.status(200).json({
      message: "Agreement service terms fetched successfully.",
      terms,
      pagination: {
        totalRecords,
        totalPages,
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch agreement service terms.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getAgreementServiceTerm(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const term = await prisma.agreementServiceTerm.findUnique({
      where: { id },
      include: {
        agreement: true,
        agreementVersion: true,
        service: true,
        vendor: true,
      },
    });

    if (!term) {
      return res.status(404).json({ message: "Agreement service term not found." });
    }

    return res.status(200).json({
      message: "Agreement service term fetched successfully.",
      term,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch agreement service term.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function createAgreementServiceTerm(req: AuthenticatedRequest, res: Response) {
  try {
    const {
      agreementId,
      agreementVersionId,
      serviceId,
      vendorId,
      pricingModel,
      pricingConfig,
      currency,
      priority,
      minimumFee,
      effectiveDate,
      endDate,
      isActive,
      externalReference,
    } = req.body;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!agreementId || !agreementVersionId || !serviceId || !pricingModel || !pricingConfig) {
      return res.status(400).json({
        message:
          "agreementId, agreementVersionId, serviceId, pricingModel and pricingConfig are required.",
      });
    }

    if (!isPricingModel(pricingModel)) {
      return res.status(400).json({
        message: "Invalid pricing model.",
        allowedModels: Object.values(PricingModel),
      });
    }

    if (typeof pricingConfig !== "object" || pricingConfig === null || Array.isArray(pricingConfig)) {
      return res.status(400).json({
        message: "pricingConfig must be a valid object.",
      });
    }

    const pricingValidation = validatePricingConfig(
      pricingModel,
      pricingConfig as Record<string, unknown>,
    );

    if (!pricingValidation.valid) {
      return res.status(400).json({ message: pricingValidation.message });
    }

    if (minimumFee !== undefined && minimumFee !== null && asNonNegativeNumber(minimumFee) === null) {
      return res.status(400).json({
        message: "Vendor rate must be 0 or greater.",
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

    const agreementVersion = await prisma.agreementVersion.findUnique({
      where: { id: agreementVersionId as string },
    });

    if (!agreementVersion || agreementVersion.agreementId !== agreement.id) {
      return res.status(404).json({
        message: "Agreement version not found for this agreement.",
      });
    }

    const service = await prisma.service.findUnique({
      where: { id: serviceId as string },
    });

    if (!service) {
      return res.status(404).json({ message: "Service not found." });
    }

    if (vendorId) {
      const vendor = await prisma.vendor.findUnique({
        where: { id: vendorId as string },
      });

      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found." });
      }
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

    if (
      parsedEffectiveDate &&
      agreementVersion.endDate &&
      parsedEffectiveDate > agreementVersion.endDate
    ) {
      return res.status(400).json({
        message:
          "Service term effectiveDate cannot start after the agreement version endDate.",
      });
    }

    if (
      parsedEndDate &&
      agreementVersion.effectiveDate &&
      parsedEndDate < agreementVersion.effectiveDate
    ) {
      return res.status(400).json({
        message:
          "Service term endDate cannot end before the agreement version effectiveDate.",
      });
    }

    if (isActive ?? true) {
      const overlappingTerm = await findOverlappingActiveTerm({
        agreementId: agreementId as string,
        serviceId: serviceId as string,
        vendorId: (vendorId as string) || null,
        pricingModel,
        effectiveDate: parsedEffectiveDate,
        endDate: parsedEndDate,
      });

      if (overlappingTerm) {
        return res.status(400).json({
          message:
            "An active pricing term with overlapping effective dates already exists for this agreement, service, vendor, and pricing model.",
        });
      }
    }

    const term = await prisma.agreementServiceTerm.create({
      data: {
        agreementId: agreementId as string,
        agreementVersionId: agreementVersionId as string,
        serviceId: serviceId as string,
        vendorId: (vendorId as string) || null,
        pricingModel,
        pricingConfig,
        currency: currency || "USD",
        priority: priority ?? 1,
        minimumFee: minimumFee ?? undefined,
        effectiveDate: parsedEffectiveDate,
        endDate: parsedEndDate,
        isActive: isActive ?? true,
        externalReference,
      },
    });

    return res.status(201).json({
      message: "Agreement service term created successfully.",
      term,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to create agreement service term.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updateAgreementServiceTerm(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string;
    const {
      agreementVersionId,
      serviceId,
      vendorId,
      pricingModel,
      pricingConfig,
      currency,
      priority,
      minimumFee,
      effectiveDate,
      endDate,
      isActive,
      externalReference,
    } = req.body;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (pricingModel && !isPricingModel(pricingModel)) {
      return res.status(400).json({
        message: "Invalid pricing model.",
        allowedModels: Object.values(PricingModel),
      });
    }

    const existingTerm = await prisma.agreementServiceTerm.findUnique({
      where: { id },
      include: {
        agreement: {
          include: {
            versions: true,
          },
        },
      },
    });

    if (!existingTerm) {
      return res.status(404).json({ message: "Agreement service term not found." });
    }

    const nextPricingModel = pricingModel ?? existingTerm.pricingModel;
    const nextPricingConfig =
      pricingConfig !== undefined
        ? pricingConfig
        : (existingTerm.pricingConfig as Record<string, unknown>);

    if (
      typeof nextPricingConfig !== "object" ||
      nextPricingConfig === null ||
      Array.isArray(nextPricingConfig)
    ) {
      return res.status(400).json({
        message: "pricingConfig must be a valid object.",
      });
    }

    const pricingValidation = validatePricingConfig(
      nextPricingModel,
      nextPricingConfig as Record<string, unknown>,
    );

    if (!pricingValidation.valid) {
      return res.status(400).json({ message: pricingValidation.message });
    }

    const nextMinimumFee = minimumFee !== undefined ? minimumFee : existingTerm.minimumFee;
    if (
      nextMinimumFee !== undefined &&
      nextMinimumFee !== null &&
      asNonNegativeNumber(nextMinimumFee) === null
    ) {
      return res.status(400).json({
        message: "Vendor rate must be 0 or greater.",
      });
    }

    const nextAgreementVersionId =
      agreementVersionId !== undefined
        ? (agreementVersionId as string)
        : existingTerm.agreementVersionId;

    if (!nextAgreementVersionId) {
      return res.status(400).json({
        message: "agreementVersionId is required for agreement service terms.",
      });
    }

    const agreementVersion = await prisma.agreementVersion.findUnique({
      where: { id: nextAgreementVersionId },
    });

    if (
      !agreementVersion ||
      agreementVersion.agreementId !== existingTerm.agreementId
    ) {
      return res.status(404).json({
        message: "Agreement version not found for this agreement.",
      });
    }

    if (serviceId) {
      const service = await prisma.service.findUnique({
        where: { id: serviceId as string },
      });

      if (!service) {
        return res.status(404).json({ message: "Service not found." });
      }
    }

    if (vendorId) {
      const vendor = await prisma.vendor.findUnique({
        where: { id: vendorId as string },
      });

      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found." });
      }
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

    const nextEffectiveDate =
      parsedEffectiveDate ?? existingTerm.effectiveDate ?? undefined;
    const nextEndDate = parsedEndDate ?? existingTerm.endDate ?? undefined;

    if (
      nextEffectiveDate &&
      agreementVersion.endDate &&
      nextEffectiveDate > agreementVersion.endDate
    ) {
      return res.status(400).json({
        message:
          "Service term effectiveDate cannot start after the agreement version endDate.",
      });
    }

    if (
      nextEndDate &&
      agreementVersion.effectiveDate &&
      nextEndDate < agreementVersion.effectiveDate
    ) {
      return res.status(400).json({
        message:
          "Service term endDate cannot end before the agreement version effectiveDate.",
      });
    }

    const nextServiceId = serviceId ? (serviceId as string) : existingTerm.serviceId;
    const nextVendorId =
      vendorId !== undefined ? ((vendorId as string) || null) : existingTerm.vendorId;
    const nextIsActive = isActive ?? existingTerm.isActive;

    if (nextIsActive) {
      const overlappingTerm = await findOverlappingActiveTerm({
        agreementId: existingTerm.agreementId,
        serviceId: nextServiceId,
        vendorId: nextVendorId,
        pricingModel: nextPricingModel,
        effectiveDate: nextEffectiveDate ?? undefined,
        endDate: nextEndDate ?? undefined,
        excludeId: id,
      });

      if (overlappingTerm) {
        return res.status(400).json({
          message:
            "An active pricing term with overlapping effective dates already exists for this agreement, service, vendor, and pricing model.",
        });
      }
    }

    const term = await prisma.agreementServiceTerm.update({
      where: { id },
      data: {
        agreementVersionId: nextAgreementVersionId,
        serviceId: serviceId ? (serviceId as string) : undefined,
        vendorId: vendorId !== undefined ? ((vendorId as string) || null) : undefined,
        pricingModel: pricingModel ?? undefined,
        pricingConfig: pricingConfig ?? undefined,
        currency: currency ?? undefined,
        priority: priority ?? undefined,
        minimumFee: minimumFee ?? undefined,
        effectiveDate: parsedEffectiveDate,
        endDate: parsedEndDate,
        isActive: isActive ?? undefined,
        externalReference: externalReference ?? undefined,
      },
    });

    return res.status(200).json({
      message: "Agreement service term updated successfully.",
      term,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to update agreement service term.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function deleteAgreementServiceTerm(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const existingTerm = await prisma.agreementServiceTerm.findUnique({
      where: { id },
    });

    if (!existingTerm) {
      return res.status(404).json({ message: "Agreement service term not found." });
    }

    await prisma.agreementServiceTerm.delete({
      where: { id },
    });

    return res.status(200).json({
      message: "Agreement service term deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete agreement service term.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
