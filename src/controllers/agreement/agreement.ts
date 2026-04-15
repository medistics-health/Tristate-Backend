import {
  AgreementStatus,
  AgreementType,
} from "../../../generated/prisma/client";
import { Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { sendOutlookEmail } from "../../utils/outlook";

type AgreementBody = {
  practiceId?: string;
  dealId?: string | null;
  type?: string;
  status?: string;
  effectiveDate?: string;
  renewalDate?: string;
};

type SendAgreementEmailBody = {
  agreementId: string;
  personId: string;
  subject?: string;
  message?: string;
};

export async function sendAgreementEmail(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const { agreementId, personId, subject, message } =
      req.body as SendAgreementEmailBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!agreementId || !personId) {
      return res.status(400).json({
        message: "agreementId and personId are required.",
      });
    }

    const agreement = await prisma.agreement.findFirst({
      where: { id: agreementId, practice: { ownerId: req.user.sub } },
      include: { practice: true },
    });

    if (!agreement) {
      return res.status(404).json({ message: "Agreement not found." });
    }

    const person = await prisma.person.findFirst({
      where: {
        id: personId,
        practiceId: agreement.practiceId,
      },
    });

    if (!person || !person.email) {
      return res.status(404).json({
        message: "Person not found for this practice or has no email address.",
      });
    }

    const emailSubject =
      subject || `Agreement: ${agreement.type} - ${agreement.practice.name}`;
    const emailBody = `
      <p>Hello ${person.firstName},</p>
      <p>Please find the agreement details for <strong>${agreement.practice.name}</strong>.</p>
      <p>Type: ${agreement.type}</p>
      ${message ? `<p>${message}</p>` : ""}
      <p>Best regards,<br/>The Team</p>
    `;

    await sendOutlookEmail(person.email, emailSubject, emailBody);

    return res.status(200).json({
      message: "Agreement email sent successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to send agreement email.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

function isAgreementType(type: string): type is AgreementType {
  return Object.values(AgreementType).includes(type as AgreementType);
}

function isAgreementStatus(status: string): status is AgreementStatus {
  return Object.values(AgreementStatus).includes(status as AgreementStatus);
}

export async function createAgreement(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const { practiceId, dealId, type, status, effectiveDate, renewalDate } =
      req.body as AgreementBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!practiceId || !type || !status) {
      return res.status(400).json({
        message: "practiceId, type and status are required.",
      });
    }

    if (!isAgreementType(type)) {
      return res.status(400).json({
        message: "Invalid agreement type.",
        allowedTypes: Object.values(AgreementType),
      });
    }

    if (!isAgreementStatus(status)) {
      return res.status(400).json({
        message: "Invalid agreement status.",
        allowedStatuses: Object.values(AgreementStatus),
      });
    }

    const practice = await prisma.practice.findFirst({
      where: { id: practiceId, ownerId: req.user.sub },
    });

    if (!practice) {
      return res.status(404).json({ message: "Practice not found." });
    }

    if (dealId) {
      const deal = await prisma.deal.findFirst({
        where: { id: dealId, practiceId, practice: { ownerId: req.user.sub } },
      });

      if (!deal) {
        return res
          .status(404)
          .json({ message: "Deal not found for practice." });
      }
    }

    const agreement = await prisma.agreement.create({
      data: {
        practiceId,
        dealId: dealId ?? undefined,
        type,
        status,
        effectiveDate: effectiveDate ? new Date(effectiveDate) : undefined,
        renewalDate: renewalDate ? new Date(renewalDate) : undefined,
      },
    });

    return res.status(201).json({
      message: "Agreement created successfully.",
      agreement,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to create agreement.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getAgreements(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const type = (req.query.type as string) || "";
    const status = (req.query.status as string) || "";

    const skip = (page - 1) * limit;

    const where: any = {
      practice: {
        ownerId: req.user.sub,
      },
    };

    if (search) {
      where.practice = {
        ...where.practice,
        name: { contains: search, mode: "insensitive" },
      };
    }

    if (type) {
      if (!isAgreementType(type)) {
        return res.status(400).json({
          message: "Invalid agreement type.",
          allowedTypes: Object.values(AgreementType),
        });
      }
      where.type = type as AgreementType;
    }

    if (status) {
      if (!isAgreementStatus(status)) {
        return res.status(400).json({
          message: "Invalid agreement status.",
          allowedStatuses: Object.values(AgreementStatus),
        });
      }
      where.status = status as AgreementStatus;
    }

    const [agreements, totalRecords] = await Promise.all([
      prisma.agreement.findMany({
        where,
        include: {
          practice: true,
          deal: true,
          channelPartners: true,
        },
        skip,
        take: limit,
        orderBy: {
          createdAt: "desc",
        },
      }),
      prisma.agreement.count({ where }),
    ]);

    const totalPages = Math.ceil(totalRecords / limit);

    return res.status(200).json({
      message: "Agreements fetched successfully.",
      agreements,
      pagination: {
        totalRecords,
        totalPages,
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch agreements.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getAgreement(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Agreement id is required." });
    }

    const agreement = await prisma.agreement.findFirst({
      where: { id, practice: { ownerId: req.user.sub } },
      include: {
        practice: true,
        deal: true,
        invoices: true,
        channelPartners: true,
      },
    });

    if (!agreement) {
      return res.status(404).json({ message: "Agreement not found." });
    }

    return res.status(200).json({
      message: "Agreement fetched successfully.",
      agreement,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch agreement.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updateAgreement(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const { id } = req.params;
    const { dealId, type, status, effectiveDate, renewalDate } =
      req.body as AgreementBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Agreement id is required." });
    }

    if (type !== undefined && !isAgreementType(type)) {
      return res.status(400).json({
        message: "Invalid agreement type.",
        allowedTypes: Object.values(AgreementType),
      });
    }

    if (status !== undefined && !isAgreementStatus(status)) {
      return res.status(400).json({
        message: "Invalid agreement status.",
        allowedStatuses: Object.values(AgreementStatus),
      });
    }

    const existingAgreement = await prisma.agreement.findFirst({
      where: { id, practice: { ownerId: req.user.sub } },
    });

    if (!existingAgreement) {
      return res.status(404).json({ message: "Agreement not found." });
    }

    if (dealId) {
      const deal = await prisma.deal.findFirst({
        where: {
          id: dealId,
          practiceId: existingAgreement.practiceId,
          practice: { ownerId: req.user.sub },
        },
      });

      if (!deal) {
        return res
          .status(404)
          .json({ message: "Deal not found for agreement." });
      }
    }

    const agreement = await prisma.agreement.update({
      where: { id },
      data: {
        ...(dealId !== undefined ? { dealId: dealId || null } : {}),
        ...(type !== undefined ? { type: type as AgreementType } : {}),
        ...(status !== undefined ? { status: status as AgreementStatus } : {}),
        ...(effectiveDate !== undefined
          ? { effectiveDate: effectiveDate ? new Date(effectiveDate) : null }
          : {}),
        ...(renewalDate !== undefined
          ? { renewalDate: renewalDate ? new Date(renewalDate) : null }
          : {}),
      },
    });

    return res.status(200).json({
      message: "Agreement updated successfully.",
      agreement,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to update agreement.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function deleteAgreement(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const { id } = req.params;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Agreement id is required." });
    }

    const existingAgreement = await prisma.agreement.findFirst({
      where: { id, practice: { ownerId: req.user.sub } },
    });

    if (!existingAgreement) {
      return res.status(404).json({ message: "Agreement not found." });
    }

    await prisma.agreement.delete({ where: { id } });

    return res.status(200).json({ message: "Agreement deleted successfully." });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete agreement.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
