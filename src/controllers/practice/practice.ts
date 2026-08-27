import {
  OnboardingServiceLine,
  PracticeSource,
  PracticeStatus,
} from "../../../generated/prisma/client";
import { Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { sendOutlookEmail } from "../../utils/outlook";
import {
  ensureProjectForPractice,
  ensureWorkstreamsForPractice,
} from "../../services/onboarding/workstreamSync";
import {
  buildPracticeDefaultProcessingFeeSettings,
  buildProcessingFeeAllocationSettings,
  buildProcessingFeeSettings,
  isBillingPaymentMethod,
} from "../../utils/paymentProcessing";

type GroupNpiInput = {
  groupNpiNumber: string;
  groupName: string;
  taxId: string;
  practiceGroupId?: string;
  notes?: string;
  status?: string;
};

type PracticeBody = {
  name?: string;
  npi?: string;
  status?: string;
  region?: string;
  source?: string;
  bucket?: string[];
  serviceLines?: string[];
  companyId?: string;
  practiceGroupId?: string;
  taxIdId?: string;
  billToTaxIdId?: string | null;
  stripeCustomerId?: string | null;
  quickbooksCustomerId?: string | null;
  defaultCurrency?: string | null;
  billingPaymentMethod?: string | null;
  credentialingChargeAmount?: number | string | null;
  processingFeeConfig?: unknown;
  groupNpis?: GroupNpiInput[];
  goLiveTarget?: string | null;
};

type SendOnboardingEmailBody = {
  practiceId: string;
  personId: string;
  subject?: string;
  message?: string;
  formLink?: string;
};

export async function sendOnboardingEmail(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const { practiceId, personId, subject, message, formLink } =
      req.body as SendOnboardingEmailBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!practiceId || !personId) {
      return res.status(400).json({
        message: "practiceId and personId are required.",
      });
    }

    const practice = await prisma.practice.findFirst({
      where: { id: practiceId },
    });

    if (!practice) {
      return res.status(404).json({ message: "Practice not found." });
    }

    const person = await prisma.person.findFirst({
      where: {
        id: personId,
        practices: {
          some: {
            practiceId: practiceId,
          },
        },
      },
    });

    if (!person || !person.email) {
      return res.status(404).json({
        message: "Person not found for this practice or has no email address.",
      });
    }

    const emailSubject = subject || `Onboarding: Welcome ${practice.name}`;
    const emailBody = `
      <p>Hello ${person.firstName},</p>
      <p>Welcome to our platform! We are excited to start the onboarding process for <strong>${practice.name}</strong>.</p>
      ${message ? `<p>${message}</p>` : ""}
      ${formLink ? `<p>Please fill out the onboarding form here: <a href="${formLink}">${formLink}</a></p>` : ""}
      <p>If you have any questions, feel free to reach out.</p>
      <p>Best regards,<br/>The Team</p>
    `;

    await sendOutlookEmail(person.email, emailSubject, emailBody);

    return res.status(200).json({
      message: "Onboarding email sent successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to send onboarding email.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

function isPracticeStatus(status: string): status is PracticeStatus {
  return Object.values(PracticeStatus).includes(status as PracticeStatus);
}

function isPracticeSource(source: string): source is PracticeSource {
  return Object.values(PracticeSource).includes(source as PracticeSource);
}

function isOnboardingServiceLine(
  value: string,
): value is OnboardingServiceLine {
  return Object.values(OnboardingServiceLine).includes(
    value as OnboardingServiceLine,
  );
}

function parseOptionalDate(value?: string | null) {
  if (value === undefined) return undefined;
  if (value === null || String(value).trim() === "") {
    return { value: null as Date | null };
  }

  const trimmed = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split("-").map(Number);
    return { value: new Date(year, month - 1, day) };
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return { error: "Invalid goLiveTarget date." as const };
  }
  return { value: parsed };
}

function withGoLiveTarget<T extends { onboardingProjects?: Array<{ goLiveTarget: Date | null }> }>(
  practice: T,
  goLiveTarget?: Date | null,
) {
  const { onboardingProjects, ...rest } = practice;
  return {
    ...rest,
    goLiveTarget:
      goLiveTarget ?? onboardingProjects?.[0]?.goLiveTarget ?? null,
  };
}

function parseServiceLines(serviceLines?: string[]) {
  if (serviceLines === undefined) {
    return undefined;
  }

  if (!Array.isArray(serviceLines)) {
    return { error: "serviceLines must be an array." as const };
  }

  const unique = [
    ...new Set(serviceLines.map((line) => String(line).trim())),
  ].filter(Boolean);

  if (unique.some((line) => !isOnboardingServiceLine(line))) {
    return {
      error: "Invalid service line." as const,
      allowedServiceLines: Object.values(OnboardingServiceLine),
    };
  }

  return { value: unique as OnboardingServiceLine[] };
}

export async function getPractices(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({
        message: "Unauthorized.",
      });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 1000;
    const skip = (page - 1) * limit;

    const { search, status, region, source, companyId, practiceGroupId, sortBy, sortOrder } =
      req.query;
    const orderDir =
      (sortOrder as string)?.toLowerCase() === "asc" ? "asc" : "desc";

    const where: any = {};

    if (search) {
      const searchTerm = search as string;
      const npiTerm = searchTerm.replace(/\D/g, "");
      const searchOr: any[] = [
        { name: { contains: searchTerm, mode: "insensitive" } },
      ];
      if (npiTerm) {
        searchOr.push({ npi: { contains: npiTerm, mode: "insensitive" } });
        searchOr.push({
          groupNpis: {
            some: {
              groupNpiNumber: { contains: npiTerm, mode: "insensitive" },
            },
          },
        });
      } else {
        searchOr.push({ npi: { contains: searchTerm, mode: "insensitive" } });
      }
      where.OR = searchOr;
    }

    if (status) {
      where.status = status as PracticeStatus;
    }

    if (region) {
      where.region = { contains: region as string, mode: "insensitive" };
    }

    if (source) {
      where.source = source as PracticeSource;
    }

    if (companyId) {
      where.companyId = companyId as string;
    }

    if (practiceGroupId) {
      where.practiceGroupId = practiceGroupId as string;
    }

    let orderBy: any = { createdAt: orderDir };
    if (sortBy === "name") {
      orderBy = { name: orderDir };
    } else if (sortBy === "status") {
      orderBy = { status: orderDir };
    } else if (sortBy === "source") {
      orderBy = { source: orderDir };
    } else if (sortBy === "npi") {
      orderBy = { npi: orderDir };
    } else if (sortBy === "updatedAt" || sortBy === "lastUpdate") {
      orderBy = { updatedAt: orderDir };
    } else if (sortBy === "createdAt" || sortBy === "creationDate") {
      orderBy = { createdAt: orderDir };
    }

    const [practices, totalRecords] = await Promise.all([
      prisma.practice.findMany({
        where,
        include: {
          company: true,
          practiceGroup: true,
          taxId: true,
          groupNpis: true,
          agreements: true,
          persons: {
            include: {
              person: true,
            },
          },
          _count: {
            select: { persons: true, deals: true, agreements: true },
          },
          onboardingProjects: {
            select: { goLiveTarget: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        skip,
        take: limit,
        orderBy,
      }),
      prisma.practice.count({ where }),
    ]);

    const totalPages = Math.ceil(totalRecords / limit);

    return res.status(200).json({
      message: "Practices fetched successfully.",
      practices: practices.map((practice) => withGoLiveTarget(practice)),
      pagination: {
        totalRecords,
        totalPages,
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      message: "Unable to fetch practices.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function createPractice(req: AuthenticatedRequest, res: Response) {
  try {
    const {
      name,
      npi,
      status,
      region,
      source,
      bucket,
      serviceLines,
      companyId,
      practiceGroupId,
      taxIdId,
      billToTaxIdId,
      stripeCustomerId,
      quickbooksCustomerId,
      defaultCurrency,
      billingPaymentMethod,
      credentialingChargeAmount,
      processingFeeConfig,
      groupNpis,
      goLiveTarget,
    } = req.body as PracticeBody;

    if (!req.user?.sub) {
      return res.status(401).json({
        message: "Unauthorized.",
      });
    }

    if (!name || !status || !source) {
      return res.status(400).json({
        message: "name, status, source are required.",
      });
    }

    if (!isPracticeStatus(status)) {
      return res.status(400).json({
        message: "Invalid practice status.",
        allowedStatuses: Object.values(PracticeStatus),
      });
    }

    if (!isPracticeSource(source)) {
      return res.status(400).json({
        message: "Invalid practice source.",
        allowedSources: Object.values(PracticeSource),
      });
    }

    const parsedServiceLines = parseServiceLines(serviceLines);
    if (parsedServiceLines && "error" in parsedServiceLines) {
      return res.status(400).json({
        message: parsedServiceLines.error,
        allowedServiceLines:
          "allowedServiceLines" in parsedServiceLines
            ? parsedServiceLines.allowedServiceLines
            : undefined,
      });
    }

    if (
      billingPaymentMethod &&
      !isBillingPaymentMethod(billingPaymentMethod.trim().toUpperCase())
    ) {
      return res.status(400).json({
        message: "billingPaymentMethod must be ACH or CREDIT_CARD.",
      });
    }

    const parsedCredentialingChargeAmount =
      credentialingChargeAmount !== undefined &&
      credentialingChargeAmount !== null &&
      credentialingChargeAmount !== ""
        ? Number(credentialingChargeAmount)
        : undefined;

    if (
      parsedCredentialingChargeAmount !== undefined &&
      (!Number.isFinite(parsedCredentialingChargeAmount) ||
        parsedCredentialingChargeAmount < 0)
    ) {
      return res.status(400).json({
        message: "credentialingChargeAmount must be a non-negative number.",
      });
    }

    if (companyId) {
      const company = await prisma.company.findFirst({
        where: { id: companyId },
      });
      if (!company) {
        return res.status(400).json({
          message: "Invalid companyId. Company not found.",
        });
      }
    }

    if (practiceGroupId) {
      const practiceGroup = await prisma.practiceGroup.findFirst({
        where: { id: practiceGroupId, companyId },
      });
      if (!practiceGroup) {
        return res.status(400).json({
          message: "Invalid practiceGroupId for this company.",
        });
      }
    }

    if (taxIdId) {
      const taxId = await prisma.taxId.findFirst({
        where: { id: taxIdId, companyId },
      });
      if (!taxId) {
        return res.status(400).json({
          message: "Invalid taxIdId for this company.",
        });
      }
    }

    if (billToTaxIdId) {
      const billToTaxId = await prisma.taxId.findFirst({
        where: { id: billToTaxIdId, companyId },
      });
      if (!billToTaxId) {
        return res.status(400).json({
          message: "Invalid billToTaxIdId for this company.",
        });
      }
    }

    const groupNpiConnect: { groupNpiNumber: string }[] = [];

    if (groupNpis && groupNpis.length > 0) {
      for (const groupNpi of groupNpis) {
        if (!groupNpi.groupNpiNumber) {
          return res.status(400).json({
            message: "groupNpiNumber is required for each groupNpi.",
          });
        }

        if (groupNpi.taxId && companyId) {
          const taxIdRecord = await prisma.taxId.findFirst({
            where: { id: groupNpi.taxId, companyId },
          });
          if (!taxIdRecord) {
            return res.status(400).json({
              message: "Invalid taxId for the groupNpi.",
            });
          }
        }

        const existingGroupNpi = await prisma.groupNpi.findUnique({
          where: { groupNpiNumber: groupNpi.groupNpiNumber },
        });

        if (existingGroupNpi) {
          await prisma.groupNpi.update({
            where: { groupNpiNumber: groupNpi.groupNpiNumber },
            data: {
              groupName: groupNpi.groupName || existingGroupNpi.groupName,
              taxId: groupNpi.taxId || null,
              practiceGroupId:
                groupNpi.practiceGroupId || existingGroupNpi.practiceGroupId,
              notes: groupNpi.notes ?? existingGroupNpi.notes,
              status: (groupNpi.status as any) || existingGroupNpi.status,
            },
          });
        } else if (groupNpi.groupName) {
          await prisma.groupNpi.create({
            data: {
              groupNpiNumber: groupNpi.groupNpiNumber,
              groupName: groupNpi.groupName,
              taxId: groupNpi.taxId || undefined,
              practiceGroupId: groupNpi.practiceGroupId,
              notes: groupNpi.notes,
              status: (groupNpi.status as any) || "ACTIVE",
            },
          });
        }

        groupNpiConnect.push({ groupNpiNumber: groupNpi.groupNpiNumber });
      }
    }

    const settings = await prisma.systemSettings.findFirst();
    const defaultPracticeProcessingFeeConfig =
      buildPracticeDefaultProcessingFeeSettings(settings);

    const practiceData: any = {
      name,
      npi,
      status,
      region,
      source,
      bucket,
      ...(parsedServiceLines?.value !== undefined
        ? { serviceLines: parsedServiceLines.value }
        : {}),
      companyId,
      practiceGroupId,
      taxIdId,
      billToTaxIdId,
      stripeCustomerId,
      quickbooksCustomerId,
      billingPaymentMethod: billingPaymentMethod?.trim().toUpperCase() || "ACH",
      ...(credentialingChargeAmount !== undefined
        ? {
            credentialingChargeAmount:
              parsedCredentialingChargeAmount !== undefined
                ? parsedCredentialingChargeAmount
                : null,
          }
        : {}),
      processingFeeConfig:
        (processingFeeConfig
          ? buildProcessingFeeAllocationSettings(processingFeeConfig)
          : defaultPracticeProcessingFeeConfig) as any,
      ...(defaultCurrency !== undefined
        ? { defaultCurrency: defaultCurrency || null }
        : {}),
    };

    if (groupNpiConnect.length > 0) {
      practiceData.groupNpis = {
        connect: groupNpiConnect,
      };
    }

    const parsedGoLiveTarget = parseOptionalDate(goLiveTarget);
    if (parsedGoLiveTarget && "error" in parsedGoLiveTarget) {
      return res.status(400).json({
        message: parsedGoLiveTarget.error,
      });
    }

    const practice = await prisma.practice.create({
      data: practiceData,
    });

    if (parsedServiceLines?.value?.length) {
      await ensureWorkstreamsForPractice(
        practice.id,
        parsedServiceLines.value,
      );
    }

    let goLiveTargetValue: Date | null = null;
    if (parsedGoLiveTarget) {
      const ensured = await ensureProjectForPractice(practice.id, {
        goLiveTarget: parsedGoLiveTarget.value,
      });
      if ("error" in ensured) {
        return res.status(ensured.status).json({ message: ensured.error });
      }
      goLiveTargetValue = ensured.project.goLiveTarget;
    }

    return res.status(201).json({
      message: "Practice created successfully.",
      practice: withGoLiveTarget(practice, goLiveTargetValue),
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      message: "Unable to create practice.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getPractice(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({
        message: "Unauthorized.",
      });
    }

    if (!id) {
      return res.status(400).json({
        message: "Practice id is required.",
      });
    }

    const practice = await prisma.practice.findFirst({
      where: {
        id,
      },
      include: {
        company: true,
        practiceGroup: true,
        taxId: true,
        billToTaxId: true,
        groupNpis: true,
        persons: {
          include: {
            person: true,
          },
        },
        deals: true,
        agreements: true,
        invoices: true,
        billingRuns: true,
        vendorPayables: true,
        audits: true,
        assessments: true,
        onboardingProjects: {
          select: { goLiveTarget: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    let allGroupNpisByTaxId: any[] = [];
    if (practice?.taxIdId) {
      allGroupNpisByTaxId = await prisma.groupNpi.findMany({
        where: { taxId: practice.taxIdId },
      });
    }

    if (!practice) {
      return res.status(404).json({
        message: "Practice not found.",
      });
    }

    return res.status(200).json({
      message: "Practice fetched successfully.",
      practice: withGoLiveTarget(practice),
      allGroupNpisByTaxId,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch practice.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updatePractice(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const {
      name,
      npi,
      status,
      region,
      source,
      bucket,
      companyId,
      practiceGroupId,
      taxIdId,
      billToTaxIdId,
      stripeCustomerId,
      quickbooksCustomerId,
      defaultCurrency,
      billingPaymentMethod,
      credentialingChargeAmount,
      processingFeeConfig,
      groupNpis,
      goLiveTarget,
    } = req.body as PracticeBody;

    if (!req.user?.sub) {
      return res.status(401).json({
        message: "Unauthorized.",
      });
    }

    if (!id) {
      return res.status(400).json({
        message: "Practice id is required.",
      });
    }

    if (status && !isPracticeStatus(status)) {
      return res.status(400).json({
        message: "Invalid practice status.",
        allowedStatuses: Object.values(PracticeStatus),
      });
    }

    if (source && !isPracticeSource(source)) {
      return res.status(400).json({
        message: "Invalid practice source.",
        allowedSources: Object.values(PracticeSource),
      });
    }

    if (
      billingPaymentMethod &&
      !isBillingPaymentMethod(billingPaymentMethod.trim().toUpperCase())
    ) {
      return res.status(400).json({
        message: "billingPaymentMethod must be ACH or CREDIT_CARD.",
      });
    }

    const parsedCredentialingChargeAmount =
      credentialingChargeAmount !== undefined &&
      credentialingChargeAmount !== null &&
      credentialingChargeAmount !== ""
        ? Number(credentialingChargeAmount)
        : undefined;

    if (
      parsedCredentialingChargeAmount !== undefined &&
      (!Number.isFinite(parsedCredentialingChargeAmount) ||
        parsedCredentialingChargeAmount < 0)
    ) {
      return res.status(400).json({
        message: "credentialingChargeAmount must be a non-negative number.",
      });
    }

    const existingPractice = await prisma.practice.findFirst({
      where: {
        id,
      },
    });

    if (!existingPractice) {
      return res.status(404).json({
        message: "Practice not found.",
      });
    }

    if (companyId) {
      const company = await prisma.company.findFirst({
        where: { id: companyId },
      });
      if (!company) {
        return res.status(400).json({
          message: "Invalid companyId. Company not found.",
        });
      }
    }

    if (practiceGroupId) {
      const targetCompanyId = companyId || existingPractice.companyId;
      if (targetCompanyId) {
        const practiceGroup = await prisma.practiceGroup.findFirst({
          where: { id: practiceGroupId, companyId: targetCompanyId },
        });
        if (!practiceGroup) {
          return res.status(400).json({
            message: "Invalid practiceGroupId for this company.",
          });
        }
      }
    }

    if (taxIdId) {
      const targetCompanyId = companyId || existingPractice.companyId;
      if (targetCompanyId) {
        const taxId = await prisma.taxId.findFirst({
          where: { id: taxIdId, companyId: targetCompanyId },
        });
        if (!taxId) {
          return res.status(400).json({
            message: "Invalid taxIdId for this company.",
          });
        }
      }
    }

    if (billToTaxIdId) {
      const targetCompanyId = companyId || existingPractice.companyId;
      if (targetCompanyId) {
        const billToTaxId = await prisma.taxId.findFirst({
          where: { id: billToTaxIdId, companyId: targetCompanyId },
        });
        if (!billToTaxId) {
          return res.status(400).json({
            message: "Invalid billToTaxIdId for this company.",
          });
        }
      }
    }

    const targetCompanyId =
      companyId || existingPractice.companyId || undefined;

    if (groupNpis && groupNpis.length > 0) {
      for (const groupNpi of groupNpis) {
        if (!groupNpi.groupNpiNumber) {
          return res.status(400).json({
            message: "groupNpiNumber is required for each groupNpi.",
          });
        }

        if (groupNpi.taxId && targetCompanyId) {
          const taxIdRecord = await prisma.taxId.findFirst({
            where: { id: groupNpi.taxId, companyId: targetCompanyId },
          });
          if (!taxIdRecord) {
            return res.status(400).json({
              message: "Invalid taxId for the groupNpi.",
            });
          }
        }

        const existingGroupNpi = await prisma.groupNpi.findUnique({
          where: { groupNpiNumber: groupNpi.groupNpiNumber },
        });

        if (existingGroupNpi) {
          await prisma.groupNpi.update({
            where: { groupNpiNumber: groupNpi.groupNpiNumber },
            data: {
              groupName: groupNpi.groupName || existingGroupNpi.groupName,
              taxId: groupNpi.taxId || null,
              practiceGroupId:
                groupNpi.practiceGroupId || existingGroupNpi.practiceGroupId,
              notes: groupNpi.notes ?? existingGroupNpi.notes,
              status: (groupNpi.status as any) || existingGroupNpi.status,
            },
          });
        } else if (groupNpi.groupName) {
          await prisma.groupNpi.create({
            data: {
              groupNpiNumber: groupNpi.groupNpiNumber,
              groupName: groupNpi.groupName,
              taxId: groupNpi.taxId || undefined,
              practiceGroupId: groupNpi.practiceGroupId,
              notes: groupNpi.notes,
              status: (groupNpi.status as any) || "ACTIVE",
            },
          });
        }
      }
    }

    const updateData: any = {
      name,
      npi,
      status: status as PracticeStatus,
      region,
      source: source as PracticeSource,
      bucket,
      companyId,
      practiceGroupId,
      taxIdId,
      ...(billToTaxIdId !== undefined
        ? { billToTaxIdId: billToTaxIdId || null }
        : {}),
      ...(stripeCustomerId !== undefined
        ? { stripeCustomerId: stripeCustomerId || null }
        : {}),
      ...(quickbooksCustomerId !== undefined
        ? { quickbooksCustomerId: quickbooksCustomerId || null }
        : {}),
      ...(defaultCurrency !== undefined
        ? { defaultCurrency: defaultCurrency || null }
        : {}),
      ...(billingPaymentMethod !== undefined
        ? {
            billingPaymentMethod:
              billingPaymentMethod?.trim().toUpperCase() || "ACH",
          }
        : {}),
      ...(credentialingChargeAmount !== undefined
        ? {
            credentialingChargeAmount:
              parsedCredentialingChargeAmount !== undefined
                ? parsedCredentialingChargeAmount
                : null,
          }
        : {}),
      ...(processingFeeConfig !== undefined
        ? {
            processingFeeConfig:
              buildProcessingFeeAllocationSettings(processingFeeConfig) as any,
          }
        : {}),
    };

    if (groupNpis !== undefined) {
      updateData.groupNpis = {
        set: groupNpis.map((gn) => ({ groupNpiNumber: gn.groupNpiNumber })),
      };
    }

    const parsedGoLiveTarget = parseOptionalDate(goLiveTarget);
    if (parsedGoLiveTarget && "error" in parsedGoLiveTarget) {
      return res.status(400).json({
        message: parsedGoLiveTarget.error,
      });
    }

    const practice = await prisma.practice.update({
      where: { id },
      data: updateData,
    });

    if (parsedGoLiveTarget) {
      const ensured = await ensureProjectForPractice(practice.id, {
        goLiveTarget: parsedGoLiveTarget.value,
      });
      if ("error" in ensured) {
        return res.status(ensured.status).json({ message: ensured.error });
      }
      return res.status(200).json({
        message: "Practice updated successfully.",
        practice: withGoLiveTarget(practice, ensured.project.goLiveTarget),
      });
    }

    const latestProject = await prisma.onboardingProject.findFirst({
      where: { practiceId: practice.id },
      orderBy: { createdAt: "desc" },
      select: { goLiveTarget: true },
    });

    return res.status(200).json({
      message: "Practice updated successfully.",
      practice: withGoLiveTarget(
        practice,
        latestProject?.goLiveTarget ?? null,
      ),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to update practice.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function deletePractice(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({
        message: "Unauthorized.",
      });
    }

    if (!id) {
      return res.status(400).json({
        message: "Practice id is required.",
      });
    }

    const existingPractice = await prisma.practice.findFirst({
      where: {
        id,
      },
    });

    if (!existingPractice) {
      return res.status(404).json({
        message: "Practice not found.",
      });
    }

    const practice = await prisma.practice.update({
      where: { id },
      data: {
        status: PracticeStatus.INACTIVE,
      },
      include: {
        company: true,
        practiceGroup: true,
        taxId: true,
        groupNpis: true,
        agreements: true,
        persons: {
          include: {
            person: true,
          },
        },
      },
    });

    return res.status(200).json({
      message: "Practice marked inactive successfully.",
      practice,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to mark practice inactive.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
