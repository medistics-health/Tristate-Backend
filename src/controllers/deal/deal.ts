import { DealStage, Prisma, AgreementStatus } from "../../../generated/prisma/client";
import { Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

type DealBody = {
  practiceId?: string;
  companyId?: string | null;
  primaryContactId?: string | null;
  stage?: string;
  value?: number;
  probability?: number;
  expectedCloseDate?: string | null;
  nextTaskTitle?: string | null;
  nextTaskDueAt?: string | null;
  lastActivityAt?: string | null;
  activityCount?: number;
  selectedServiceIds?: string[];
};

const dealInclude = {
  practice: {
    include: {
      company: true,
    },
  },
  company: true,
  primaryContact: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      role: true,
      influence: true,
    },
  },
  selectedServices: {
    include: {
      service: true,
    },
    orderBy: {
      createdAt: "asc" as const,
    },
  },
  agreements: {
    include: {
      docusealSubmissions: {
        include: {
          signers: true,
        },
      },
      serviceTerms: true,
    },
    orderBy: {
      createdAt: "desc" as const,
    },
  },
  audits: {
    orderBy: {
      createdAt: "desc" as const,
    },
  },
} satisfies Prisma.DealInclude;

type DealWithRelations = Prisma.DealGetPayload<{
  include: typeof dealInclude;
}>;

function isDealStage(stage: string): stage is DealStage {
  return Object.values(DealStage).includes(stage as DealStage);
}

function parseOptionalDate(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    return null;
  }

  const parsed = new Date(String(value));

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${fieldName}.`);
  }

  return parsed;
}

function formatPersonName(person?: { firstName: string; lastName: string } | null) {
  if (!person) return null;
  return `${person.firstName} ${person.lastName}`.trim();
}

function buildStageReadiness(deal: DealWithRelations) {
  const hasPracticeLinked = Boolean(deal.practiceId);
  const hasCompanyLinked = Boolean(deal.companyId || deal.practice.companyId);
  const hasPrimaryContact = Boolean(deal.primaryContactId);
  const hasSelectedServices = deal.selectedServices.length > 0;

  const hasAgreementTemplate = deal.agreements.some((agreement) =>
    agreement.docusealSubmissions.some((submission) => submission.templateId !== null),
  );

  const hasPricingDraft = deal.agreements.some(
    (agreement) => agreement.serviceTerms.length > 0,
  );

  const hasSignerAssigned = deal.agreements.some((agreement) =>
    agreement.docusealSubmissions.some(
      (submission) =>
        Boolean(submission.personId) || submission.signers.length > 0,
    ),
  );

  const hasSignedAgreement = deal.agreements.some(
    (agreement) =>
      agreement.status === AgreementStatus.ACTIVE ||
      agreement.docusealSubmissions.some(
        (submission) =>
          submission.status === "completed" ||
          submission.signers.some((signer) => signer.status === "completed"),
      ),
  );

  const hasFinalizedPricingTerms = deal.agreements.some((agreement) =>
    agreement.serviceTerms.some((term) => term.isActive),
  );

  const readiness = {
    PROPOSAL: {
      complete:
        hasSelectedServices &&
        hasPrimaryContact &&
        hasCompanyLinked &&
        hasPracticeLinked,
      missing: [
        !hasSelectedServices ? "selected services" : null,
        !hasPrimaryContact ? "primary contact" : null,
        !hasCompanyLinked ? "company linked" : null,
        !hasPracticeLinked ? "practice linked" : null,
      ].filter(Boolean),
    },
    AGREEMENT_SENT: {
      complete: hasAgreementTemplate && hasPricingDraft && hasSignerAssigned,
      missing: [
        !hasAgreementTemplate ? "agreement templates selected" : null,
        !hasPricingDraft ? "pricing draft created" : null,
        !hasSignerAssigned ? "signer assigned" : null,
      ].filter(Boolean),
    },
    ONBOARDING: {
      complete: hasSignedAgreement && hasFinalizedPricingTerms,
      missing: [
        !hasSignedAgreement ? "signed agreements" : null,
        !hasFinalizedPricingTerms ? "finalized pricing terms" : null,
      ].filter(Boolean),
    },
  };

  return readiness;
}

function serializeDeal(deal: DealWithRelations) {
  const stageReadiness = buildStageReadiness(deal);
  const primaryContactName = formatPersonName(deal.primaryContact);
  const serviceNames = deal.selectedServices.map((item) => item.service.name);

  return {
    ...deal,
    primaryContactName,
    selectedServiceIds: deal.selectedServices.map((item) => item.serviceId),
    selectedServiceNames: serviceNames,
    card: {
      practiceName: deal.practice.name,
      servicesLabel: serviceNames.join(" + "),
      valueLabel: `$${deal.value.toString()}/mo`,
      lastActivityAt: deal.lastActivityAt,
      activityCount: deal.activityCount,
      nextTaskTitle: deal.nextTaskTitle,
      nextTaskDueAt: deal.nextTaskDueAt,
    },
    stageReadiness,
  };
}

async function validateDealRelations(body: DealBody, practiceCompanyId?: string | null) {
  const {
    practiceId,
    companyId,
    primaryContactId,
    selectedServiceIds,
  } = body;

  if (practiceId) {
    const practice = await prisma.practice.findFirst({
      where: { id: practiceId },
    });

    if (!practice) {
      return { status: 404, message: "Practice not found." };
    }
  }

  if (companyId) {
    const company = await prisma.company.findFirst({
      where: { id: companyId },
    });

    if (!company) {
      return { status: 404, message: "Company not found." };
    }

    if (practiceCompanyId && practiceCompanyId !== companyId) {
      return {
        status: 400,
        message: "Deal company must match the linked practice company.",
      };
    }
  }

  if (primaryContactId) {
    const contact = await prisma.person.findFirst({
      where: { id: primaryContactId },
    });

    if (!contact) {
      return { status: 404, message: "Primary contact not found." };
    }

    if (practiceId || companyId || practiceCompanyId) {
      const linkedContact = await prisma.person.findFirst({
        where: {
          id: primaryContactId,
          OR: [
            practiceId
              ? {
                  practices: {
                    some: {
                      practiceId,
                    },
                  },
                }
              : undefined,
            companyId || practiceCompanyId
              ? {
                  companies: {
                    some: {
                      companyId: (companyId || practiceCompanyId)!,
                    },
                  },
                }
              : undefined,
          ].filter(Boolean) as Prisma.PersonWhereInput[],
        },
      });

      if (!linkedContact) {
        return {
          status: 400,
          message:
            "Primary contact must be linked to the selected practice or company.",
        };
      }
    }
  }

  if (selectedServiceIds !== undefined) {
    const uniqueIds = [...new Set(selectedServiceIds)];

    if (uniqueIds.length !== selectedServiceIds.length) {
      return {
        status: 400,
        message: "selectedServiceIds cannot contain duplicates.",
      };
    }

    if (uniqueIds.length > 0) {
      const services = await prisma.service.findMany({
        where: {
          id: {
            in: uniqueIds,
          },
        },
        select: { id: true },
      });

      if (services.length !== uniqueIds.length) {
        return {
          status: 404,
          message: "One or more selected services were not found.",
        };
      }
    }
  }

  return null;
}

function validateRequestedStage(stage: DealStage, deal: DealWithRelations) {
  const stageReadiness = buildStageReadiness(deal);

  if (stage === DealStage.PROPOSAL && !stageReadiness.PROPOSAL.complete) {
    return {
      status: 400,
      message: "Deal is not ready for Proposal stage.",
      missingRequirements: stageReadiness.PROPOSAL.missing,
    };
  }

  if (
    stage === DealStage.AGREEMENT_SENT &&
    !stageReadiness.AGREEMENT_SENT.complete
  ) {
    return {
      status: 400,
      message: "Deal is not ready for Agreement Sent stage.",
      missingRequirements: stageReadiness.AGREEMENT_SENT.missing,
    };
  }

  if (stage === DealStage.ONBOARDING && !stageReadiness.ONBOARDING.complete) {
    return {
      status: 400,
      message: "Deal is not ready for Onboarding stage.",
      missingRequirements: stageReadiness.ONBOARDING.missing,
    };
  }

  return null;
}

export async function createDeal(req: AuthenticatedRequest, res: Response) {
  try {
    const {
      practiceId,
      companyId,
      primaryContactId,
      stage,
      value,
      probability,
      expectedCloseDate,
      nextTaskTitle,
      nextTaskDueAt,
      lastActivityAt,
      activityCount,
      selectedServiceIds,
    } = req.body as DealBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (
      !practiceId ||
      !stage ||
      value === undefined ||
      probability === undefined
    ) {
      return res.status(400).json({
        message: "practiceId, stage, value and probability are required.",
      });
    }

    if (!isDealStage(stage)) {
      return res.status(400).json({
        message: "Invalid deal stage.",
        allowedStages: Object.values(DealStage),
      });
    }

    const practice = await prisma.practice.findFirst({
      where: { id: practiceId },
      select: { id: true, companyId: true },
    });

    if (!practice) {
      return res.status(404).json({ message: "Practice not found." });
    }

    const relationError = await validateDealRelations(
      {
        practiceId,
        companyId,
        primaryContactId,
        selectedServiceIds,
      },
      practice.companyId,
    );

    if (relationError) {
      return res.status(relationError.status).json({ message: relationError.message });
    }

    const parsedExpectedCloseDate = parseOptionalDate(
      expectedCloseDate,
      "expectedCloseDate",
    );
    const parsedNextTaskDueAt = parseOptionalDate(nextTaskDueAt, "nextTaskDueAt");
    const parsedLastActivityAt = parseOptionalDate(
      lastActivityAt,
      "lastActivityAt",
    );

    const createdDeal = await prisma.$transaction(async (tx) => {
      const deal = await tx.deal.create({
        data: {
          practiceId,
          companyId: companyId ?? practice.companyId ?? null,
          primaryContactId: primaryContactId ?? null,
          stage,
          value,
          probability,
          expectedCloseDate: parsedExpectedCloseDate,
          nextTaskTitle: nextTaskTitle ?? null,
          nextTaskDueAt: parsedNextTaskDueAt,
          lastActivityAt: parsedLastActivityAt,
          activityCount: activityCount ?? 0,
          selectedServices: selectedServiceIds?.length
            ? {
                create: selectedServiceIds.map((serviceId) => ({
                  serviceId,
                })),
              }
            : undefined,
        },
        include: dealInclude,
      });

      const stageError = validateRequestedStage(stage, deal);

      if (stageError) {
        throw Object.assign(new Error(stageError.message), stageError);
      }

      return deal;
    });

    return res.status(201).json({
      message: "Deal created successfully.",
      deal: serializeDeal(createdDeal),
    });
  } catch (error: any) {
    const status = error?.status;

    if (status) {
      return res.status(status).json({
        message: error.message,
        missingRequirements: error.missingRequirements,
      });
    }

    return res.status(500).json({
      message: "Unable to create deal.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getDeal(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Deal id is required." });
    }

    const deal = await prisma.deal.findFirst({
      where: { id },
      include: dealInclude,
    });

    if (!deal) {
      return res.status(404).json({ message: "Deal not found." });
    }

    return res.status(200).json({
      message: "Deal fetched successfully.",
      deal: serializeDeal(deal),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch deal.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updateDeal(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const body = req.body as DealBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Deal id is required." });
    }

    if (body.stage !== undefined && !isDealStage(body.stage)) {
      return res.status(400).json({
        message: "Invalid deal stage.",
        allowedStages: Object.values(DealStage),
      });
    }

    const existingDeal = await prisma.deal.findFirst({
      where: { id },
      include: {
        practice: {
          select: {
            companyId: true,
          },
        },
      },
    });

    if (!existingDeal) {
      return res.status(404).json({ message: "Deal not found." });
    }

    const nextPracticeId = body.practiceId ?? existingDeal.practiceId;

    let nextPracticeCompanyId = existingDeal.practice.companyId;
    if (body.practiceId && body.practiceId !== existingDeal.practiceId) {
      const nextPractice = await prisma.practice.findFirst({
        where: { id: body.practiceId },
        select: { companyId: true },
      });

      if (!nextPractice) {
        return res.status(404).json({ message: "Practice not found." });
      }

      nextPracticeCompanyId = nextPractice.companyId;
    }

    const relationError = await validateDealRelations(
      {
        practiceId: nextPracticeId,
        companyId: body.companyId === undefined ? undefined : body.companyId,
        primaryContactId: body.primaryContactId,
        selectedServiceIds: body.selectedServiceIds,
      },
      nextPracticeCompanyId,
    );

    if (relationError) {
      return res.status(relationError.status).json({ message: relationError.message });
    }

    const parsedExpectedCloseDate = parseOptionalDate(
      body.expectedCloseDate,
      "expectedCloseDate",
    );
    const parsedNextTaskDueAt = parseOptionalDate(body.nextTaskDueAt, "nextTaskDueAt");
    const parsedLastActivityAt = parseOptionalDate(
      body.lastActivityAt,
      "lastActivityAt",
    );

    const updatedDeal = await prisma.$transaction(async (tx) => {
      await tx.deal.update({
        where: { id },
        data: {
          ...(body.practiceId !== undefined ? { practiceId: body.practiceId } : {}),
          ...(body.companyId !== undefined
            ? { companyId: body.companyId || null }
            : body.practiceId !== undefined
              ? { companyId: nextPracticeCompanyId ?? null }
              : {}),
          ...(body.primaryContactId !== undefined
            ? { primaryContactId: body.primaryContactId || null }
            : {}),
          ...(body.stage !== undefined ? { stage: body.stage as DealStage } : {}),
          ...(body.value !== undefined ? { value: body.value } : {}),
          ...(body.probability !== undefined
            ? { probability: body.probability }
            : {}),
          ...(body.expectedCloseDate !== undefined
            ? { expectedCloseDate: parsedExpectedCloseDate }
            : {}),
          ...(body.nextTaskTitle !== undefined
            ? { nextTaskTitle: body.nextTaskTitle || null }
            : {}),
          ...(body.nextTaskDueAt !== undefined
            ? { nextTaskDueAt: parsedNextTaskDueAt }
            : {}),
          ...(body.lastActivityAt !== undefined
            ? { lastActivityAt: parsedLastActivityAt }
            : {}),
          ...(body.activityCount !== undefined
            ? { activityCount: body.activityCount }
            : {}),
        },
      });

      if (body.selectedServiceIds !== undefined) {
        await tx.dealSelectedService.deleteMany({
          where: { dealId: id },
        });

        if (body.selectedServiceIds.length > 0) {
          await tx.dealSelectedService.createMany({
            data: body.selectedServiceIds.map((serviceId) => ({
              dealId: id,
              serviceId,
            })),
          });
        }
      }

      const deal = await tx.deal.findFirst({
        where: { id },
        include: dealInclude,
      });

      if (!deal) {
        throw new Error("Deal not found after update.");
      }

      const requestedStage = (body.stage as DealStage | undefined) ?? deal.stage;
      const stageError = validateRequestedStage(requestedStage, deal);

      if (stageError) {
        throw Object.assign(new Error(stageError.message), stageError);
      }

      return deal;
    });

    return res.status(200).json({
      message: "Deal updated successfully.",
      deal: serializeDeal(updatedDeal),
    });
  } catch (error: any) {
    const status = error?.status;

    if (status) {
      return res.status(status).json({
        message: error.message,
        missingRequirements: error.missingRequirements,
      });
    }

    return res.status(500).json({
      message: "Unable to update deal.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function deleteDeal(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Deal id is required." });
    }

    const existingDeal = await prisma.deal.findFirst({
      where: { id },
    });

    if (!existingDeal) {
      return res.status(404).json({ message: "Deal not found." });
    }

    await prisma.deal.delete({ where: { id } });

    return res.status(200).json({ message: "Deal deleted successfully." });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete deal.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getAllDeals(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const { stage, practiceId, companyId, minValue, maxValue } =
      req.query;

    const where: Prisma.DealWhereInput = {};

    if (stage && isDealStage(stage as string)) {
      where.stage = stage as DealStage;
    }

    if (practiceId) {
      where.practiceId = practiceId as string;
    }

    if (companyId) {
      where.companyId = companyId as string;
    }

    if (minValue || maxValue) {
      where.value = {};
      if (minValue) where.value.gte = new Prisma.Decimal(minValue as string);
      if (maxValue) where.value.lte = new Prisma.Decimal(maxValue as string);
    }

    const [deals, total] = await Promise.all([
      prisma.deal.findMany({
        where,
        include: dealInclude,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.deal.count({ where }),
    ]);

    return res.status(200).json({
      message: "Deals fetched successfully.",
      deals: deals.map(serializeDeal),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch deals.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
