import {
    DealStage,
    AgreementStatus,
    AgreementType,
    OnboardingStatus,
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

  function formatAgreementDate(value?: Date | null) {
    if (!value) {
      return "Not specified";
    }

    return value.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  type DocusealSubmissionInput = {
    id?: string;
    docusealSubmissionId: number;
    status: string;
    url?: string;
    templateId?: number;
    slug?: string;
    fieldValues?: Record<string, string>;
    submissionApprovalNote?: string | null;
    submitters?: Array<{ role: string; uuid: string }>;
  };

  type AgreementBody = {
    practiceId?: string;
    dealId?: string | null;
    type?: string;
    status?: string;
    approvalStatus?: string;
    submissionApprovalStatus?: string;
    effectiveDate?: string;
    renewalDate?: string;
    docusealSubmissions?: DocusealSubmissionInput[];
    serviceIds?: string[];
  };

  type SendAgreementEmailBody = {
    agreementId: string;
    personId: string;
    subject?: string;
    message?: string;
  };

  type SendOnboardingFormBody = {
    agreementId: string;
    personId: string;
    subject?: string;
    message?: string;
    formLink?: string;
  };

  type AgreementMailSettings = {
    authorizedSigner: string | null;
    notifyTo: string[];
  };

  const AGREEMENT_APPROVAL_STATUSES = [
    "PENDING_APPROVAL",
    "APPROVED",
    "REJECTED",
  ] as const;

  type AgreementApprovalStatus = (typeof AGREEMENT_APPROVAL_STATUSES)[number];
  type SubmissionApprovalStatus = (typeof AGREEMENT_APPROVAL_STATUSES)[number];

  async function getAgreementMailSettings(): Promise<AgreementMailSettings> {
    const settings = await prisma.systemSettings.findFirst({
      select: {
        authorizedSigner: true,
        notifyTo: true,
      },
    });

    return {
      authorizedSigner: settings?.authorizedSigner?.trim() || null,
      notifyTo: (settings?.notifyTo || [])
        .map((email) => email.trim())
        .filter(Boolean),
    };
  }

  async function resolveInitialPacketTemplateIds(agreementId: string) {
    const agreement = await prisma.agreement.findFirst({
      where: { id: agreementId },
      include: {
        docusealSubmissions: {
          select: {
            templateId: true,
          },
        },
      },
    });

    if (!agreement) {
      return { error: "Agreement not found." as const };
    }

    const templateIds = agreement.docusealSubmissions
      .map((submission) => submission.templateId)
      .filter((value): value is number => value !== null);

    const uniqueTemplateIds = [...new Set(templateIds)];

    if (uniqueTemplateIds.length === 0) {
      return {
        error:
          "No DocuSeal templates were found on this agreement. Pass templateId explicitly or create the agreement with docusealSubmissions first.",
      };
    }

    return {
      agreement,
      templateIds: uniqueTemplateIds,
    };
  }

  function normalizeFieldValues(value: unknown): Record<string, string> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    return Object.entries(value).reduce<Record<string, string>>(
      (acc, [key, currentValue]) => {
        if (typeof currentValue === "string") {
          acc[key] = currentValue;
        } else if (currentValue !== null && currentValue !== undefined) {
          acc[key] = String(currentValue);
        }
        return acc;
      },
      {},
    );
  }

  function buildDocusealValuesBySubmitter(
    templateFields: Array<{
      uuid?: string;
      name?: string;
      submitter_uuid?: string;
    }>,
    fieldValues: Record<string, string>,
    submitterUuid?: string | null,
  ) {
    if (!submitterUuid) {
      return {};
    }

    return templateFields.reduce<Record<string, string>>((acc, field) => {
      const fieldName = String(field.name || "").trim();
      const fieldUuid = String(field.uuid || "").trim();

      if (!fieldName || field.submitter_uuid !== submitterUuid) {
        return acc;
      }

      const value = fieldValues[fieldName] ?? fieldValues[fieldUuid];

      if (value !== undefined) {
        acc[fieldName] = String(value);
      }

      return acc;
    }, {});
  }

  function buildReadonlyFieldsForSubmitter(
    templateFields: Array<{
      name?: string;
      type?: string;
      submitter_uuid?: string;
    }>,
    submitterUuid?: string | null,
    serviceNames?: string[],
  ) {
    if (!submitterUuid) {
      return [];
    }

    const normalizedServices = (serviceNames || [])
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean);

    return templateFields
      .filter(
        (field) =>
          String(field.name || "").trim() &&
          field.submitter_uuid === submitterUuid,
      )
      .map((field) => ({
        name: String(field.name || "").trim(),
        readonly:
          String(field.type || "").toLowerCase() !== "signature" &&
          !normalizedServices.includes(
            String(field.name || "").trim().toLowerCase(),
          ),
          required:true
      }));
  }

  async function updateDealAfterAgreementSend(agreementId: string) {
    const agreement = await prisma.agreement.findUnique({
      where: { id: agreementId },
      select: { dealId: true },
    });

    if (!agreement?.dealId) {
      return;
    }

    await prisma.deal.update({
      where: { id: agreement.dealId },
      data: {
        stage: DealStage.AGREEMENT_SENT,
        lastActivityAt: new Date(),
        activityCount: {
          increment: 1,
        },
        nextTaskTitle: "Awaiting agreement signatures",
      },
    });
  }

  async function updateDealAfterAgreementSigned(agreementId: string) {
    const agreement = await prisma.agreement.findUnique({
      where: { id: agreementId },
      select: { dealId: true },
    });

    if (!agreement?.dealId) {
      return;
    }

    await prisma.deal.update({
      where: { id: agreement.dealId },
      data: {
        stage: DealStage.ONBOARDING,
        lastActivityAt: new Date(),
        activityCount: {
          increment: 1,
        },
        nextTaskTitle: "Rate finalization pending",
      },
    });
  }

  export async function handleDocusealWebhook(req: Request, res: Response) {
    try {
      const { event_type, data } = req.body;

      let externalId: number;

      if (event_type === "form.completed") {
        console.log(event_type, data);
        externalId = data.submission_id;

        const dbSubmission = await prisma.docusealSubmission.findFirst({
          where: { docusealSubmissionId: externalId },
          include: { signers: true },
        });

        console.log({ dbSubmission });
        if (dbSubmission) {
          console.log("dbSubmission if condition");
          const signer = dbSubmission.signers.find((s) => s.email === data.email);

          if (signer) {
            console.log("udpating signers");
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

            console.log({ secondParty });
            if (secondParty?.email) {
              const agreement = await prisma.agreement.findUnique({
                where: { id: dbSubmission.agreementId },
                include: { practice: true },
              });

              const signerName =
                signer?.name || data.email || "the business owner";
              console.log({ signerName });
              const link = process.env.FRONTEND_URL
                ? `${process.env.FRONTEND_URL}/sign/${secondParty.submissionSlug}`
                : `http://localhost:5173/sign/${secondParty.submissionSlug}`;
              const subject = "Action Required: Please Sign the Agreement";
              const body = `
                <p>Hi ${secondParty.name || "there"},</p>
                <p>
                  ${signerName} has completed signing the
                  ${agreement?.type || "agreement"}
                  ${agreement?.practice ? ` for ${agreement.practice.name}` : ""}.
                </p>
                <p>Please review and sign the agreement using the link below.</p>
                <p>
                   <strong>Important:</strong>
                   The signing link will expire in 48 hours.
                </p>
                <p>
                ${decodeURIComponent(
                  dbSubmission?.url?.split("/").pop() || "",
                ).replace(
                  ".pdf",
                  "",
                )}: <a href="${link}" target="_blank">Review and sign the agreement</a>
                </p>
                <p>Best regards,<br/>The Tristate Team</p>
              `;

              await sendOutlookEmail(secondParty.email, subject, body);
              console.log({ sent: true });
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
        if (!dbSubmission) {
          return res.status(200).send("OK");
        }
        if (dbSubmission.status === "completed") {
          return res.status(200).send("OK");
        }

        await prisma.docusealSubmission.update({
          where: { docusealSubmissionId: externalId },
          data: {
            signedDocUrl: data.documents?.[0]?.url ?? undefined,
            auditLogUrl: data.audit_log_url ?? undefined,
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
              data: { status: AgreementStatus.SIGNED },
            });

            await updateDealAfterAgreementSigned(dbSubmission.agreementId);

          }
        }
      }
      return res.status(200).send("OK");
    } catch (error) {
      console.error("Docuseal webhook error:", error);
      return res.status(500).send("Internal Server Error");
    }
  }

  function buildAutoFillValues(
    fields: Array<{ name: string }>,
    person: {
      firstName: string;
      lastName: string;
      email?: string | null;
      phone?: string | null;
    },
    agreement: {
      effectiveDate?: Date | null;
      practice: { name: string; npi?: string | null };
    },
  ): Record<string, string> {
    const fullName = `${person.firstName} ${person.lastName}`;
    const effectiveDate =
      agreement.effectiveDate?.toISOString().split("T")[0] || "";

    const values: Record<string, string> = {};
    for (const field of fields) {
      const name = field.name.toLowerCase();

      if (name.includes("first")) {
        values[field.name] = person.firstName;
      } else if (name.includes("last")) {
        values[field.name] = person.lastName;
      } else if (name.includes("email")) {
        values[field.name] = person.email ?? "";
      } else if (name.includes("phone")) {
        values[field.name] = person.phone ?? "";
      } else if (
        name.includes("client") ||
        name.includes("practice") ||
        name.includes("clinic")
      ) {
        values[field.name] = agreement.practice.name;
      } else if (name.includes("npi")) {
        values[field.name] = agreement.practice.npi ?? "";
      } else if (name.includes("effective")) {
        values[field.name] = effectiveDate;
      } else if (name.includes("name") || name.includes("full")) {
        values[field.name] = fullName;
      } else if (name.includes("date")) {
        values[field.name] = effectiveDate;
      }
    }
    return values;
  }

  export async function createDocusealSubmission(
    req: AuthenticatedRequest,
    res: Response,
  ) {
    try {
      const {
        agreementId,
        personId,
        templateId,
        fieldValues,
        fieldValuesByTemplateId,
      } = req.body as {
        agreementId: string;
        personId: string;
        templateId?: number | number[];
        fieldValues?: Record<string, string>;
        fieldValuesByTemplateId?: Record<string, Record<string, string>>;
      };

      if (!req.user?.sub) {
        return res.status(401).json({ message: "Unauthorized." });
      }

      if (!agreementId || !personId) {
        return res.status(400).json({
          message: "agreementId and personId are required.",
        });
      }

      let templateIds = Array.isArray(templateId)
        ? templateId
        : templateId !== undefined
          ? [templateId]
          : [];

      const agreement = await prisma.agreement.findFirst({
        where: { id: agreementId },
        include: {
          practice: true,
          services: true,
          docusealSubmissions: {
            select: {
              templateId: true,
              fieldValues: true,
            },
          },
        },
      });

      if (!agreement) {
        return res.status(404).json({ message: "Agreement not found." });
      }

      if (templateIds.length === 0) {
        const resolved = await resolveInitialPacketTemplateIds(agreementId);

        if ("error" in resolved) {
          return res.status(400).json({ message: resolved.error });
        }

        templateIds = resolved.templateIds;
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

      const agreementMailSettings = await getAgreementMailSettings();

      const newSubmissions = [];

      for (const tid of templateIds) {
        const templateIdNumber = Number(tid);
        const template = await docuseal.getTemplate(templateIdNumber);
        const storedDraftSubmission = agreement.docusealSubmissions.find(
          (submission) => submission.templateId === templateIdNumber,
        );

        const autoFillValues = buildAutoFillValues(
          template.fields || [],
          person,
          agreement,
        );
        const persistedFieldValues = normalizeFieldValues(
          storedDraftSubmission?.fieldValues,
        );
        const requestFieldValues = normalizeFieldValues(
          fieldValuesByTemplateId?.[String(templateIdNumber)] ?? fieldValues,
        );
        const mergedValues = {
          // ...autoFillValues,
          ...persistedFieldValues,
          // ...requestFieldValues,
        };
        const firstPartyUuid =
          template.submitters?.find(
            (submitter: any) => submitter.name === "First Party",
          )?.uuid || null;
        const secondPartyUuid =
          template.submitters?.find(
            (submitter: any) => submitter.name === "Second Party",
          )?.uuid || null;
        const firstPartyValues = buildDocusealValuesBySubmitter(
          template.fields || [],
          mergedValues,
          firstPartyUuid,
        );
        const secondPartyValues = buildDocusealValuesBySubmitter(
          template.fields || [],
          mergedValues,
          secondPartyUuid,
        );
        const secondPartyFields = buildReadonlyFieldsForSubmitter(
          template.fields || [],
          secondPartyUuid,
          agreement.services.map((s) => s.name),
        );
        const expireAt = new Date();
        expireAt.setHours(expireAt.getHours() + 48);

        console.log(mergedValues);

        const submission: any = await docuseal.createSubmission({
          template_id: templateIdNumber,
          send_email: false,
          submitters: [
            // {
            //   role: "First Party",
            //   email: person.email,
            //   name: `${person.firstName} ${person.lastName}`,
            //   values: mergedValues,
            // },
            // {
            //   role: "Second Party",
            //   // email: "nmelchiorre@tristatemso.com",
            //   email: "pkolankar@medisticshealth.com",
            //   name: "TristateMSO",
            // },

            {
              role: "First Party",
              // email: "nmelchiorre@tristatemso.com",
              email:
                agreementMailSettings.authorizedSigner ||
                "SJangir@Tristatemso.com",
              name: "TristateMSO",
              values: firstPartyValues,
            },
            {
              role: "Second Party",
              email: person.email,
              name: `${person.firstName} ${person.lastName}`,
              // values: mergedValues,
              values: secondPartyValues,
              fields: secondPartyFields,
            },

            // {
            //   role: "First Party",
            //   // email: "nmelchiorre@tristatemso.com",
            //   email: agreementMailSettings.authorizedSigner,
            //   name: "TristateMSO",
            // },
            // {
            //   role: "Second Party",
            //   email: person.email,
            //   name: `${person.firstName} ${person.lastName}`,
            //   values: secondPartyValues,
            //   fields: secondPartyFields,
            // },
          ],
          expire_at: expireAt.toISOString(),
        });

        console.log(submission);

        const docusealSubmissionData = Array.isArray(submission)
          ? submission[0]
          : submission;

        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

        const existingSubmission = await prisma.docusealSubmission.findFirst({
          where: {
            agreementId,
            templateId: templateIdNumber,
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
              // url: docusealSubmissionData.submitters?.[0]?.url || null,
              fieldValues: mergedValues,
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
              templateId: templateIdNumber,
              fieldValues: mergedValues,
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

  export async function resubmitDocusealSubmission(
    req: AuthenticatedRequest,
    res: Response,
  ) {
    try {
      const {
        agreementId,
        personId,
        templateId,
        fieldValues,
        submissionApprovalStatus,
      } = req.body as {
        agreementId: string;
        personId: string;
        templateId: number;
        fieldValues?: Record<string, string>;
        submissionApprovalStatus: string;
      };

      if (!req.user?.sub) {
        return res.status(401).json({ message: "Unauthorized." });
      }

      if (!agreementId || !personId || !templateId) {
        return res.status(400).json({
          message: "agreementId, personId, and templateId are required.",
        });
      }

      if (submissionApprovalStatus !== "APPROVED") {
        return res.status(400).json({
          message: "Required Admin Approval to resend",
        });
      }

      const agreement = await prisma.agreement.findFirst({
        where: { id: agreementId },
        include: { practice: true, services: true },
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

      const agreementMailSettings = await getAgreementMailSettings();

      const template = await docuseal.getTemplate(templateId);
      const existingSubmission = await prisma.docusealSubmission.findFirst({
        where: {
          agreementId,
          templateId,
        },
        select: {
          id: true,
          docusealSubmissionId: true,
          fieldValues: true,
        },
      });

      const autoFillValues = buildAutoFillValues(
        template.fields || [],
        person,
        agreement,
      );

      if (existingSubmission?.docusealSubmissionId) {
        await docuseal.permanentlyDeleteSubmission(
          existingSubmission.docusealSubmissionId,
        );
      }

      const mergedValues = {
        // ...autoFillValues,
        ...normalizeFieldValues(existingSubmission?.fieldValues),
        // ...fieldValues,
      };
      const firstPartyUuid =
        template.submitters?.find(
          (submitter: any) => submitter.name === "First Party",
        )?.uuid || null;
      const secondPartyUuid =
        template.submitters?.find(
          (submitter: any) => submitter.name === "Second Party",
        )?.uuid || null;
      const firstPartyValues = buildDocusealValuesBySubmitter(
        template.fields || [],
        mergedValues,
        firstPartyUuid,
      );
      const secondPartyValues = buildDocusealValuesBySubmitter(
        template.fields || [],
        mergedValues,
        secondPartyUuid,
      );
      const secondPartyFields = buildReadonlyFieldsForSubmitter(
        template.fields || [],
        secondPartyUuid,
        agreement.services.map((s) => s.name),
      );

      console.log(mergedValues);
      const expireAt = new Date();
      expireAt.setHours(expireAt.getHours() + 48);
      const submission: any = await docuseal.createSubmission({
        template_id: templateId,
        send_email: false,
        submitters: [
          {
            role: "First Party",
            // email: "nmelchiorre@tristatemso.com",
            email:
              agreementMailSettings.authorizedSigner || "SJangir@Tristatemso.com",
            name: "TristateMSO",
            values: firstPartyValues,
          },
          {
            role: "Second Party",
            email: person.email,
            name: `${person.firstName} ${person.lastName}`,
            // values: mergedValues,
            values: secondPartyValues,
            fields: secondPartyFields,
          },

          // {
          //   role: "First Party",
          //   // email: "nmelchiorre@tristatemso.com",
          //   email: "pkolankar@medisticshealth.com",
          //   name: "TristateMSO",
          // },
          // {
          //   role: "Second Party",
          //   email: person.email,
          //   name: `${person.firstName} ${person.lastName}`,
          //   values: secondPartyValues,
          //   fields: secondPartyFields,
          // },
        ],
        expire_at: expireAt.toISOString(),
      });

      const docusealSubmissionData = Array.isArray(submission)
        ? submission[0]
        : submission;

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
            // url: docusealSubmissionData.submitters?.[0]?.url || null,
            fieldValues: mergedValues,
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
            templateId,
            fieldValues: mergedValues,
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

      const practiceName = agreement.practice?.name || "Unknown Practice";
      const templateName = template.name || `Template #${templateId}`;
      const emailSubject = `Updated Document Ready for Signature - ${agreement.type} - ${practiceName}`;
      const signingLink = docusealSubmissionData.submitters?.find(
        (s: any) => s.role === "First Party",
      )?.slug
        ? `${process.env.FRONTEND_URL || "http://localhost:5173"}/sign/${docusealSubmissionData.submitters.find((s: any) => s.role === "First Party").slug}`
        : "";
      const firstPartySigner = docusealSubmissionData.submitters?.find(
        (s: any) => s.role === "First Party",
      );

      const emailBody = `
        <p>Hello ${firstPartySigner?.name || "there"},</p>
        <p>The document <strong>${templateName}</strong> for your agreement
        <strong>${agreement.type}</strong> with <strong>${practiceName}</strong>
        has been updated.</p>
        <p><strong>Effective Date:</strong> ${formatAgreementDate(agreement.effectiveDate)}</p>
        <p><strong>Renewal Date:</strong> ${formatAgreementDate(agreement.renewalDate)}</p>
        <p>Please click the link below to review and sign the updated document.</p>
        <p>Once you sign, it will be routed to the client for signature.</p>
        <p>
           <strong>Important:</strong>
           The signing link will expire in 48 hours.
        </p>
        ${signingLink ? `<p><a href="${signingLink}" target="_blank">Review and Sign Updated Document</a></p>` : ""}
        <p>If you have any questions, please contact your representative.</p>
        <p>Best regards,<br/>The Tristate Team</p>
      `;
      console.log(firstPartySigner?.email, emailSubject, emailBody);

      const resppp = await sendOutlookEmail(
        firstPartySigner?.email || "SJangir@Tristatemso.com",
        emailSubject,
        emailBody,
        {
          cc: agreementMailSettings.notifyTo,
        },
      );
      console.log(resppp);

      await prisma.docusealSubmission.updateMany({
        where: { agreementId: agreementId },
        data: { submissionApprovalStatus: "APPROVED" },
      });

      return res.status(200).json({
        message: "Docuseal submission re-created and email sent successfully.",
        submission: newSubmission,
      });
    } catch (error) {
      return res.status(500).json({
        message: "Unable to resubmit Docuseal submission.",
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

      // const practicePersonExists = await prisma.practicePerson.findFirst({
      //   where: {
      //     personId,
      //     practiceId: agreement.practiceId,
      //   },
      // });

      // const personExists = await prisma.person.findFirst({
      //   where: { id: personId },
      // });

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

      const emailSubject =
        subject ||
        `Agreement: ${agreement.type} - ${agreement.practice?.name || "Unknown"}`;

      const firstPartySigners = agreement.docusealSubmissions.flatMap(
        (submission) =>
          submission.signers.filter((signer) => signer.role === "First Party"),
      );
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
               ${decodeURIComponent(
                 submission?.url?.split("/").pop() || "",
               ).replace(".pdf", "")}: <a href="${link}" target="_blank">
                  Sign Document
                </a>
              </p>
            `;
            }),
        )
        .join("");

      const firstPartyName = firstPartySigners[0]?.name || "there";
      const practiceName = agreement.practice?.name || "Unknown Practice";

      const emailBody = `
        <p>Hello ${firstPartyName},</p>

        <p>Please find the agreement details for
        <strong>${practiceName}</strong>.</p>

        <p><strong>Agreement Type:</strong> ${agreement.type}</p>
        <p><strong>Effective Date:</strong> ${formatAgreementDate(agreement.effectiveDate)}</p>
        <p><strong>Renewal Date:</strong> ${formatAgreementDate(agreement.renewalDate)}</p>

        <p><strong>Action Required:</strong> Please click the link below to review and sign the document.</p>
        <p>After you sign, the agreement will be routed to the client for signature.</p>

        <p>
           <strong>Important:</strong>
           The signing link will expire in 48 hours.
        </p>

        <p><strong>Documents:</strong></p>
        ${submissionLinks}

        ${message ? `<p>${escapeHtml(message)}</p>` : ""}

        <p>
          Best regards,<br/>
          The Tristate Team
        </p>
      `;

      const firstPartyEmail =
        firstPartySigners[0]?.email || "SJangir@Tristatemso.com";

      await sendOutlookEmail(firstPartyEmail, emailSubject, emailBody);

      await updateDealAfterAgreementSend(agreementId);

      await prisma.agreement.update({
        where: { id: agreementId },
        data: { status: "SENT" },
      });

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

  export async function sendOnboardingForm(
    req: AuthenticatedRequest,
    res: Response,
  ) {
    try {
      const { agreementId, personId, subject, message, formLink } =
        req.body as SendOnboardingFormBody;

      if (!req.user?.sub) {
        return res.status(401).json({ message: "Unauthorized." });
      }

      if (!agreementId || !personId) {
        return res.status(400).json({
          message: "agreementId and personId are required.",
        });
      }

      const agreement = await prisma.agreement.findFirst({
        where: { id: agreementId },
        include: {
          practice: true,
        },
      });

      if (!agreement) {
        return res.status(404).json({ message: "Agreement not found." });
      }
      if (agreement.status !== AgreementStatus.SIGNED) {
        return res.status(400).json({
          message: "Only signed agreements are eligible to send onboarding.",
        });
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
        select: {
          email: true,
          firstName: true,
        },
      });

      if (!person?.email) {
        return res.status(404).json({
          message: "Person not found for this practice or has no email address.",
        });
      }

      const existingOnboarding = await prisma.onboarding.findFirst({
        where: { practiceId: agreement.practiceId },
        select: { id: true, status: true },
      });

      if (
        existingOnboarding &&
        (existingOnboarding.status === OnboardingStatus.IN_PROGRESS ||
          existingOnboarding.status === OnboardingStatus.COMPLETED)
      ) {
        return res.status(409).json({
          message:
            "Onboarding is already in progress or completed for this practice.",
        });
      }

      if (existingOnboarding) {
        await prisma.onboarding.update({
          where: { id: existingOnboarding.id },
          data: { personId },
        });
      }

      const onboardingUrl =
        formLink ||
        `${process.env.FRONTEND_URL || "http://localhost:5173"}/onboarding/${agreement.practiceId}`;
      const emailSubject =
        subject ||
        `Complete Your Onboarding - ${agreement.practice?.name || "Practice"}`;
      const emailBody = `
        <p>Hi ${person.firstName || "there"},</p>
        <p>Your agreement has been completed successfully. Please complete your onboarding by clicking the link below:</p>
        <p><a href="${onboardingUrl}">Complete Onboarding</a></p>
        <p>If the link doesn't work, copy and paste this URL into your browser:</p>
        <p>${onboardingUrl}</p>
        ${message ? `<p>${escapeHtml(message)}</p>` : ""}
      `;

      await sendOutlookEmail(person.email, emailSubject, emailBody);

      return res.status(200).json({
        message: "Onboarding form sent successfully.",
      });
    } catch (error) {
      return res.status(500).json({
        message: "Unable to send onboarding form.",
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

  function isAgreementApprovalStatus(
    status: string,
  ): status is AgreementApprovalStatus {
    return AGREEMENT_APPROVAL_STATUSES.includes(
      status as AgreementApprovalStatus,
    );
  }

  function isSubmissionApprovalStatus(
    status: string,
  ): status is SubmissionApprovalStatus {
    return AGREEMENT_APPROVAL_STATUSES.includes(
      status as SubmissionApprovalStatus,
    );
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
        serviceIds,
      } = req.body as AgreementBody;

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
          services: {
            connect: serviceIds?.map((id) => ({ id })) || [],
          },
          docusealSubmissions: {
            create: docusealSubmissions?.map((s) => ({
              url: s.url,
              templateId: s.templateId,
              docSlug: s.slug,
              fieldValues: s.fieldValues,
              approval_status:
                ["ADMIN"].includes(req.user?.role || "") ? "APPROVED" : "PENDING_APPROVAL",
              // submissionApprovalStatus:
              //   ["ADMIN"].includes(req.user?.role || "") ? "APPROVED" : "PENDING_APPROVAL",
              submissionApprovalStatus: "APPROVED",
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
          services: true,
        },
      });

      const initialVersion = await prisma.agreementVersion.create({
        data: {
          agreementId: agreement.id,
          versionNumber: 1,
          isCurrent: true,
          effectiveDate: effectiveDate ? new Date(effectiveDate) : undefined,
          endDate: renewalDate ? new Date(renewalDate) : undefined,
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

      const isApprovedForAutoSend =
        (agreement.docusealSubmissions || []).length > 0 &&
        agreement.docusealSubmissions.every(
          (submission) => submission.approval_status === "APPROVED",
        );

      if (practice.status === "ACTIVE" && isApprovedForAutoSend) {
        const eligiblePerson = await prisma.person.findFirst({
          where: {
            email: {
              not: null,
            },
            practices: {
              some: {
                practiceId,
              },
            },
            OR: [{ role: "ADMIN" }, { role: "OWNER" }],
          },
        });

        if (eligiblePerson?.id && eligiblePerson.email) {
          const resolved = await resolveInitialPacketTemplateIds(agreement.id);

          if (!("error" in resolved)) {
            const agreementMailSettings = await getAgreementMailSettings();

            for (const currentTemplateId of resolved.templateIds) {
              const template = await docuseal.getTemplate(currentTemplateId);
              const existingSubmission = agreement.docusealSubmissions.find(
                (submission) => submission.templateId === currentTemplateId,
              );

              if (existingSubmission?.personId) {
                continue;
              }

              const mergedValues = {
                ...normalizeFieldValues(existingSubmission?.fieldValues),
              };
              const firstPartyUuid =
                template.submitters?.find(
                  (submitter: any) => submitter.name === "First Party",
                )?.uuid || null;
              const secondPartyUuid =
                template.submitters?.find(
                  (submitter: any) => submitter.name === "Second Party",
                )?.uuid || null;
              const firstPartyValues = buildDocusealValuesBySubmitter(
                template.fields || [],
                mergedValues,
                firstPartyUuid,
              );
              const secondPartyValues = buildDocusealValuesBySubmitter(
                template.fields || [],
                mergedValues,
                secondPartyUuid,
              );
              const secondPartyFields = buildReadonlyFieldsForSubmitter(
                template.fields || [],
                secondPartyUuid,
                agreement.services.map((s) => s.name),
              );

              const expireAt = new Date();
              expireAt.setHours(expireAt.getHours() + 48);
              const submission: any = await docuseal.createSubmission({
                template_id: currentTemplateId,
                send_email: false,
                submitters: [
                  {
                    role: "First Party",
                    email:
                      agreementMailSettings.authorizedSigner ||
                      "SJangir@Tristatemso.com",
                    name: "TristateMSO",
                    values: firstPartyValues,
                  },
                  {
                    role: "Second Party",
                    email: eligiblePerson.email,
                    name: `${eligiblePerson.firstName} ${eligiblePerson.lastName}`,
                    values: secondPartyValues,
                    fields: secondPartyFields,
                  },
                ],
                expire_at: expireAt.toISOString(),
              });

              const docusealSubmissionData = Array.isArray(submission)
                ? submission[0]
                : submission;

              if (existingSubmission) {
                await prisma.docuSigner.deleteMany({
                  where: { submissionId: existingSubmission.id },
                });

                for (
                  let i = 0;
                  i < docusealSubmissionData.submitters.length;
                  i++
                ) {
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

                await prisma.docusealSubmission.update({
                  where: { id: existingSubmission.id },
                  data: {
                    personId: eligiblePerson.id,
                    docusealSubmissionId:
                      docusealSubmissionData.submitters[0].submission_id,
                    // url: docusealSubmissionData.submitters?.[0]?.url || null,
                    fieldValues: mergedValues,
                  },
                });
              }
            }

            const refreshedAgreement = await prisma.agreement.findFirst({
              where: { id: agreement.id },
              include: {
                practice: true,
                docusealSubmissions: {
                  include: {
                    signers: true,
                  },
                },
              },
            });

            if (refreshedAgreement) {
              const firstPartySigners =
                refreshedAgreement.docusealSubmissions.flatMap((submission) =>
                  submission.signers.filter(
                    (signer) => signer.role === "First Party",
                  ),
                );
              const submissionLinks = refreshedAgreement.docusealSubmissions
                .flatMap((submission) =>
                  submission.signers
                    .filter((signer) => signer.role === "First Party")
                    .map((signer) => {
                      const link = process.env.FRONTEND_URL
                        ? `${process.env.FRONTEND_URL}/sign/${signer.submissionSlug}`
                        : `http://localhost:5173/sign/${signer.submissionSlug}`;

                      return `
              <p>
               ${decodeURIComponent(
                 submission?.url?.split("/").pop() || "",
               ).replace(".pdf", "")}: <a href="${link}" target="_blank">
                  Sign Document
                </a>
              </p>
            `;
                    }),
                )
                .join("");

              const firstPartyName = firstPartySigners[0]?.name || "there";
              const practiceName =
                refreshedAgreement.practice?.name || "Unknown Practice";
              const emailBody = `
        <p>Hello ${firstPartyName},</p>

        <p>Please find the agreement details for
        <strong>${practiceName}</strong>.</p>

        <p><strong>Agreement Type:</strong> ${refreshedAgreement.type}</p>

        <p><strong>Action Required:</strong> Please click the link below to review and sign the document.</p>
        <p>After you sign, the agreement will be routed to the client for signature.</p>

        <p>
           <strong>Important:</strong>
           The signing link will expire in 48 hours.
        </p>

        <p><strong>Documents:</strong></p>
        ${submissionLinks}

        <p>
          Best regards,<br/>
          The Tristate Team
        </p>
      `;

              const firstPartyEmail =
                firstPartySigners[0]?.email || "SJangir@Tristatemso.com";

              await sendOutlookEmail(
                firstPartyEmail,
                `Agreement: ${refreshedAgreement.type} - ${refreshedAgreement.practice?.name || "Unknown"}`,
                emailBody,
              );

              await updateDealAfterAgreementSend(agreement.id);

              await prisma.agreement.update({
                where: { id: agreement.id },
                data: { status: "SENT" },
              });
            }
          }
        }
      }

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
      const practiceId = (req.query.practiceId as string) || "";
      const approvalStatus = (req.query.approvalStatus as string) || "";
      const sortBy = req.query.sortBy as string | undefined;
      const orderDir =
        (req.query.sortOrder as string)?.toLowerCase() === "asc" ? "asc" : "desc";

      const skip = (page - 1) * limit;

      const where: any = {};
      if (practiceId) {
        where.practiceId = practiceId;
      }
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

      if (approvalStatus) {
        where.docusealSubmissions = {
          some: {
            approval_status: approvalStatus,
          },
        };
      }

      let orderBy: any = { createdAt: orderDir };
      if (sortBy === "type") {
        orderBy = { type: orderDir };
      } else if (sortBy === "status") {
        orderBy = { status: orderDir };
      } else if (sortBy === "value") {
        orderBy = { value: orderDir };
      } else if (sortBy === "effectiveDate") {
        orderBy = { effectiveDate: orderDir };
      } else if (sortBy === "updatedAt" || sortBy === "lastUpdate") {
        orderBy = { updatedAt: orderDir };
      } else if (sortBy === "createdAt" || sortBy === "creationDate") {
        orderBy = { createdAt: orderDir };
      }

      const [agreements, totalRecords] = await Promise.all([
        prisma.agreement.findMany({
          where,
          include: {
            practice: true,
            deal: true,
            channelPartners: true,
            docusealSubmissions: true,
            versions: true,
            services: true,
          },
          skip,
          take: limit,
          orderBy,
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

      const agreement = await prisma.agreement.findUnique({
        where: { id },
        include: {
          practice: true,
          deal: true,
          invoices: true,
          channelPartners: true,
          docusealSubmissions: true,
          versions: true,
          serviceTerms: true,
          services: true,
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
      const {
        dealId,
        type,
        status,
        approvalStatus,
        submissionApprovalStatus,
        effectiveDate,
        renewalDate,
        docusealSubmissions,
        serviceIds,
      } = req.body as AgreementBody;

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

      if (
        approvalStatus !== undefined &&
        !isAgreementApprovalStatus(approvalStatus)
      ) {
        return res.status(400).json({
          message: "Invalid agreement approvalStatus.",
          allowedStatuses: [...AGREEMENT_APPROVAL_STATUSES],
        });
      }

      if (
        submissionApprovalStatus !== undefined &&
        !isSubmissionApprovalStatus(submissionApprovalStatus)
      ) {
        return res.status(400).json({
          message: "Invalid submission approvalStatus.",
          allowedStatuses: [...AGREEMENT_APPROVAL_STATUSES],
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

      const isApprovalStatusUpdate =
        approvalStatus !== undefined && isAgreementApprovalStatus(approvalStatus);

      const agreement = await prisma.agreement.update({
        where: { id },
        data: {
          ...(dealId !== undefined ? { dealId: dealId || null } : {}),
          ...(type !== undefined ? { type: type as AgreementType } : {}),
          ...(status !== undefined && isAgreementStatus(status)
            ? { status: status as AgreementStatus }
            : {}),
          ...(effectiveDate !== undefined
            ? { effectiveDate: effectiveDate ? new Date(effectiveDate) : null }
            : {}),
          ...(renewalDate !== undefined
            ? { renewalDate: renewalDate ? new Date(renewalDate) : null }
            : {}),
          ...(serviceIds !== undefined
            ? { services: { set: serviceIds.map((id) => ({ id })) } }
            : {}),
        },
      });

      if (isApprovalStatusUpdate) {
        await prisma.docusealSubmission.updateMany({
          where: { agreementId: id },
          data: { approval_status: approvalStatus },
        });
      }

      if (submissionApprovalStatus !== undefined) {
        const submissionsToUpdate = docusealSubmissions?.length
          ? docusealSubmissions
          : [undefined];

        await Promise.all(
          submissionsToUpdate.map((submission) =>
            prisma.docusealSubmission.updateMany({
              where: {
                agreementId: id,
                ...(submission?.id ? { id: submission.id } : {}),
                ...(!submission?.id && submission?.templateId !== undefined
                  ? { templateId: submission.templateId }
                  : {}),
              },
              // data: { submissionApprovalStatus },
              data: {
                submissionApprovalStatus,
                ...(submission?.submissionApprovalNote !== undefined
                  ? {
                      submissionApprovalNote: submission.submissionApprovalNote,
                    }
                  : {}),
              },
            }),
          ),
        );
      }
      console.log("Creted Submission from updateAgreement");

      if (docusealSubmissions?.length) {
        await Promise.all(
          docusealSubmissions.map((submission) =>
            prisma.docusealSubmission.updateMany({
              where: {
                agreementId: id,
                ...(submission.templateId !== undefined
                  ? { templateId: submission.templateId }
                  : {}),
              },
              data: {
                ...(submission.fieldValues !== undefined
                  ? { fieldValues: submission.fieldValues }
                  : {}),
                ...(submission.submissionApprovalNote !== undefined
                  ? { submissionApprovalNote: submission.submissionApprovalNote }
                  : {}),
              },
            }),
          ),
        );
      }

      if (approvalStatus === "APPROVED") {
        const agreementForAutoSend = await prisma.agreement.findFirst({
          where: { id },
          include: {
            practice: true,
            services: true,
            docusealSubmissions: {
              include: {
                signers: true,
              },
            },
          },
        });

        const hasPendingAutoSendTemplates =
          agreementForAutoSend?.status !== "SENT" &&
          agreementForAutoSend?.practice?.status === "ACTIVE" &&
          (agreementForAutoSend.docusealSubmissions || []).length > 0 &&
          agreementForAutoSend.docusealSubmissions.every(
            (submission) => submission.approval_status === "APPROVED",
          ) &&
          agreementForAutoSend.docusealSubmissions.some(
            (submission) => submission.templateId && !submission.personId,
          );

        if (agreementForAutoSend && hasPendingAutoSendTemplates) {
          const eligiblePerson = await prisma.person.findFirst({
            where: {
              email: {
                not: null,
              },
              practices: {
                some: {
                  practiceId: agreementForAutoSend.practiceId,
                },
              },
              OR: [{ role: "ADMIN" }, { role: "OWNER" }],
            },
          });

          if (eligiblePerson?.id && eligiblePerson.email) {
            const agreementMailSettings = await getAgreementMailSettings();

            for (const existingSubmission of agreementForAutoSend.docusealSubmissions) {
              if (!existingSubmission.templateId || existingSubmission.personId) {
                continue;
              }

              const template = await docuseal.getTemplate(
                existingSubmission.templateId,
              );
              const mergedValues = {
                ...normalizeFieldValues(existingSubmission.fieldValues),
              };
              const firstPartyUuid =
                template.submitters?.find(
                  (submitter: any) => submitter.name === "First Party",
                )?.uuid || null;
              const secondPartyUuid =
                template.submitters?.find(
                  (submitter: any) => submitter.name === "Second Party",
                )?.uuid || null;
              const firstPartyValues = buildDocusealValuesBySubmitter(
                template.fields || [],
                mergedValues,
                firstPartyUuid,
              );
              const secondPartyValues = buildDocusealValuesBySubmitter(
                template.fields || [],
                mergedValues,
                secondPartyUuid,
              );
              const secondPartyFields = buildReadonlyFieldsForSubmitter(
                template.fields || [],
                secondPartyUuid,
                agreementForAutoSend.services.map((s) => s.name),
              );

              const expireAt = new Date();
              expireAt.setHours(expireAt.getHours() + 48);
              const submission: any = await docuseal.createSubmission({
                template_id: existingSubmission.templateId,
                send_email: false,
                submitters: [
                  {
                    role: "First Party",
                    email:
                      agreementMailSettings.authorizedSigner ||
                      "SJangir@Tristatemso.com",
                    name: "TristateMSO",
                    values: firstPartyValues,
                  },
                  {
                    role: "Second Party",
                    email: eligiblePerson.email,
                    name: `${eligiblePerson.firstName} ${eligiblePerson.lastName}`,
                    values: secondPartyValues,
                    fields: secondPartyFields,
                  },
                ],
                expire_at: expireAt.toISOString(),
              });

              const docusealSubmissionData = Array.isArray(submission)
                ? submission[0]
                : submission;

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

              await prisma.docusealSubmission.update({
                where: { id: existingSubmission.id },
                data: {
                  personId: eligiblePerson.id,
                  docusealSubmissionId:
                    docusealSubmissionData.submitters[0].submission_id,
                  // url: docusealSubmissionData.submitters?.[0]?.url || null,
                  fieldValues: mergedValues,
                },
              });
            }

            const refreshedAgreement = await prisma.agreement.findFirst({
              where: { id },
              include: {
                practice: true,
                docusealSubmissions: {
                  include: {
                    signers: true,
                  },
                },
              },
            });

            if (refreshedAgreement) {
              const firstPartySigners =
                refreshedAgreement.docusealSubmissions.flatMap((submission) =>
                  submission.signers.filter(
                    (signer) => signer.role === "First Party",
                  ),
                );
              const submissionLinks = refreshedAgreement.docusealSubmissions
                .flatMap((submission) =>
                  submission.signers
                    .filter((signer) => signer.role === "First Party")
                    .map((signer) => {
                      const link = process.env.FRONTEND_URL
                        ? `${process.env.FRONTEND_URL}/sign/${signer.submissionSlug}`
                        : `http://localhost:5173/sign/${signer.submissionSlug}`;

                      return `
              <p>
               ${decodeURIComponent(
                 submission?.url?.split("/").pop() || "",
               ).replace(".pdf", "")}: <a href="${link}" target="_blank">
                  Sign Document
                </a>
              </p>
            `;
                    }),
                )
                .join("");

              const firstPartyName = firstPartySigners[0]?.name || "there";
              const practiceName =
                refreshedAgreement.practice?.name || "Unknown Practice";
              const emailBody = `
        <p>Hello ${firstPartyName},</p>

        <p>Please find the agreement details for
        <strong>${practiceName}</strong>.</p>

        <p><strong>Agreement Type:</strong> ${refreshedAgreement.type}</p>

        <p><strong>Action Required:</strong> Please click the link below to review and sign the document.</p>
        <p>After you sign, the agreement will be routed to the client for signature.</p>

        <p>
           <strong>Important:</strong>
           The signing link will expire in 48 hours.
        </p>

        <p><strong>Documents:</strong></p>
        ${submissionLinks}

        <p>
          Best regards,<br/>
          The Tristate Team
        </p>
      `;

              const firstPartyEmail =
                firstPartySigners[0]?.email || "SJangir@Tristatemso.com";

              await sendOutlookEmail(
                firstPartyEmail,
                `Agreement: ${refreshedAgreement.type} - ${refreshedAgreement.practice?.name || "Unknown"}`,
                emailBody,
              );

              await updateDealAfterAgreementSend(id);

              await prisma.agreement.update({
                where: { id },
                data: { status: "SENT" },
              });
            }
          }
        }
      }

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

      const agreement = await prisma.agreement.update({
        where: { id },
        data: {
          status: AgreementStatus.INACTIVE,
        },
        include: {
          practice: true,
          deal: true,
          channelPartners: true,
          docusealSubmissions: true,
          versions: true,
        },
      });

      return res.status(200).json({
        message: "Agreement marked inactive successfully.",
        agreement,
      });
    } catch (error) {
      return res.status(500).json({
        message: "Unable to mark agreement inactive.",
        error: error instanceof Error ? error.message : error,
      });
    }
  }
