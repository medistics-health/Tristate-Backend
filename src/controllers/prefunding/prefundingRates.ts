import { Response } from "express";
import { prisma } from "../../lib/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";

const SUPPORTED_PRICING_MODELS = [
  "Addition",
  "Subtraction",
  "Multiplication",
  "Division",
  "Percentage",
  "Flat Fee"
];

export async function getPrefundingRates(req: AuthenticatedRequest, res: Response) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const { search, pricingModel, practiceId, sortBy, sortOrder } = req.query;
    const orderDir = (sortOrder as string)?.toLowerCase() === "asc" ? "asc" : "desc";
    let orderBy: any = { createdAt: orderDir };
    
    if (sortBy) {
      if (sortBy === "name" || sortBy === "basis" || sortBy === "pricingModel" || sortBy === "rate") {
        orderBy = { [sortBy as string]: orderDir };
      }
    }

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: "insensitive" } },
        { basis: { contains: search as string, mode: "insensitive" } },
        { pricingModel: { contains: search as string, mode: "insensitive" } },
      ];
    }

    if (pricingModel) {
      where.pricingModel = pricingModel as string;
    }

    if (practiceId) {
      where.practiceRates = {
        some: {
          practiceId: practiceId as string
        }
      };
    }

    const [rates, totalRecords] = await Promise.all([
      prisma.prefundingRate.findMany({
        where,
        include: {
          practiceRates: {
            include: { practice: true }
          }
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.prefundingRate.count({ where }),
    ]);

    const totalPages = Math.ceil(totalRecords / limit);

    return res.status(200).json({ 
      rates, 
      pagination: {
        totalRecords,
        totalPages,
        currentPage: page,
        limit
      } 
    });
  } catch (error: any) {
    return res.status(500).json({ message: "Failed to fetch prefunding rates", error: error.message });
  }
}

export async function createPrefundingRate(req: AuthenticatedRequest, res: Response) {
  try {
    const { name, basis, pricingModel, rate, practiceIds } = req.body;

    if (!name || !basis || !pricingModel || rate === undefined) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (!SUPPORTED_PRICING_MODELS.includes(pricingModel)) {
      return res.status(400).json({ message: `Invalid pricing model. Supported models are: ${SUPPORTED_PRICING_MODELS.join(", ")}` });
    }

    const prefundingRate = await prisma.prefundingRate.create({
      data: {
        name,
        basis,
        pricingModel,
        rate,
        practiceRates: practiceIds && practiceIds.length > 0 ? {
          create: practiceIds.map((id: string) => ({ practiceId: id }))
        } : undefined
      },
      include: {
        practiceRates: { include: { practice: true } }
      }
    });

    return res.status(201).json({ message: "Prefunding rate created", prefundingRate });
  } catch (error: any) {
    return res.status(500).json({ message: "Failed to create prefunding rate", error: error.message });
  }
}

export async function updatePrefundingRate(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string;
    const { name, basis, pricingModel, rate, practiceIds } = req.body;

    if (pricingModel && !SUPPORTED_PRICING_MODELS.includes(pricingModel)) {
      return res.status(400).json({ message: `Invalid pricing model. Supported models are: ${SUPPORTED_PRICING_MODELS.join(", ")}` });
    }

    // Update the rate
    const updatedRate = await prisma.prefundingRate.update({
      where: { id },
      data: {
        name,
        basis,
        pricingModel,
        rate,
        // If practiceIds is provided, we sync them
        ...(practiceIds !== undefined && {
          practiceRates: {
            deleteMany: {}, // delete old mappings
            create: practiceIds.map((pId: string) => ({ practiceId: pId }))
          }
        })
      },
      include: {
        practiceRates: { include: { practice: true } }
      }
    });

    return res.status(200).json({ message: "Prefunding rate updated", prefundingRate: updatedRate });
  } catch (error: any) {
    return res.status(500).json({ message: "Failed to update prefunding rate", error: error.message });
  }
}

export async function deletePrefundingRate(req: AuthenticatedRequest, res: Response) {
  try {
    const id = req.params.id as string;
    await prisma.prefundingRate.delete({ where: { id } });
    return res.status(200).json({ message: "Prefunding rate deleted" });
  } catch (error: any) {
    return res.status(500).json({ message: "Failed to delete prefunding rate", error: error.message });
  }
}
