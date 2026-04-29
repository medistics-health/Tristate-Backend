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
  docusealSubmissionId: number;
  status: string;
  url?: string;
  templateId?: number;
  slug?: string;
  submitters?: [{ role: string; uuid: string }];
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

    let externalId: number;

    if (event_type === "form.completed") {
      console.log(event_type, data);
      externalId = data.id || data.submission_id;

      const dbSubmission = await prisma.docusealSubmission.findFirst({
        where: { docusealSubmissionId: data.submission_id },
        include: { signers: true },
      });
      if (dbSubmission) {
        const signer = dbSubmission.signers.find((s) => s.email === data.email);

        if (signer) {
          await prisma.docuSigner.update({
            where: { id: signer.id },
            data: {
              status: data.status, // "completed"
              signedAt: new Date(data.completed_at),
              ipAddress: data.ip,
              signedUrl: data.documents?.[0]?.url,
              auditUrl: data?.audit_log_url,
            },
          });
        }

        if (data?.role === "First Party") {
          const secondParty = dbSubmission.signers.find(
            (s) => s.role === "Second Party",
          );

          if (secondParty?.email) {
            const agreement = await prisma.agreement.findUnique({
              where: { id: dbSubmission.agreementId },
              include: { practice: true },
            });

            const signerName = signer?.name || data.email || "First Party";

            const link = process.env.FRONTEND_URL
              ? `${process.env.FRONTEND_URL}/sign/${secondParty.submissionSlug}`
              : `http://localhost:5173/sign/${secondParty.submissionSlug}`;
            const subject = "Action Required: Please Sign the Agreement";
            const body = `
              <p>Hi ${secondParty.name || "Second Party"},</p>
              <p>
                The client (${signerName}) has completed signing the
                ${agreement?.type || "agreement"}
                ${agreement?.practice ? ` for ${agreement.practice.name}` : ""}.
              </p>

              <p>
                <a href="${link}" target="_blank">Review and sign the agreement</a>
              </p>
              <p>Best regards,<br/>The Tristate Team</p>
            `;

            await sendOutlookEmail(secondParty.email, subject, body);
          }
        }
        // await prisma.docusealSubmission.update({
        //   where: { id: dbSubmission.id },
        //   data: {
        //     url: data.submission?.url,
        //     signedDocUrl: data.documents?.[0]?.url,
        //     auditLogUrl: data.audit_log_url,
        //     templateId: data.template?.id,
        //   },
        // });
        //
      }
    }

    if (event_type === "submission.completed") {
      console.log(event_type, data);
      externalId = data?.id;
      const submitters = data.submitters || [];
      const dbSubmission = await prisma.docusealSubmission.findFirst({
        where: { docusealSubmissionId: externalId },
        // include: { signers: true },
      });
      if (!dbSubmission) return;
      if (dbSubmission.status === "completed") return;

      await prisma.docusealSubmission.update({
        where: { docusealSubmissionId: externalId },
        data: {
          signedDocUrl: data.documents[0].url,
          auditLogUrl: data.audit_log_url,
          status: data.status,
        },
      });

      if (dbSubmission.personId) {
        const allDocs = await prisma.docusealSubmission.findMany({
          where: { personId: dbSubmission.personId },
        });

        const allCompleted = allDocs.every((doc) => doc.status === "completed");
        if (allCompleted) {
          await prisma.agreement.update({
            where: { id: dbSubmission.agreementId },
            data: { status: AgreementStatus.ACTIVE },
          });

          const person = await prisma.person.findFirst({
            where: { id: dbSubmission.personId },
            select: { email: true, firstName: true },
          });

          if (person?.email) {
            const onboardingUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/onboarding/${dbSubmission.personId}`;
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
            role: "First Party",
            email: person.email,
            name: `${person.firstName} ${person.lastName}`,
          },
          {
            role: "Second Party",
            email: "pakabari@medisticshealth.com",
            name: "TristateMSO",
          },
        ],
      });

      console.log(submission);

      const docusealSubmissionData = Array.isArray(submission)
        ? submission[0]
        : submission;

      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

      const existingSubmission = await prisma.docusealSubmission.findFirst({
        where: {
          agreementId,
          templateId: parseInt(tid),
        },
      });

      let newSubmission;
      if (existingSubmission) {
        await prisma.docuSigner.deleteMany({
          where: { submissionId: existingSubmission.id },
        });

        for (let i = 0; i < docusealSubmissionData.submitters.length; i++) {
          const sub = docusealSubmissionData.submitters[i];
          await prisma.docuSigner.create({
            data: {
              submissionId: existingSubmission.id,
              externalId: sub.id,
              signerUuid: sub.uuid,
              role: sub.role,
              name: sub.name,
              email: sub.email,
              status: sub.status,
              submissionSlug: sub.slug,
              signedUrl: sub.url,
              order: i,
            },
          });
        }

        newSubmission = await prisma.docusealSubmission.update({
          where: { id: existingSubmission.id },
          data: {
            personId,
            docusealSubmissionId:
              docusealSubmissionData.submitters[0].submission_id,
            url: docusealSubmissionData.submitters?.[0]?.url || null,
          },
        });
      } else {
        newSubmission = await prisma.docusealSubmission.create({
          data: {
            agreementId,
            personId,
            docusealSubmissionId:
              docusealSubmissionData.submitters[0].submission_id,
            url: docusealSubmissionData.submitters?.[0]?.url || null,
            templateId: parseInt(tid),
            signers: {
              create: docusealSubmissionData.submitters.map(
                (sub: any, index: number) => ({
                  signerUuid: sub.uuid,
                  role: sub.role,
                  name: sub.name,
                  email: sub.email,
                  status: sub.status,
                  signedUrl: sub.url,
                  order: index,
                }),
              ),
            },
          },
          include: {
            signers: true,
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
        docusealSubmissions: {
          include: {
            signers: true,
          },
        },
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

    // console.log({
    //   personId,
    //   practiceId: agreement.practiceId,
    //   practicePersonExists,
    //   personExists,
    //   person,
    // });

    if (!person || !person.email) {
      return res.status(404).json({
        message: "Person not found for this practice or has no email address.",
      });
    }

    const emailSubject =
      subject ||
      `Agreement: ${agreement.type} - ${agreement.practice?.name || "Unknown"}`;

    const submissionLinks = agreement.docusealSubmissions
      .flatMap((submission) =>
        submission.signers
          .filter((signer) => signer.role === "First Party")
          .map((signer, index) => {
            const link = process.env.FRONTEND_URL
              ? `${process.env.FRONTEND_URL}/sign/${signer.submissionSlug}`
              : `http://localhost:5173/sign/${signer.submissionSlug}`;

            return `
            <p>
              <a href="${link}" target="_blank">
                Sign Document
              </a>
            </p>
          `;
          }),
      )
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

      <p>
        Best regards,<br/>
        The Tristate Team
      </p>
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
            // docusealSubmissionId: null,
            url: s.url,
            templateId: s.templateId,
            docSlug: s.slug,
            signers: {
              create: s?.submitters?.map((init: any, index: number) => ({
                signerUuid: init.uuid,
                role: init.role,
                name: "",
                email: "",
                status: s.status || "awaiting",
                order: index,
              })),
            },
          })),
        },
      },
      include: {
        docusealSubmissions: true,
        versions: true,
      },
    });

    const initialVersion = await prisma.agreementVersion.create({
      data: {
        agreementId: agreement.id,
        versionNumber: 1,
        isCurrent: true,
        effectiveDate: effectiveDate ? new Date(effectiveDate) : undefined,
        notes: "Initial version auto-created with agreement creation.",
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
      agreement: {
        ...agreement,
        versions: [initialVersion],
      },
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
