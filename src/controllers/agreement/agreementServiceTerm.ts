import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { PricingModel } from "../../../generated/prisma/client";

function isPricingModel(value: string): value is PricingModel {
  return Object.values(PricingModel).includes(value as PricingModel);
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

    if (!agreementId || !serviceId || !pricingModel || !pricingConfig) {
      return res.status(400).json({
        message: "agreementId, serviceId, pricingModel and pricingConfig are required.",
      });
    }

    if (!isPricingModel(pricingModel)) {
      return res.status(400).json({
        message: "Invalid pricing model.",
        allowedModels: Object.values(PricingModel),
      });
    }

    const term = await prisma.agreementServiceTerm.create({
      data: {
        agreementId: agreementId as string,
        agreementVersionId: (agreementVersionId as string) || null,
        serviceId: serviceId as string,
        vendorId: (vendorId as string) || null,
        pricingModel,
        pricingConfig,
        currency: currency || "USD",
        priority: priority ?? 1,
        minimumFee: minimumFee ?? undefined,
        effectiveDate: effectiveDate ? new Date(effectiveDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
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
    });

    if (!existingTerm) {
      return res.status(404).json({ message: "Agreement service term not found." });
    }

    const term = await prisma.agreementServiceTerm.update({
      where: { id },
      data: {
        agreementVersionId: agreementVersionId !== undefined ? (agreementVersionId as string) : undefined,
        serviceId: serviceId ? (serviceId as string) : undefined,
        vendorId: vendorId !== undefined ? (vendorId as string) : undefined,
        pricingModel: pricingModel ?? undefined,
        pricingConfig: pricingConfig ?? undefined,
        currency: currency ?? undefined,
        priority: priority ?? undefined,
        minimumFee: minimumFee ?? undefined,
        effectiveDate: effectiveDate ? new Date(effectiveDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
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
