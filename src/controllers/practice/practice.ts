import {
  PracticeSource,
  PracticeStatus,
} from "../../../generated/prisma/client";
import { Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { sendOutlookEmail } from "../../utils/outlook";

type PracticeBody = {
  name?: string;
  status?: string;
  region?: string;
  source?: string;
  bucket?: string[];
  companyId?: string;
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
      where: { id: practiceId, ownerId: req.user.sub },
    });

    if (!practice) {
      return res.status(404).json({ message: "Practice not found." });
    }

    const person = await prisma.person.findFirst({
      where: {
        id: personId,
        practiceId: practiceId,
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

export async function getPractices(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({
        message: "Unauthorized.",
      });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const { search, status, region, source, companyId } = req.query;

    const where: any = {
      ownerId: req.user.sub,
    };

    if (search) {
      where.name = { contains: search as string, mode: "insensitive" };
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

    const [practices, totalRecords] = await Promise.all([
      prisma.practice.findMany({
        where,
        include: {
          company: true,
          agreements: true,
          persons: true,
          _count: {
            select: { persons: true, deals: true, agreements: true },
          },
        },
        skip,
        take: limit,
        orderBy: {
          createdAt: "desc",
        },
      }),
      prisma.practice.count({ where }),
    ]);

    const totalPages = Math.ceil(totalRecords / limit);

    return res.status(200).json({
      message: "Practices fetched successfully.",
      practices,
      pagination: {
        totalRecords,
        totalPages,
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch practices.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function createPractice(req: AuthenticatedRequest, res: Response) {
  try {
    const { name, status, region, source, bucket, companyId } =
      req.body as PracticeBody;

    if (!req.user?.sub) {
      return res.status(401).json({
        message: "Unauthorized.",
      });
    }

    if (!name || !status || !region || !source || !Array.isArray(bucket)) {
      return res.status(400).json({
        message:
          "name, status, region, source and bucket are required. bucket must be an array.",
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

    if (companyId) {
      const company = await prisma.company.findFirst({
        where: { id: companyId, ownerId: req.user.sub },
      });
      if (!company) {
        return res.status(400).json({
          message: "Invalid companyId. Company not found or unauthorized.",
        });
      }
    }

    const practice = await prisma.practice.create({
      data: {
        name,
        status,
        region,
        source,
        bucket,
        companyId,
        ownerId: req.user.sub,
      },
    });

    return res.status(201).json({
      message: "Practice created successfully.",
      practice,
    });
  } catch (error) {
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
        ownerId: req.user.sub,
      },
      include: {
        company: true,
        persons: true,
        deals: true,
        agreements: true,
        invoices: true,
        audits: true,
        assessments: true,
      },
    });

    if (!practice) {
      return res.status(404).json({
        message: "Practice not found.",
      });
    }

    return res.status(200).json({
      message: "Practice fetched successfully.",
      practice,
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
    const { name, status, region, source, bucket, companyId } =
      req.body as PracticeBody;

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

    const existingPractice = await prisma.practice.findFirst({
      where: {
        id,
        ownerId: req.user.sub,
      },
    });

    if (!existingPractice) {
      return res.status(404).json({
        message: "Practice not found.",
      });
    }

    if (companyId) {
      const company = await prisma.company.findFirst({
        where: { id: companyId, ownerId: req.user.sub },
      });
      if (!company) {
        return res.status(400).json({
          message: "Invalid companyId. Company not found or unauthorized.",
        });
      }
    }

    const practice = await prisma.practice.update({
      where: { id },
      data: {
        name,
        status: status as PracticeStatus,
        region,
        source: source as PracticeSource,
        bucket,
        companyId,
      },
    });

    return res.status(200).json({
      message: "Practice updated successfully.",
      practice,
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
        ownerId: req.user.sub,
      },
    });

    if (!existingPractice) {
      return res.status(404).json({
        message: "Practice not found.",
      });
    }

    await prisma.practice.delete({
      where: { id },
    });

    return res.status(200).json({
      message: "Practice deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete practice.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
