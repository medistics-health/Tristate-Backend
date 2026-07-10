import { Response } from "express";
import { prisma } from "../../lib/prisma";
import { stripe } from "../../lib/stripe";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

type ServiceBody = {
  name?: string;
  code?: string | null;
  category?: string | null;
  stripeConnectedAccountId?: string | null;
  vendorId?: string | null;
  isActive?: boolean;
  clientRate?: number;
  vendorRate?: number;
  margin?: number;
};

function serializeService<T extends Record<string, unknown>>(service: T) {
  return {
    ...service,
    // clientRate: null,
    // vendorRate: null,
    // margin: null,
  };
}

function hasDeprecatedPricingFields(body: ServiceBody) {
  return (
    body.clientRate !== undefined ||
    body.vendorRate !== undefined ||
    body.margin !== undefined
  );
}

async function ensureValidStripeConnectedAccount(stripeConnectedAccountId: string) {
  const account = await stripe.accounts.retrieve(stripeConnectedAccountId);
  if ((account as any).deleted) {
    throw new Error("Stripe connected account is deleted.");
  }
  return account;
}

export async function createService(req: AuthenticatedRequest, res: Response) {
  try {
    const {
      name,
      code,
      category,
      stripeConnectedAccountId,
      vendorId,
      isActive,
      // clientRate,
      // vendorRate,
      // margin,
    } = req.body as ServiceBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!name) {
      return res.status(400).json({
        message: "name is required.",
      });
    }

    if (!stripeConnectedAccountId) {
      return res.status(400).json({
        message: "stripeConnectedAccountId is required.",
      });
    }

    try {
      await ensureValidStripeConnectedAccount(stripeConnectedAccountId);
    } catch (error) {
      return res.status(400).json({
        message: "Invalid Stripe connected account.",
        error: error instanceof Error ? error.message : error,
      });
    }

    if (vendorId) {
      const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found." });
      }
    }

    if (stripeConnectedAccountId !== undefined && stripeConnectedAccountId) {
      try {
        await ensureValidStripeConnectedAccount(stripeConnectedAccountId);
      } catch (error) {
        return res.status(400).json({
          message: "Invalid Stripe connected account.",
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    const service = await prisma.service.create({
      data: {
        name,
        ...(code !== undefined ? { code: code || null } : {}),
        ...(category !== undefined ? { category: category || null } : {}),
        stripeConnectedAccountId,
        ...(vendorId !== undefined ? { vendorId: vendorId || null } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
      include: { vendor: true },
    });

    return res.status(201).json({
      message: "Service created successfully.",
      service: serializeService(service),
      // ...(hasDeprecatedPricingFields({ clientRate, vendorRate, margin })
      //   ? {
      //       warning:
      //         "clientRate, vendorRate, and margin are deprecated and ignored. Configure pricing through agreement service terms.",
      //     }
      //   : {}),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to create service.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getService(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Service id is required." });
    }

    const service = await prisma.service.findUnique({
      where: { id },
      include: { lineItems: true, vendor: true },
    });

    if (!service) {
      return res.status(404).json({ message: "Service not found." });
    }

    return res.status(200).json({
      message: "Service fetched successfully.",
      service: serializeService(service),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch service.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updateService(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { name, code, category, stripeConnectedAccountId, vendorId, isActive, clientRate, vendorRate, margin } =
      req.body as ServiceBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Service id is required." });
    }

    const existingService = await prisma.service.findUnique({ where: { id } });

    if (!existingService) {
      return res.status(404).json({ message: "Service not found." });
    }

    if (vendorId) {
      const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found." });
      }
    }

    const service = await prisma.service.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(code !== undefined ? { code: code || null } : {}),
        ...(category !== undefined ? { category: category || null } : {}),
        ...(stripeConnectedAccountId !== undefined
          ? { stripeConnectedAccountId: stripeConnectedAccountId || null }
          : {}),
        ...(vendorId !== undefined ? { vendorId: vendorId || null } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
      include: { vendor: true },
    });

    return res.status(200).json({
      message: "Service updated successfully.",
      service: serializeService(service),
      ...(hasDeprecatedPricingFields({ clientRate, vendorRate, margin })
        ? {
            warning:
              "clientRate, vendorRate, and margin are deprecated and ignored. Configure pricing through agreement service terms.",
          }
        : {}),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to update service.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function deleteService(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Service id is required." });
    }

    const existingService = await prisma.service.findUnique({ where: { id } });

    if (!existingService) {
      return res.status(404).json({ message: "Service not found." });
    }

    await prisma.service.delete({ where: { id } });

    return res.status(200).json({ message: "Service deleted successfully." });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete service.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getAllServices(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 1000;
    const search = (req.query.search as string) || "";

    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    const [services, total] = await Promise.all([
      prisma.service.findMany({
        where,
        include: { vendor: true },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.service.count({ where }),
    ]);

    return res.status(200).json({
      message: "Services fetched successfully.",
      services: services.map((service) => serializeService(service)),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch services.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
