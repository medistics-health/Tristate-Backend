import {
  AgreementStatus,
  AgreementType,
} from "../../../generated/prisma/client";
import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { sendOutlookEmail } from "../../utils/outlook";
import { docuseal } from "../../utils/docuseal";

function escapeHtml(str: string | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

type DocusealSubmissionInput = {
  externalId: number;
  status: string;
  url?: string;
  templateId?: number;
  slug?: string;
  submitter_uuid?: string;
};

type AgreementBody = {
  practiceId?: string;
  dealId?: string | null;
  type?: string;
  status?: string;
  effectiveDate?: string;
  renewalDate?: string;
  docusealSubmissions?: DocusealSubmissionInput[];
};

type SendAgreementEmailBody = {
  agreementId: string;
  personId: string;
  subject?: string;
  message?: string;
};

export async function handleDocusealWebhook(req: Request, res: Response) {
  try {
    const { event_type, data } = req.body;

    // console.log(event_type, data);

    if (
      event_type === "submission.completed"
      // ||
      // event_type === "form.completed"
    ) {
      const submitterUuid = data.submitters?.[0]?.uuid;
      const externalId = data.id;

      if (submitterUuid) {
        const submission = await prisma.docusealSubmission.findFirst({
          where: { submitterUuid: submitterUuid },
        });

        if (!submission && externalId) {
          const submissionByExternalId =
            await prisma.docusealSubmission.findFirst({
              where: { externalId: externalId },
            });
          if (submissionByExternalId) {
            await prisma.docusealSubmission.update({
              where: { id: submissionByExternalId.id },
              data: {
                status: "completed",
                submitterUuid: submitterUuid,
                url: data.submission?.url || null,
              },
            });
          }
        } else if (submission) {
          const signedDocUrls = data.documents[0]?.url;
          // data.documents?.map((d: any) => d.url) || data.documents[0]?.url;
          await prisma.docusealSubmission.update({
            where: { id: submission.id },
            data: {
              status: "completed",
              signedDocUrls: signedDocUrls,
              auditLogUrl: data.audit_log_url,
              embedUrl: data.submission?.url
                ? `${process.env.FRONTEND_URL || "http://localhost:5173"}/sign/${data.submission.url.split("/").pop()}`
                : submission.embedUrl,
            },
          });

          if (submission.personId) {
            const person = await prisma.person.findFirst({
              where: { id: submission.personId },
              select: { email: true, firstName: true },
            });

            const allSubmissions = await prisma.docusealSubmission.findMany({
              where: { personId: submission.personId },
            });

            const allCompleted = allSubmissions.every(
              (s) => s.status === "completed",
            );
            if (allCompleted) {
              await prisma.agreement.update({
                where: { id: submission.agreementId },
                data: { status: AgreementStatus.ACTIVE },
              });

              if (person?.email) {
                const onboardingUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/onboarding/${submission.personId}`;
                const subject = "Complete Your Onboarding";
                const body = `
                <p>Hi ${person.firstName || "there"},</p>
                <p>Your document has been signed successfully. Please complete your onboarding by clicking the link below:</p>
                <p><a href="${onboardingUrl}">Complete Onboarding</a></p>
                <p>If the link doesn't work, copy and paste this URL into your browser:</p>
                <p>${onboardingUrl}</p>
              `;
                await sendOutlookEmail(person.email, subject, body);
              }
            }
          }
        }
      } else if (
        event_type === "form.viewed" ||
        event_type === "form.started"
      ) {
        const submitterUuid = data.submitter_uuid || data.uuid;
        if (submitterUuid) {
          await prisma.docusealSubmission.updateMany({
            where: { submitterUuid: submitterUuid },
            data: {
              status: event_type === "form.viewed" ? "viewed" : "started",
            },
          });
        }
      }
    }
    return res.status(200).send("OK");
  } catch (error) {
    console.error("Docuseal webhook error:", error);
    return res.status(500).send("Internal Server Error");
  }
}

export async function createDocusealSubmission(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const { agreementId, personId, templateId } = req.body;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!agreementId || !personId || !templateId) {
      return res.status(400).json({
        message: "agreementId, personId and templateId are required.",
      });
    }

    const templateIds = Array.isArray(templateId) ? templateId : [templateId];

    const agreement = await prisma.agreement.findFirst({
      where: { id: agreementId },
      include: { practice: true },
    });

    if (!agreement) {
      return res.status(404).json({ message: "Agreement not found." });
    }

    const person = await prisma.person.findFirst({
      where: {
        id: personId,
        practices: {
          some: {
            practiceId: agreement.practiceId,
          },
        },
      },
    });

    if (!person || !person.email) {
      return res.status(404).json({
        message: "Person not found for this practice or has no email address.",
      });
    }

    const newSubmissions = [];

    for (const tid of templateIds) {
      const submission: any = await docuseal.createSubmission({
        template_id: parseInt(tid),
        send_email: false,
        submitters: [
          {
            role: "Signer",
            email: person.email,
            name: `${person.firstName} ${person.lastName}`,
          },
        ],
      });

      const docusealSubmissionData = Array.isArray(submission)
        ? submission[0]
        : submission;

      const submitter = docusealSubmissionData.submitters?.[0];
      const submitterUuid = submitter?.uuid || "";
      const signingSlug = submitter?.slug || docusealSubmissionData.slug || "";

      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
      const embedUrl = `${frontendUrl}/sign/${signingSlug}`;

      const existingSubmission = await prisma.docusealSubmission.findFirst({
        where: {
          agreementId,
          templateId: parseInt(tid),
        },
      });

      let newSubmission;
      if (existingSubmission) {
        newSubmission = await prisma.docusealSubmission.update({
          where: { id: existingSubmission.id },
          data: {
            personId,
            externalId: docusealSubmissionData.id,
            status: submitter.status,
            embedUrl: `${frontendUrl}/${existingSubmission.slug}`,
            submitterUuid: submitterUuid,
          },
        });
      } else {
        newSubmission = await prisma.docusealSubmission.create({
          data: {
            agreementId,
            personId,
            externalId: docusealSubmissionData.id,
            status: submitter.status,
            url: submitter?.url || null,
            embedUrl: embedUrl,
            submitterUuid: submitterUuid,
            templateId: parseInt(tid),
          },
        });
      }

      newSubmissions.push(newSubmission);
    }

    return res.status(200).json({
      message: "Docuseal submissions created successfully.",
      submissions: newSubmissions,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to create Docuseal submission.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getDocusealTemplates(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const templates = await docuseal.listTemplates({
      limit: 100,
    });

    return res.status(200).json({
      message: "Docuseal templates fetched successfully.",
      templates,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch Docuseal templates.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getDocusealFormBySlug(req: Request, res: Response) {
  try {
    const { slug } = req.params;

    if (!slug) {
      return res.status(400).json({ message: "Slug is required." });
    }

    const templates = await docuseal.listTemplates({ limit: 100 });

    const template = templates.data.find((t: any) => t.slug === slug);

    if (!template) {
      return res.status(404).json({ message: "Form not found." });
    }

    return res.status(200).json(template);
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch DocuSeal form.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

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
      where: {
        id: agreementId,
      },
      include: {
        practice: true,
        docusealSubmissions: true,
      },
    });

    if (!agreement) {
      return res.status(404).json({ message: "Agreement not found." });
    }

    const practicePersonExists = await prisma.practicePerson.findFirst({
      where: {
        personId,
        practiceId: agreement.practiceId,
      },
    });

    const personExists = await prisma.person.findFirst({
      where: { id: personId },
    });

    const person = await prisma.person.findFirst({
      where: {
        id: personId,
        practices: {
          some: {
            practiceId: agreement.practiceId,
          },
        },
      },
    });

    console.log({
      personId,
      practiceId: agreement.practiceId,
      practicePersonExists,
      personExists,
      person,
    });

    if (!person || !person.email) {
      return res.status(404).json({
        message: "Person not found for this practice or has no email address.",
      });
    }

    const emailSubject =
      subject ||
      `Agreement: ${agreement.type} - ${agreement.practice?.name || "Unknown"}`;

    const submissionLinks = agreement.docusealSubmissions
      .map((doc, index) => {
        const link = process.env.FRONTEND_URL
          ? `${process.env.FRONTEND_URL}/sign/${doc.slug}`
          : `http://localhost:5173/sign/${doc.slug}`;
        if (!link) return "";
        return `
            <p>
              Document ${index + 1}:
              <a href="${link}" target="_blank">
                Sign Document
              </a>
            </p>
          `;
      })
      .join("");

    const personName = person.firstName || "there";
    const practiceName = agreement.practice?.name || "Unknown Practice";

    const emailBody = `
      <p>Hello ${personName},</p>

      <p>Please find the agreement details for
      <strong>${practiceName}</strong>.</p>

      <p><strong>Agreement Type:</strong> ${agreement.type}</p>

      <p><strong>Action Required:</strong> Please click the link below to review and sign the document.</p>

      <p><strong>Documents:</strong></p>
      ${submissionLinks}

      ${message ? `<p>${escapeHtml(message)}</p>` : ""}

      <p>Best regards,<br/>The Team</p>
    `;

    await sendOutlookEmail(person.email, emailSubject, emailBody);

    return res.status(200).json({
      message: "Agreement email sent successfully.",
    });
  } catch (error) {
    console.log(error);
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
    const {
      practiceId,
      dealId,
      type,
      status,
      effectiveDate,
      renewalDate,
      docusealSubmissions,
    } = req.body as AgreementBody;
    console.log(docusealSubmissions);

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
      where: { id: practiceId },
    });

    if (!practice) {
      return res.status(404).json({ message: "Practice not found." });
    }

    if (dealId) {
      const deal = await prisma.deal.findFirst({
        where: { id: dealId, practiceId },
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
        docusealSubmissions: {
          create: docusealSubmissions?.map((s) => ({
            externalId: s.externalId,
            status: s.status,
            url: s.url,
            templateId: s.templateId,
            slug: s.slug,
            submitterUuid: s.submitter_uuid,
          })),
        },
      },
      include: {
        docusealSubmissions: true,
      },
    });

    await prisma.practice.update({
      where: { id: practiceId },
      data: {
        agreements: {
          connect: { id: agreement.id },
        },
      },
    });

    return res.status(201).json({
      message: "Agreement created successfully.",
      agreement,
    });
  } catch (error) {
    console.log(error);
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

    const where: any = {};

    if (search) {
      where.practice = {
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
          docusealSubmissions: true,
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
    const { id } = req.params as { id: string };

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Agreement id is required." });
    }

    const agreement = await prisma.agreement.findFirst({
      where: { id },
      include: {
        practice: true,
        deal: true,
        invoices: true,
        channelPartners: true,
        docusealSubmissions: true,
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
    const { id } = req.params as { id: string };
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
      where: { id },
    });

    if (!existingAgreement) {
      return res.status(404).json({ message: "Agreement not found." });
    }

    if (dealId) {
      const deal = await prisma.deal.findFirst({
        where: {
          id: dealId,
          practiceId: existingAgreement.practiceId,
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
    const { id } = req.params as { id: string };

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Agreement id is required." });
    }

    const existingAgreement = await prisma.agreement.findFirst({
      where: { id },
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
