import { Response } from "express";
import {
  InsuranceCarrierType,
  InsurancePlanType,
  InsuranceStatus,
  Prisma,
} from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

type InsuranceTelecomInput = {
  system?: string;
  value?: string;
  use?: string | null;
};

type InsuranceAddressInput = {
  line?: string[];
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

type InsuranceContactInput = {
  role?: string | null;
  name?: string;
  telecom?: InsuranceTelecomInput[];
  address?: InsuranceAddressInput | null;
};

type InsurancePlanInput = {
  id?: string;
  planName?: string;
  planCode?: string;
  planType?: string;
  status?: string;
  address?: InsuranceAddressInput | null;
  notes?: string | null;
};

type InsuranceCarrierBody = {
  carrierName?: string;
  carrierCode?: string;
  carrierType?: string;
  status?: string;
  website?: string | null;
  telecom?: InsuranceTelecomInput[];
  address?: InsuranceAddressInput | null;
  notes?: string | null;
  contacts?: InsuranceContactInput[];
  plans?: InsurancePlanInput[];
};

type InsurancePlanCreateBody = {
  carrierId?: string;
  plans?: InsurancePlanInput[];
};

const carrierTypeLabels: Record<InsuranceCarrierType, string> = {
  COMMERCIAL: "Commercial",
  GOVERNMENT: "Government",
  MEDICARE: "Medicare",
  MEDICAID: "Medicaid",
  TPA: "TPA",
  MANAGED_CARE: "Managed Care",
  OTHER: "Other",
};

const planTypeLabels: Record<InsurancePlanType, string> = {
  HMO: "HMO",
  PPO: "PPO",
  POS: "POS",
  EPO: "EPO",
  INDEMNITY: "Indemnity",
  OTHER: "Other",
};

const statusLabels: Record<InsuranceStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

const contactRoleOptions = new Set([
  "Administrative",
  "Billing",
  "Claims",
  "Customer Service",
  "Provider Relations",
  "Technical Support",
  "General Contact",
  "Other",
]);

const telecomSystemOptions = new Set([
  "Phone",
  "Mobile",
  "Fax",
  "Email",
  "Website",
]);

function normalizeKey(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseCarrierType(value?: string | null) {
  if (!value) return undefined;
  const normalized = normalizeKey(value);
  const map: Record<string, InsuranceCarrierType> = {
    COMMERCIAL: InsuranceCarrierType.COMMERCIAL,
    GOVERNMENT: InsuranceCarrierType.GOVERNMENT,
    MEDICARE: InsuranceCarrierType.MEDICARE,
    MEDICAID: InsuranceCarrierType.MEDICAID,
    TPA: InsuranceCarrierType.TPA,
    MANAGED_CARE: InsuranceCarrierType.MANAGED_CARE,
    OTHER: InsuranceCarrierType.OTHER,
  };
  return map[normalized];
}

function parsePlanType(value?: string | null) {
  if (!value) return undefined;
  const normalized = normalizeKey(value);
  const map: Record<string, InsurancePlanType> = {
    HMO: InsurancePlanType.HMO,
    PPO: InsurancePlanType.PPO,
    POS: InsurancePlanType.POS,
    EPO: InsurancePlanType.EPO,
    INDEMNITY: InsurancePlanType.INDEMNITY,
    OTHER: InsurancePlanType.OTHER,
  };
  return map[normalized];
}

function parseStatus(value?: string | null) {
  if (!value) return undefined;
  const normalized = normalizeKey(value);
  const map: Record<string, InsuranceStatus> = {
    ACTIVE: InsuranceStatus.ACTIVE,
    INACTIVE: InsuranceStatus.INACTIVE,
  };
  return map[normalized];
}

function sanitizeAddress(
  input?: InsuranceAddressInput | null,
): Prisma.InputJsonValue | undefined {
  if (!input) return undefined;

  const line = Array.isArray(input.line)
    ? input.line.map((entry) => (entry || "").trim()).filter(Boolean)
    : [];
  const city = input.city?.trim() || "";
  const state = input.state?.trim() || "";
  const postalCode = input.postalCode?.trim() || "";
  const country = input.country?.trim() || "";

  if (!line.length && !city && !state && !postalCode && !country) {
    return undefined;
  }

  return {
    line,
    city,
    state,
    postalCode,
    country,
  };
}

function sanitizeTelecom(
  telecom?: InsuranceTelecomInput[],
): Prisma.InputJsonValue | undefined {
  if (!Array.isArray(telecom)) return undefined;

  const normalized = telecom
    .map((entry) => ({
      system: entry.system?.trim() || "",
      value: entry.value?.trim() || "",
      use: entry.use?.trim() || "",
    }))
    .filter((entry) => entry.system && entry.value)
    .map((entry) => ({
      system: telecomSystemOptions.has(entry.system) ? entry.system : "Phone",
      value: entry.value,
      use: entry.use || null,
    }));

  return normalized.length ? normalized : undefined;
}

function sanitizeContacts(
  contacts?: InsuranceContactInput[],
): Prisma.InputJsonValue | undefined {
  if (!Array.isArray(contacts)) return undefined;

  const normalized = contacts
    .map((contact) => ({
      role: contact.role?.trim() || "",
      name: contact.name?.trim() || "",
      telecom: sanitizeTelecom(contact.telecom),
      address: sanitizeAddress(contact.address),
    }))
    .filter((contact) => contact.name)
    .map((contact) => ({
      role: contact.role && contactRoleOptions.has(contact.role)
        ? contact.role
        : contact.role || null,
      name: contact.name,
      telecom: contact.telecom,
      address: contact.address,
    }));

  return normalized.length ? normalized : undefined;
}

function mapCarrier(carrier: {
  id: string;
  carrierName: string;
  carrierCode: string;
  carrierType: InsuranceCarrierType;
  status: InsuranceStatus;
  website: string | null;
  telecom: Prisma.JsonValue | null;
  address: Prisma.JsonValue | null;
  notes: string | null;
  contacts: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  plans?: Array<{
    id: string;
    carrierId: string;
    planName: string;
    planCode: string;
    planType: InsurancePlanType;
    status: InsuranceStatus;
    address: Prisma.JsonValue | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
}) {
  return {
    id: carrier.id,
    carrierName: carrier.carrierName,
    carrierCode: carrier.carrierCode,
    carrierType: carrierTypeLabels[carrier.carrierType],
    status: statusLabels[carrier.status],
    website: carrier.website || "",
    telecom: carrier.telecom ?? [],
    address: carrier.address,
    notes: carrier.notes || "",
    contacts: carrier.contacts ?? [],
    createdAt: carrier.createdAt.toISOString(),
    updatedAt: carrier.updatedAt.toISOString(),
    plans: Array.isArray(carrier.plans)
      ? carrier.plans.map((plan) => ({
          id: plan.id,
          carrierId: plan.carrierId,
          planName: plan.planName,
          planCode: plan.planCode,
          planType: planTypeLabels[plan.planType],
          status: statusLabels[plan.status],
          address: plan.address,
          notes: plan.notes || "",
          createdAt: plan.createdAt.toISOString(),
          updatedAt: plan.updatedAt.toISOString(),
        }))
      : [],
  };
}

function mapPlan(plan: {
  id: string;
  carrierId: string;
  planName: string;
  planCode: string;
  planType: InsurancePlanType;
  status: InsuranceStatus;
  address: Prisma.JsonValue | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  carrier?: {
    carrierName: string;
    carrierCode: string;
  };
}) {
  return {
    id: plan.id,
    carrierId: plan.carrierId,
    carrierName: plan.carrier?.carrierName || "",
    carrierCode: plan.carrier?.carrierCode || "",
    planName: plan.planName,
    planCode: plan.planCode,
    planType: planTypeLabels[plan.planType],
    status: statusLabels[plan.status],
    address: plan.address,
    notes: plan.notes || "",
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

function buildCarrierData(body: InsuranceCarrierBody) {
  const carrierName = body.carrierName?.trim();
  const carrierCode = body.carrierCode?.trim();
  const carrierType = parseCarrierType(body.carrierType);
  const status = parseStatus(body.status);

  if (!carrierName) {
    return { error: "Carrier name is required." } as const;
  }
  if (!carrierCode) {
    return { error: "Carrier code is required." } as const;
  }
  if (!carrierType) {
    return { error: "Carrier type is required." } as const;
  }
  if (!status) {
    return { error: "Carrier status is required." } as const;
  }

  return {
    carrierName,
    carrierCode,
    carrierType,
    status,
    website: body.website?.trim() || null,
    telecom: sanitizeTelecom(body.telecom),
    address: sanitizeAddress(body.address),
    notes: body.notes?.trim() || null,
    contacts: sanitizeContacts(body.contacts),
  } satisfies Prisma.InsuranceCarrierUncheckedCreateInput;
}

function buildPlanCreateData(
  plan: InsurancePlanInput,
  carrierId: string,
): Prisma.InsurancePlanUncheckedCreateInput | { error: string } {
  const planName = plan.planName?.trim();
  const planCode = plan.planCode?.trim();
  const planType = parsePlanType(plan.planType);
  const status = parseStatus(plan.status);

  if (!planName) {
    return { error: "Plan name is required." };
  }
  if (!planCode) {
    return { error: "Plan code is required." };
  }
  if (!planType) {
    return { error: "Plan type is required." };
  }
  if (!status) {
    return { error: "Plan status is required." };
  }

  return {
    carrierId,
    planName,
    planCode,
    planType,
    status,
    address: sanitizeAddress(plan.address),
    notes: plan.notes?.trim() || null,
  };
}

async function ensureUniqueCarrierCode(code: string, excludeId?: string) {
  const existing = await prisma.insuranceCarrier.findFirst({
    where: {
      carrierCode: { equals: code, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  return !existing;
}

async function ensureUniquePlanCodes(codes: string[], excludeIds: string[] = []) {
  if (!codes.length) return true;
  const existing = await prisma.insurancePlan.findFirst({
    where: {
      planCode: { in: codes },
      ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
    },
  });
  return !existing;
}

export async function listInsuranceCarriers(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const search = String(req.query.search || "").trim();
    const status = parseStatus(String(req.query.status || ""));
    const carrierType = parseCarrierType(String(req.query.carrierType || ""));

    const carriers = await prisma.insuranceCarrier.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(carrierType ? { carrierType } : {}),
        ...(search
          ? {
              OR: [
                { carrierName: { contains: search, mode: "insensitive" } },
                { carrierCode: { contains: search, mode: "insensitive" } },
                { notes: { contains: search, mode: "insensitive" } },
                {
                  plans: {
                    some: {
                      OR: [
                        { planName: { contains: search, mode: "insensitive" } },
                        { planCode: { contains: search, mode: "insensitive" } },
                      ],
                    },
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        plans: {
          orderBy: [{ planName: "asc" }],
        },
      },
      orderBy: [{ carrierName: "asc" }],
    });

    return res.status(200).json({
      message: "Insurance carriers fetched successfully.",
      carriers: carriers.map(mapCarrier),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch insurance carriers.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function listInsuranceCarrierOptions(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const carriers = await prisma.insuranceCarrier.findMany({
      select: {
        id: true,
        carrierName: true,
        carrierCode: true,
        status: true,
      },
      orderBy: [{ carrierName: "asc" }],
    });

    return res.status(200).json({
      carriers: carriers.map((carrier) => ({
        id: carrier.id,
        carrierName: carrier.carrierName,
        carrierCode: carrier.carrierCode,
        status: statusLabels[carrier.status],
      })),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch insurance carrier options.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function listInsurancePlanOptions(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const plans = await prisma.insurancePlan.findMany({
      where: {
        status: InsuranceStatus.ACTIVE,
      },
      select: {
        id: true,
        planName: true,
        planCode: true,
        planType: true,
        status: true,
      },
      orderBy: [{ planName: "asc" }],
    });

    return res.status(200).json({
      plans: plans.map((plan) => ({
        id: plan.id,
        planName: plan.planName,
        planCode: plan.planCode,
        planType: planTypeLabels[plan.planType],
        status: statusLabels[plan.status],
      })),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch insurance plan options.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function createInsuranceCarrier(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const body = req.body as InsuranceCarrierBody;
    const carrierData = buildCarrierData(body);
    if ("error" in carrierData) {
      return res.status(400).json({ message: carrierData.error });
    }

    const isUniqueCarrierCode = await ensureUniqueCarrierCode(
      carrierData.carrierCode,
    );
    if (!isUniqueCarrierCode) {
      return res.status(400).json({ message: "Carrier code already exists." });
    }

    const plans = Array.isArray(body.plans) ? body.plans : [];
    const planCodes = plans.map((plan) => plan.planCode?.trim() || "").filter(Boolean);
    if (new Set(planCodes).size !== planCodes.length) {
      return res.status(400).json({ message: "Plan codes must be unique." });
    }

    const areUniquePlanCodes = await ensureUniquePlanCodes(planCodes);
    if (!areUniquePlanCodes) {
      return res.status(400).json({ message: "One or more plan codes already exist." });
    }

    const created = await prisma.$transaction(async (tx) => {
      const carrier = await tx.insuranceCarrier.create({
        data: carrierData,
      });

      const planRows: Prisma.InsurancePlanUncheckedCreateInput[] = [];
      for (const plan of plans) {
        const planData = buildPlanCreateData(plan, carrier.id);
        if ("error" in planData) {
          throw new Error(planData.error);
        }
        planRows.push(planData);
      }

      if (planRows.length) {
        await tx.insurancePlan.createMany({ data: planRows });
      }

      return tx.insuranceCarrier.findUniqueOrThrow({
        where: { id: carrier.id },
        include: {
          plans: {
            orderBy: [{ planName: "asc" }],
          },
        },
      });
    });

    return res.status(201).json({
      message: "Insurance carrier created successfully.",
      carrier: mapCarrier(created),
    });
  } catch (error) {
    return res.status(500).json({
      message:
        error instanceof Error && error.message
          ? error.message
          : "Unable to create insurance carrier.",
    });
  }
}

export async function updateInsuranceCarrier(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const carrierId = String(req.params.id);
    const existing = await prisma.insuranceCarrier.findUnique({
      where: { id: carrierId },
      include: {
        plans: true,
      },
    });

    if (!existing) {
      return res.status(404).json({ message: "Insurance carrier not found." });
    }

    const body = req.body as InsuranceCarrierBody;
    const carrierData = buildCarrierData({
      ...body,
      carrierName: body.carrierName ?? existing.carrierName,
      carrierCode: body.carrierCode ?? existing.carrierCode,
      carrierType: body.carrierType ?? existing.carrierType,
      status: body.status ?? existing.status,
      website: body.website ?? existing.website,
      telecom: body.telecom ?? ((existing.telecom as InsuranceTelecomInput[]) || []),
      address: body.address ?? ((existing.address as InsuranceAddressInput) || null),
      notes: body.notes ?? existing.notes,
      contacts: body.contacts ?? ((existing.contacts as InsuranceContactInput[]) || []),
    });
    if ("error" in carrierData) {
      return res.status(400).json({ message: carrierData.error });
    }

    const isUniqueCarrierCode = await ensureUniqueCarrierCode(
      carrierData.carrierCode,
      carrierId,
    );
    if (!isUniqueCarrierCode) {
      return res.status(400).json({ message: "Carrier code already exists." });
    }

    const plansInput = Array.isArray(body.plans) ? body.plans : null;
    if (plansInput) {
      const planCodes = plansInput
        .map((plan) => plan.planCode?.trim() || "")
        .filter(Boolean);
      if (new Set(planCodes).size !== planCodes.length) {
        return res.status(400).json({ message: "Plan codes must be unique." });
      }

      const areUniquePlanCodes = await ensureUniquePlanCodes(
        planCodes,
        plansInput.map((plan) => plan.id || "").filter(Boolean),
      );
      if (!areUniquePlanCodes) {
        return res.status(400).json({ message: "One or more plan codes already exist." });
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.insuranceCarrier.update({
        where: { id: carrierId },
        data: carrierData,
      });

      if (plansInput) {
        const keepIds = plansInput.map((plan) => plan.id).filter(Boolean) as string[];
        await tx.insurancePlan.deleteMany({
          where: {
            carrierId,
            ...(keepIds.length ? { id: { notIn: keepIds } } : {}),
          },
        });

        for (const plan of plansInput) {
          const planData = buildPlanCreateData(plan, carrierId);
          if ("error" in planData) {
            throw new Error(planData.error);
          }

          if (plan.id) {
            await tx.insurancePlan.update({
              where: { id: plan.id },
              data: planData,
            });
          } else {
            await tx.insurancePlan.create({
              data: planData,
            });
          }
        }
      }

      return tx.insuranceCarrier.findUniqueOrThrow({
        where: { id: carrierId },
        include: {
          plans: {
            orderBy: [{ planName: "asc" }],
          },
        },
      });
    });

    return res.status(200).json({
      message: "Insurance carrier updated successfully.",
      carrier: mapCarrier(updated),
    });
  } catch (error) {
    return res.status(500).json({
      message:
        error instanceof Error && error.message
          ? error.message
          : "Unable to update insurance carrier.",
    });
  }
}

export async function deleteInsuranceCarrier(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const carrierId = String(req.params.id);
    const existing = await prisma.insuranceCarrier.findUnique({
      where: { id: carrierId },
    });

    if (!existing) {
      return res.status(404).json({ message: "Insurance carrier not found." });
    }

    await prisma.insuranceCarrier.delete({
      where: { id: carrierId },
    });

    return res.status(200).json({
      message: "Insurance carrier deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete insurance carrier.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function createInsurancePlans(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const body = req.body as InsurancePlanCreateBody;
    const carrierId = body.carrierId?.trim();
    if (!carrierId) {
      return res.status(400).json({ message: "Carrier is required." });
    }

    const carrier = await prisma.insuranceCarrier.findUnique({
      where: { id: carrierId },
    });
    if (!carrier) {
      return res.status(404).json({ message: "Selected carrier not found." });
    }

    const plans = Array.isArray(body.plans) ? body.plans : [];
    if (!plans.length) {
      return res.status(400).json({ message: "At least one plan is required." });
    }

    const planCodes = plans.map((plan) => plan.planCode?.trim() || "").filter(Boolean);
    if (new Set(planCodes).size !== planCodes.length) {
      return res.status(400).json({ message: "Plan codes must be unique." });
    }

    const areUniquePlanCodes = await ensureUniquePlanCodes(planCodes);
    if (!areUniquePlanCodes) {
      return res.status(400).json({ message: "One or more plan codes already exist." });
    }

    const createdPlans: ReturnType<typeof mapPlan>[] = [];
    await prisma.$transaction(async (tx) => {
      for (const plan of plans) {
        const planData = buildPlanCreateData(plan, carrierId);
        if ("error" in planData) {
          throw new Error(planData.error);
        }

        const created = await tx.insurancePlan.create({
          data: planData,
          include: {
            carrier: {
              select: {
                carrierName: true,
                carrierCode: true,
              },
            },
          },
        });
        createdPlans.push(mapPlan(created));
      }
    });

    return res.status(201).json({
      message: "Insurance plan created successfully.",
      plans: createdPlans,
    });
  } catch (error) {
    return res.status(500).json({
      message:
        error instanceof Error && error.message
          ? error.message
          : "Unable to create insurance plan.",
    });
  }
}

export async function updateInsurancePlan(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const planId = String(req.params.id);
    const existing = await prisma.insurancePlan.findUnique({
      where: { id: planId },
      include: {
        carrier: {
          select: {
            carrierName: true,
            carrierCode: true,
          },
        },
      },
    });

    if (!existing) {
      return res.status(404).json({ message: "Insurance plan not found." });
    }

    const body = req.body as InsurancePlanInput & { carrierId?: string };
    const carrierId = body.carrierId?.trim() || existing.carrierId;
    const carrier = await prisma.insuranceCarrier.findUnique({
      where: { id: carrierId },
    });
    if (!carrier) {
      return res.status(404).json({ message: "Selected carrier not found." });
    }

    const planData = buildPlanCreateData(
      {
        ...body,
        planName: body.planName ?? existing.planName,
        planCode: body.planCode ?? existing.planCode,
        planType: body.planType ?? existing.planType,
        status: body.status ?? existing.status,
        address: body.address ?? ((existing.address as InsuranceAddressInput) || null),
        notes: body.notes ?? existing.notes,
      },
      carrierId,
    );
    if ("error" in planData) {
      return res.status(400).json({ message: planData.error });
    }

    const areUniquePlanCodes = await ensureUniquePlanCodes(
      [planData.planCode],
      [planId],
    );
    if (!areUniquePlanCodes) {
      return res.status(400).json({ message: "Plan code already exists." });
    }

    const updated = await prisma.insurancePlan.update({
      where: { id: planId },
      data: planData,
      include: {
        carrier: {
          select: {
            carrierName: true,
            carrierCode: true,
          },
        },
      },
    });

    return res.status(200).json({
      message: "Insurance plan updated successfully.",
      plan: mapPlan(updated),
    });
  } catch (error) {
    return res.status(500).json({
      message:
        error instanceof Error && error.message
          ? error.message
          : "Unable to update insurance plan.",
    });
  }
}

export async function deleteInsurancePlan(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const planId = String(req.params.id);
    const existing = await prisma.insurancePlan.findUnique({
      where: { id: planId },
    });

    if (!existing) {
      return res.status(404).json({ message: "Insurance plan not found." });
    }

    await prisma.insurancePlan.delete({
      where: { id: planId },
    });

    return res.status(200).json({
      message: "Insurance plan deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete insurance plan.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
