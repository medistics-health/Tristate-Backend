import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import {
  PricingModel,
  ApprovalDecisionStatus,
  ApprovalEntityType,
  UserRoles,
} from "../../../generated/prisma/client";
import { sendOutlookEmail } from "../../utils/outlook";

function isPricingModel(value: string): value is PricingModel {
  return Object.values(PricingModel).includes(value as PricingModel);
}

function asOptionalDate(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${fieldName}.`);
  }

  return parsed;
}

function asNonNegativeNumber(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function validatePricingConfig(
  pricingModel: PricingModel,
  pricingConfig: Record<string, unknown>,
) {
  const fail = (message: string) => ({ valid: false as const, message });
  const hasNonNegative = (value: unknown) => asNonNegativeNumber(value) !== null;

  switch (pricingModel) {
    case PricingModel.FIXED_MONTHLY:
    case PricingModel.FIXED_ONE_TIME:
    case PricingModel.RETAINER:
      if (!hasNonNegative(pricingConfig.amount)) {
        return fail("Amount is required and must be 0 or greater.");
      }
      return { valid: true as const };

    case PricingModel.PERCENT_COLLECTIONS:
    case PricingModel.PERCENT_REVENUE:
    case PricingModel.PERCENT_PROFIT:
    case PricingModel.SUCCESS_FEE:
      if (
        !hasNonNegative(pricingConfig.percentage) &&
        !hasNonNegative(pricingConfig.ratePercent) &&
        !hasNonNegative(pricingConfig.rate)
      ) {
        return fail("Percentage is required and must be 0 or greater.");
      }
      return { valid: true as const };

    case PricingModel.PER_UNIT:
    case PricingModel.PER_ENCOUNTER:
    case PricingModel.PER_PATIENT:
    case PricingModel.PER_PROVIDER:
    case PricingModel.PER_SITE:
      if (!hasNonNegative(pricingConfig.unitRate) && !hasNonNegative(pricingConfig.rate)) {
        return fail("Rate is required and must be 0 or greater.");
      }
      return { valid: true as const };

    case PricingModel.PER_CPT_CODE: {
      const cptCodes = Array.isArray(pricingConfig.cptCodes) ? pricingConfig.cptCodes : [];
      if (cptCodes.length === 0) {
        return fail("At least one CPT code is required.");
      }
      const invalidRow = cptCodes.find((row) => {
        if (!row || typeof row !== "object") return true;
        const code = String((row as Record<string, unknown>).code ?? "").trim();
        return !code || asNonNegativeNumber((row as Record<string, unknown>).rate) === null;
      });
      if (invalidRow) {
        return fail("Each CPT entry must include a code and a non-negative rate.");
      }
      return { valid: true as const };
    }

    case PricingModel.HYBRID:
    case PricingModel.MULTI_COMPONENT: {
      const components = Array.isArray(pricingConfig.components)
        ? pricingConfig.components
        : [];
      if (components.length === 0) {
        return fail("At least one hybrid component is required.");
      }
      const invalidComponent = components.find((component) => {
        if (!component || typeof component !== "object") return true;
        return asNonNegativeNumber((component as Record<string, unknown>).value) === null;
      });
      if (invalidComponent) {
        return fail("Each hybrid component must have a non-negative value.");
      }
      return { valid: true as const };
    }

    default:
      return { valid: true as const };
  }
}

function parseNumericValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function getPricingTotal(pricingModel: string, pricingConfig: Record<string, unknown>) {
  switch (pricingModel) {
    case "FIXED_MONTHLY":
    case "FIXED_ONE_TIME":
    case "RETAINER":
      return parseNumericValue(pricingConfig.amount);
    case "PERCENT_COLLECTIONS":
    case "PERCENT_REVENUE":
    case "PERCENT_PROFIT":
    case "SUCCESS_FEE": {
      const percentage = parseNumericValue(
        pricingConfig.percentage ?? pricingConfig.ratePercent ?? pricingConfig.rate,
      );
      return (
        percentage +
        parseNumericValue(pricingConfig.minimumFee) +
        parseNumericValue(pricingConfig.maximumFee)
      );
    }
    case "PER_UNIT":
    case "PER_ENCOUNTER":
    case "PER_PATIENT":
    case "PER_PROVIDER":
    case "PER_SITE": {
      const unitRate = parseNumericValue(
        pricingConfig.unitRate ?? pricingConfig.rate,
      );
      return (
        unitRate +
        parseNumericValue(pricingConfig.minimumFee)
      );
    }
    case "PER_CPT_CODE": {
      const cptCodes = Array.isArray(pricingConfig.cptCodes)
        ? pricingConfig.cptCodes
        : [];
      return cptCodes.reduce((sum, row) => {
        if (!row || typeof row !== "object") return sum;
        return sum + parseNumericValue((row as Record<string, unknown>).rate);
      }, 0);
    }
    case "HYBRID": {
      const components = Array.isArray(pricingConfig.components)
        ? pricingConfig.components
        : [];
      return components.reduce((sum, component) => {
        if (!component || typeof component !== "object") return sum;
        return sum + parseNumericValue((component as Record<string, unknown>).value);
      }, 0);
    }
    default:
      return parseNumericValue(pricingConfig.amount);
  }
}

function getPricingTermApprovalData(
  pricingModel: PricingModel,
  pricingConfig: Record<string, unknown>,
) {
  const clientAmount = getPricingTotal(pricingModel, pricingConfig);
  const vendorPricing = pricingConfig.vendorPricing as Record<string, unknown> | undefined;
  const vendorModel =
    typeof vendorPricing?.pricingModel === "string"
      ? String(vendorPricing.pricingModel)
      : pricingModel;
  const vendorAmount = vendorPricing
    ? getPricingTotal(vendorModel, vendorPricing)
    : 0;
  const grossMargin = clientAmount - vendorAmount;
  const marginPct = clientAmount > 0
    ? Number(((grossMargin / clientAmount) * 100).toFixed(2))
    : 0;

  return {
    clientAmount,
    vendorAmount,
    grossMargin,
    marginPct,
    requiresApproval: clientAmount > 0 && marginPct < 20,
  };
}

function parseEmailList(value: unknown) {
  if (typeof value !== "string") return [] as string[];
  return value
    .split(",")
    .map((email) => email.trim())
    .filter((email) => email);
}

function getSignerEmails(
  pricingConfig: Record<string, unknown>,
  externalReference?: string | null,
) {
  const signerEmails: string[] = [];

  if (Array.isArray(pricingConfig.signerEmails)) {
    for (const raw of pricingConfig.signerEmails) {
      if (typeof raw === "string" && raw.trim()) {
        signerEmails.push(raw.trim());
      }
    }
  }

  if (signerEmails.length === 0 && typeof externalReference === "string") {
    signerEmails.push(...parseEmailList(externalReference));
  }

  return [...new Set(signerEmails)];
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml(str: string | undefined | null) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function getApprovalRecipientEmails() {
  const configured = process.env.PRICING_TERM_APPROVAL_EMAILS
    ? process.env.PRICING_TERM_APPROVAL_EMAILS
        .split(",")
        .map((email) => email.trim())
        .filter(Boolean)
    : [];

  if (configured.length > 0) {
    return configured;
  }

  const users = await prisma.user.findMany({
    where: { role: UserRoles.INTERNAL },
    select: { email: true },
  });

  return users.map((user) => user.email).filter((email): email is string => Boolean(email));
}

async function sendPricingTermNotificationEmails(
  req: Request,
  term: any,
) {
  if (!term) return;

  const pricingConfig = term.pricingConfig as Record<string, unknown>;
  const signerEmails = getSignerEmails(pricingConfig, term.externalReference).filter(isValidEmail);
  const approvalData = getPricingTermApprovalData(term.pricingModel, pricingConfig);
  const backendBaseUrl = `${req.protocol}://${req.get("host")}`;
  const approvalUrl = `${backendBaseUrl}/api/v1/agreements/service-terms/${term.id}/approval`;

  const agreementName = term.agreement?.practice?.name ?? "Agreement";
  const serviceName = term.service?.name ?? "Service";
  const vendorName = term.vendor?.name ?? "N/A";
  const approvalNotes = typeof pricingConfig.approvalNotes === "string"
    ? pricingConfig.approvalNotes
    : "";

  const summaryHtml = `
    <p><strong>Agreement:</strong> ${escapeHtml(agreementName)}</p>
    <p><strong>Service:</strong> ${escapeHtml(serviceName)}</p>
    <p><strong>Pricing Model:</strong> ${escapeHtml(term.pricingModel)}</p>
    <p><strong>Client Amount:</strong> $${approvalData.clientAmount.toFixed(2)}</p>
    <p><strong>Vendor Amount:</strong> $${approvalData.vendorAmount.toFixed(2)}</p>
    <p><strong>Margin:</strong> ${approvalData.marginPct.toFixed(2)}%</p>
    ${approvalNotes ? `<p><strong>Approval Notes:</strong> ${escapeHtml(approvalNotes)}</p>` : ""}
  `;

  const signerSummaryHtml = `
    <p><strong>Agreement:</strong> ${escapeHtml(agreementName)}</p>
    <p><strong>Service:</strong> ${escapeHtml(serviceName)}</p>
    <p><strong>Pricing Model:</strong> ${escapeHtml(term.pricingModel)}</p>
    <p><strong>Client Amount:</strong> $${approvalData.clientAmount.toFixed(2)}</p>
    <p><strong>Margin:</strong> ${approvalData.marginPct.toFixed(2)}%</p>
    ${approvalNotes ? `<p><strong>Approval Notes:</strong> ${escapeHtml(approvalNotes)}</p>` : ""}
  `;

  if (signerEmails.length > 0) {
    const signerSubject = `Pricing Packet Generated – ${serviceName}`;
    const signerBody = `
      <p>Hi,</p>
      <p>A pricing packet has been generated for <strong>${escapeHtml(serviceName)}</strong> in agreement <strong>${escapeHtml(agreementName)}</strong>.</p>
      ${signerSummaryHtml}
      <p>This packet was generated after pricing term creation.</p>
      <p>Thank you.</p>
    `;

    await Promise.all(
      signerEmails.map((email) => sendOutlookEmail(email, signerSubject, signerBody)),
    );
  }

  if (approvalData.requiresApproval) {
    const approvalEmails = await getApprovalRecipientEmails();
    if (approvalEmails.length > 0) {
      const approvalSubject = `Approval Required — Pricing Term for ${serviceName}`;
      const approvalBody = `
        <p>Hi,</p>
        <p>A pricing term requires internal approval for <strong>${escapeHtml(serviceName)}</strong> in agreement <strong>${escapeHtml(agreementName)}</strong>.</p>
        ${summaryHtml}
        <p><a href="${approvalUrl}" style="display:inline-block;padding:10px 16px;border-radius:6px;background:#4f63ea;color:#ffffff;text-decoration:none;">Review Pricing Term</a></p>
        <p>If the button does not work, copy and paste this URL into your browser:</p>
        <p>${escapeHtml(approvalUrl)}</p>
      `;

      await Promise.all(
        approvalEmails.map((email) => sendOutlookEmail(email, approvalSubject, approvalBody)),
      );
    }
  }
}

async function findOverlappingActiveTerm(params: {
  agreementId: string;
  serviceId: string;
  vendorId?: string | null;
  pricingModel: PricingModel;
  effectiveDate?: Date;
  endDate?: Date;
  excludeId?: string;
}) {
  const { agreementId, serviceId, vendorId, pricingModel, effectiveDate, endDate, excludeId } = params;

  return prisma.agreementServiceTerm.findFirst({
    where: {
      agreementId,
      serviceId,
      vendorId: vendorId || null,
      pricingModel,
      isActive: true,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
      AND: [
        {
          OR: [{ effectiveDate: null }, { effectiveDate: { lte: endDate ?? new Date("9999-12-31T23:59:59.999Z") } }],
        },
        {
          OR: [{ endDate: null }, { endDate: { gte: effectiveDate ?? new Date("1900-01-01T00:00:00.000Z") } }],
        },
      ],
    },
    select: { id: true },
  });
}

export async function getAgreementServiceTermApprovalPage(req: Request, res: Response) {
  try {
    const termId = req.params.id as string;
    const term = await prisma.agreementServiceTerm.findUnique({
      where: { id: termId },
      include: {
        agreement: { include: { practice: true } },
        service: true,
        vendor: true,
      },
    });

    if (!term) {
      return res.status(404).send("Pricing term not found.");
    }

    const pricingConfig = term.pricingConfig as Record<string, unknown>;
    const approvalData = getPricingTermApprovalData(term.pricingModel, pricingConfig);
    const signerEmails = getSignerEmails(pricingConfig, term.externalReference);
    const approvalStatus = term.approvalStatus ?? (approvalData.requiresApproval ? ApprovalDecisionStatus.PENDING : "No approval required");
    const actionUrl = `/api/v1/agreements/service-terms/${term.id}/approval`;
    const approvalDecisions = await prisma.approvalDecision.findMany({
      where: {
        entityType: ApprovalEntityType.AGREEMENT_TERM,
        entityId: termId,
      },
      orderBy: { decidedAt: "desc" },
      include: { decidedByUser: true },
    });

    const formatDate = (value: Date | string | undefined | null) => {
      if (!value) return null;
      const date = value instanceof Date ? value : new Date(String(value));
      if (Number.isNaN(date.getTime())) return null;
      return date.toLocaleDateString("en-US", {
        month: "numeric",
        day: "numeric",
        year: "numeric",
      });
    };

    const formatCurrency = (value: number | undefined | null) => {
      if (value === undefined || value === null || isNaN(value)) return null;
      return `$${value.toFixed(2)}`;
    };

    const approvalState = approvalStatus === ApprovalDecisionStatus.PENDING
      ? "Pending Approval"
      : approvalStatus === ApprovalDecisionStatus.APPROVED
      ? "Approved"
      : approvalStatus === ApprovalDecisionStatus.REJECTED
      ? "Rejected"
      : "No approval required";

    const approvalStatusCss = approvalStatus === ApprovalDecisionStatus.APPROVED
      ? "badge-approved"
      : approvalStatus === ApprovalDecisionStatus.REJECTED
      ? "badge-rejected"
      : "badge-pending";

    const approvalNotesText = typeof pricingConfig.approvalNotes === "string" && pricingConfig.approvalNotes.trim()
      ? pricingConfig.approvalNotes.trim()
      : null;

    const collectionSource =
      typeof pricingConfig.collectionSource === "string" && pricingConfig.collectionSource.trim()
        ? pricingConfig.collectionSource.trim()
        : null;

    const vendorPricing =
      typeof pricingConfig.vendorPricing === "object" && pricingConfig.vendorPricing !== null
        ? pricingConfig.vendorPricing as Record<string, unknown>
        : undefined;

    const vendorPricingAmount = vendorPricing?.amount !== undefined && vendorPricing?.amount !== null
      ? (typeof vendorPricing.amount === "number"
        ? formatCurrency(vendorPricing.amount)
        : typeof vendorPricing.amount === "string" && !Number.isNaN(Number(vendorPricing.amount))
        ? formatCurrency(Number(vendorPricing.amount))
        : null)
      : null;

    const vendorPricingSource =
      typeof vendorPricing?.collectionSource === "string" && vendorPricing.collectionSource.trim()
        ? vendorPricing.collectionSource.trim()
        : null;

    const effectiveStartDate = formatDate(term.effectiveDate);
    const effectiveEndDate = formatDate(term.endDate);
    const agreementName = term.agreement?.practice?.name?.trim() || null;
    const serviceName = term.service?.name?.trim() || null;
    const vendorName = term.vendor?.name?.trim() || null;
    const currencyValue = term.currency?.trim() || null;

    // Format margin values
    const clientRevenue = formatCurrency(approvalData.clientRevenue);
    const vendorCost = formatCurrency(approvalData.vendorCost);
    const grossMargin = formatCurrency(approvalData.grossMargin);
    const marginPct = approvalData.marginPct !== undefined && !isNaN(approvalData.marginPct)
      ? `${approvalData.marginPct.toFixed(2)}%`
      : null;

    const html = `
      <!doctype html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Pricing Term Approval</title>
        <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box; }
          body { 
            font-family: 'Google Sans', 'Roboto', sans-serif; 
            background: #f3f4f6; 
            color: #1a202c; 
            margin: 0; 
            padding: 24px;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }
          .card { 
            background: #ffffff; 
            border-radius: 16px; 
            box-shadow: 0 10px 30px rgba(0,0,0,0.08); 
            max-width: 900px; 
            margin: 0 auto; 
            padding: 32px; 
          }
          h1 { margin: 0 0 8px 0; font-size: 1.75rem; font-weight: 600; color: #1a202c; }
          .intro { margin: 0 0 18px 0; color: #64748b; font-size: 0.98rem; font-weight: 400; line-height: 1.5; }
          .badge { 
            display: inline-flex; 
            align-items: center; 
            gap: 8px; 
            padding: 8px 14px; 
            border-radius: 9999px; 
            font-size: 0.85rem; 
            font-weight: 600;
            margin-bottom: 24px;
          }
          .badge-pending { background: #fef3c7; color: #92400e; }
          .badge-approved { background: #d1fae5; color: #166534; }
          .badge-rejected { background: #fee2e2; color: #991b1b; }
          .button { 
            display: inline-flex; 
            align-items: center; 
            justify-content: center; 
            padding: 10px 18px; 
            border-radius: 8px; 
            color: #fff; 
            background: #4f46e5; 
            text-decoration: none; 
            font-weight: 600; 
            font-family: 'Google Sans', sans-serif;
            margin-right: 10px; 
            margin-top: 10px;
            border: none; 
            cursor: pointer;
            transition: background 0.2s;
          }
          .button:hover { background: #4338ca; }
          .button.reject { background: #ef4444; }
          .button.reject:hover { background: #dc2626; }
          .field { margin-bottom: 16px; }
          .field label { display: block; margin-bottom: 6px; font-weight: 600; font-size: 0.92rem; color: #1a202c; }
          .field textarea { 
            width: 100%; 
            min-height: 96px; 
            padding: 12px; 
            border: 1px solid #e2e8f0; 
            border-radius: 10px; 
            font-family: 'Google Sans', sans-serif; 
            font-size: 0.95rem; 
            resize: vertical;
          }
          .field textarea:focus { outline: none; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.08); }
          .section { margin-bottom: 32px; }
          .section h2 { margin: 0 0 16px 0; font-size: 1.1rem; font-weight: 600; color: #1a202c; }
          
          /* Row-wise detail cards */
          .detail-row { 
            display: flex; 
            flex-direction: column;
            gap: 12px;
            margin-bottom: 16px;
          }
          .detail-card { 
            background: #f8fafc; 
            border-radius: 12px; 
            padding: 16px; 
            border: 1px solid #e2e8f0;
          }
          .detail-card dt { 
            font-size: 0.73rem; 
            color: #64748b; 
            text-transform: uppercase; 
            letter-spacing: 0.06em; 
            font-weight: 700;
            margin-bottom: 10px;
          }
          .detail-card dd { 
            margin: 0; 
            font-size: 0.95rem; 
            color: #1a202c; 
            font-weight: 600; 
            line-height: 1.5; 
            word-break: break-word;
            white-space: pre-wrap;
          }
          
          /* Highlighted value cards */
          .value-card {
            background: #f8fafc;
            border-radius: 12px;
            padding: 16px;
            border: 1px solid #e2e8f0;
            margin-bottom: 12px;
          }
          .value-card dt {
            font-size: 0.73rem;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            font-weight: 700;
            margin-bottom: 10px;
          }
          .value-card dd {
            margin: 0;
            font-size: 1.25rem;
            font-weight: 700;
            line-height: 1.4;
            word-break: break-word;
          }
          .value-card.revenue dd { color: #4f46e5; }
          .value-card.cost dd { color: #ef4444; }
          .value-card.margin dd { color: #10b981; }
          .value-card.margin-percent dd { color: #10b981; }
          .value-card.margin-low dd { color: #f59e0b; }
          
          .history-table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 0.9rem; }
          .history-table th { background: #f8fafc; padding: 12px 14px; border: 1px solid #e2e8f0; text-align: left; font-weight: 600; color: #475569; }
          .history-table td { padding: 12px 14px; border: 1px solid #e2e8f0; color: #475569; word-break: break-word; }
          .history-table tr:hover { background: #f8fafc; }
          
          .note-card { 
            background: #f8fafc; 
            border-radius: 12px; 
            padding: 16px; 
            border: 1px solid #e2e8f0;
            margin-bottom: 16px;
          }
          .note-card.rejection { border-color: #fecaca; background: #fef2f2; }
          .note-card strong { display: block; margin-bottom: 8px; color: #1a202c; font-size: 0.95rem; }
          .note-card p { margin: 0; color: #64748b; font-size: 0.9rem; line-height: 1.5; }
          
          .warning { 
            background: #fef3c7; 
            border: 1px solid #fde047;
            color: #92400e; 
            padding: 14px; 
            border-radius: 8px;
            font-weight: 600;
            margin-top: 16px;
            line-height: 1.5;
          }
          
          .form-section {
            background: #f8fafc;
            border-radius: 12px;
            padding: 20px;
            border: 1px solid #e2e8f0;
            margin-bottom: 16px;
          }
          .form-section h3 {
            margin: 0 0 16px 0;
            font-size: 1rem;
            font-weight: 600;
            color: #1a202c;
          }
          
          @media (max-width: 640px) {
            .card { padding: 20px; }
            body { padding: 12px; }
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Pricing Term Approval</h1>
          <p class="intro">Review the pricing term details below and decide whether to approve or reject it.</p>
          <span class="badge ${approvalStatusCss}">${escapeHtml(approvalState)}</span>
          
          <!-- Basic Information -->
          <div class="section">
            <h2>Basic Information</h2>
            <div class="detail-row">
              ${agreementName ? `
                <div class="detail-card">
                  <dt>Agreement</dt>
                  <dd>${escapeHtml(agreementName)}</dd>
                </div>
              ` : ''}
              ${serviceName ? `
                <div class="detail-card">
                  <dt>Service</dt>
                  <dd>${escapeHtml(serviceName)}</dd>
                </div>
              ` : ''}
              <div class="detail-card">
                <dt>Pricing Model</dt>
                <dd>${escapeHtml(term.pricingModel)}</dd>
              </div>
              ${vendorName ? `
                <div class="detail-card">
                  <dt>Vendor</dt>
                  <dd>${escapeHtml(vendorName)}</dd>
                </div>
              ` : ''}
              ${currencyValue ? `
                <div class="detail-card">
                  <dt>Currency</dt>
                  <dd>${escapeHtml(currencyValue)}</dd>
                </div>
              ` : ''}
              <div class="detail-card">
                <dt>Status</dt>
                <dd>${term.isActive ? "Active" : "Inactive"}</dd>
              </div>
              ${effectiveStartDate ? `
                <div class="detail-card">
                  <dt>Effective Date</dt>
                  <dd>${escapeHtml(effectiveStartDate)}</dd>
                </div>
              ` : ''}
              ${effectiveEndDate ? `
                <div class="detail-card">
                  <dt>End Date</dt>
                  <dd>${escapeHtml(effectiveEndDate)}</dd>
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Rate Configuration -->
          <div class="section">
            <h2>Rate Configuration</h2>
            <div class="detail-row">
              ${clientRevenue ? `
                <div class="detail-card">
                  <dt>Client Amount</dt>
                  <dd>${escapeHtml(clientRevenue)}</dd>
                </div>
              ` : ''}
              ${signerEmails.length > 0 ? `
                <div class="detail-card">
                  <dt>Signer Emails</dt>
                  <dd>${escapeHtml(signerEmails.join(", "))}</dd>
                </div>
              ` : ''}
              ${approvalNotesText ? `
                <div class="detail-card">
                  <dt>Approval Notes</dt>
                  <dd>${escapeHtml(approvalNotesText)}</dd>
                </div>
              ` : ''}
              ${collectionSource ? `
                <div class="detail-card">
                  <dt>Collection Source</dt>
                  <dd>${escapeHtml(collectionSource)}</dd>
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Vendor Pricing -->
          ${vendorPricing && (vendorPricingAmount || vendorPricingSource) ? `
            <div class="section">
              <h2>Vendor Pricing</h2>
              <div class="detail-row">
                ${vendorPricingAmount ? `
                  <div class="detail-card">
                    <dt>Vendor Amount</dt>
                    <dd>${escapeHtml(vendorPricingAmount)}</dd>
                  </div>
                ` : ''}
                ${vendorPricingSource ? `
                  <div class="detail-card">
                    <dt>Vendor Collection Source</dt>
                    <dd>${escapeHtml(vendorPricingSource)}</dd>
                  </div>
                ` : ''}
              </div>
            </div>
          ` : ''}

          <!-- Margin Preview -->
          <div class="section">
            <h2>Margin Preview</h2>
            <div class="detail-row">
              ${clientRevenue ? `
                <div class="value-card revenue">
                  <dt>Est. Client Revenue</dt>
                  <dd>${escapeHtml(clientRevenue)}</dd>
                </div>
              ` : ''}
              ${vendorCost ? `
                <div class="value-card cost">
                  <dt>Est. Vendor Cost</dt>
                  <dd>${escapeHtml(vendorCost)}</dd>
                </div>
              ` : ''}
              ${grossMargin ? `
                <div class="value-card margin">
                  <dt>Est. Gross Margin</dt>
                  <dd>${escapeHtml(grossMargin)}</dd>
                </div>
              ` : ''}
              ${marginPct ? `
                <div class="value-card ${approvalData.marginPct < 20 ? 'margin-low' : 'margin-percent'}">
                  <dt>Margin %</dt>
                  <dd>${escapeHtml(marginPct)}</dd>
                </div>
              ` : ''}
            </div>
            ${approvalData.requiresApproval ? `<p class="warning">⚠ Margin below threshold — manager approval required</p>` : ``}
          </div>

          <!-- Decision Forms -->
          ${approvalData.requiresApproval ? `
            ${term.approvalStatus === ApprovalDecisionStatus.PENDING || term.approvalStatus === null ? `
              <div class="section">
                <h2>Make Decision</h2>
                
                <div class="form-section">
                  <h3>✓ Approve This Term</h3>
                  <form method="post" action="${actionUrl}?action=approve">
                    <div class="field">
                      <label for="note_approve">Optional approval note</label>
                      <textarea id="note_approve" name="note" placeholder="Enter a reason or comment..."></textarea>
                    </div>
                    <button type="submit" class="button">Approve</button>
                  </form>
                </div>

                <div class="form-section">
                  <h3>✕ Reject This Term</h3>
                  <form method="post" action="${actionUrl}?action=reject">
                    <div class="field">
                      <label for="note_reject">Optional rejection reason</label>
                      <textarea id="note_reject" name="note" placeholder="Explain why you're rejecting this term..."></textarea>
                    </div>
                    <button type="submit" class="button reject">Reject</button>
                  </form>
                </div>
              </div>
            ` : `
              <div class="note-card ${term.approvalStatus === ApprovalDecisionStatus.REJECTED ? "rejection" : ""}">
                <strong>${term.approvalStatus === ApprovalDecisionStatus.APPROVED ? "✓ Approved" : "✕ Rejected"}</strong>
                <p>This pricing term has already been ${term.approvalStatus === ApprovalDecisionStatus.APPROVED ? "approved" : "rejected"}. No further responses are allowed.</p>
              </div>
            `}
          ` : `
            <div class="note-card">
              <strong>No approval required</strong>
              <p>This pricing term can be activated without additional approval.</p>
            </div>
          `}

          <!-- Approval History -->
          <div class="section">
            <h2>Approval History</h2>
            ${approvalDecisions.length > 0 ? `
              <table class="history-table">
                <thead>
                  <tr>
                    <th>Decision</th>
                    <th>By</th>
                    <th>When</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  ${approvalDecisions
                    .map((decision) => `
                      <tr>
                        <td><strong>${escapeHtml(decision.decision)}</strong></td>
                        <td>${escapeHtml(decision.decidedByUser?.email ?? "System")}</td>
                        <td>${escapeHtml(decision.decidedAt?.toLocaleString() ?? "Unknown")}</td>
                        <td>${escapeHtml(decision.note ?? "—")}</td>
                      </tr>
                    `)
                    .join("")}
                </tbody>
              </table>
            ` : `<p style="color: #64748b; font-size: 0.9rem;">No decisions have been recorded yet.</p>`}
          </div>
        </div>
      </body>
      </html>
    `;

    return res.status(200).contentType("text/html").send(html);
  } catch (error) {
    console.error("Unable to render approval page", error);
    return res.status(500).send("Unable to render approval page.");
  }
}

export async function handleAgreementServiceTermApproval(
  req: Request,
  res: Response,
) {
  try {
    const termId = req.params.id as string;
    const action = String(req.query.action || "").toLowerCase();
    const note = typeof req.body?.note === "string" ? req.body.note.trim() : undefined;

    if (action !== "approve" && action !== "reject") {
      return res.status(400).send("Invalid approval action.");
    }

    const decision = action === "approve"
      ? ApprovalDecisionStatus.APPROVED
      : ApprovalDecisionStatus.REJECTED;

    const term = await prisma.agreementServiceTerm.findUnique({
      where: { id: termId },
    });

    if (!term) {
      return res.status(404).send("Pricing term not found.");
    }

    const approvalData = getPricingTermApprovalData(
      term.pricingModel,
      term.pricingConfig as Record<string, unknown>,
    );

    if (!approvalData.requiresApproval) {
      return res.status(400).send("This pricing term does not require approval.");
    }

    if (
      term.approvalStatus &&
      term.approvalStatus !== ApprovalDecisionStatus.PENDING
    ) {
      return res.status(400).send("Approval decision has already been submitted.");
    }

    const updatedTerm = await prisma.$transaction(async (tx) => {
      const updated = await tx.agreementServiceTerm.update({
        where: { id: termId },
        data: {
          approvalStatus: decision,
          isActive: decision === ApprovalDecisionStatus.APPROVED,
        },
      });

      await tx.approvalDecision.create({
        data: {
          entityType: ApprovalEntityType.AGREEMENT_TERM,
          entityId: termId,
          decision,
          note,
          decidedAt: new Date(),
        },
      });

      return updated;
    });

    const html = `
      <!doctype html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Pricing Term ${escapeHtml(decision)}</title>
        <style>
          body { font-family: system-ui, sans-serif; background:#f3f4f6; color:#111827; padding:24px; }
          .card { background:#ffffff; border-radius:16px; box-shadow:0 10px 30px rgba(15,23,42,.08); padding:24px; max-width:720px; margin:0 auto; }
          .badge { display:inline-flex; align-items:center; gap:8px; padding:10px 14px; border-radius:9999px; font-weight:700; }
          .approved { background:#d1fae5; color:#166534; }
          .rejected { background:#fee2e2; color:#991b1b; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Pricing Term ${escapeHtml(decision)}</h1>
          <p>The pricing term was successfully ${decision === ApprovalDecisionStatus.APPROVED ? "approved" : "rejected"}.</p>
          ${note ? `<p><strong>Note:</strong> ${escapeHtml(note)}</p>` : ""}
          <p>Term ID: ${escapeHtml(termId)}</p>
        </div>
      </body>
      </html>
    `;

    return res.status(200).contentType("text/html").send(html);
  } catch (error) {
    console.error("Approval handling error:", error);
    return res.status(500).send("Unable to process approval decision.");
  }
}

export async function getAgreementServiceTerms(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const agreementId = req.query.agreementId as string;
    const agreementVersionId = req.query.agreementVersionId as string;
    const serviceId = req.query.serviceId as string;

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (agreementId) where.agreementId = agreementId;
    if (agreementVersionId) where.agreementVersionId = agreementVersionId;
    if (serviceId) where.serviceId = serviceId;

    const [terms, totalRecords] = await Promise.all([
      prisma.agreementServiceTerm.findMany({
        where,
        include: {
          agreement: true,
          agreementVersion: true,
          service: true,
          vendor: true,
        },
        skip,
        take: limit,
        orderBy: {
          priority: "asc",
        },
      }),
      prisma.agreementServiceTerm.count({ where }),
    ]);

    const totalPages = Math.ceil(totalRecords / limit);

    return res.status(200).json({
      message: "Agreement service terms fetched successfully.",
      terms,
      pagination: {
        totalRecords,
        totalPages,
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch agreement service terms.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getAgreementServiceTerm(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = req.params.id as string;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const term = await prisma.agreementServiceTerm.findUnique({
      where: { id },
      include: {
        agreement: true,
        agreementVersion: true,
        service: true,
        vendor: true,
      },
    });

    if (!term) {
      return res
        .status(404)
        .json({ message: "Agreement service term not found." });
    }

    return res.status(200).json({
      message: "Agreement service term fetched successfully.",
      term,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch agreement service term.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function createAgreementServiceTerm(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const {
      agreementId,
      agreementVersionId,
      serviceId,
      vendorId,
      pricingModel,
      pricingConfig,
      currency,
      priority,
      minimumFee,
      effectiveDate,
      endDate,
      isActive,
      externalReference,
    } = req.body;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (
      !agreementId ||
      !agreementVersionId ||
      !serviceId ||
      !pricingModel ||
      !pricingConfig
    ) {
      return res.status(400).json({
        message:
          "agreementId, agreementVersionId, serviceId, pricingModel and pricingConfig are required.",
      });
    }

    if (!isPricingModel(pricingModel)) {
      return res.status(400).json({
        message: "Invalid pricing model.",
        allowedModels: Object.values(PricingModel),
      });
    }

    if (typeof pricingConfig !== "object" || pricingConfig === null || Array.isArray(pricingConfig)) {
      return res.status(400).json({
        message: "pricingConfig must be a valid object.",
      });
    }

    const pricingValidation = validatePricingConfig(
      pricingModel,
      pricingConfig as Record<string, unknown>,
    );

    if (!pricingValidation.valid) {
      return res.status(400).json({ message: pricingValidation.message });
    }

    if (minimumFee !== undefined && minimumFee !== null && asNonNegativeNumber(minimumFee) === null) {
      return res.status(400).json({
        message: "Vendor rate must be 0 or greater.",
      });
    }

    const agreement = await prisma.agreement.findUnique({
      where: { id: agreementId as string },
      include: {
        versions: true,
      },
    });

    if (!agreement) {
      return res.status(404).json({ message: "Agreement not found." });
    }

    const agreementVersion = await prisma.agreementVersion.findUnique({
      where: { id: agreementVersionId as string },
    });

    if (!agreementVersion || agreementVersion.agreementId !== agreement.id) {
      return res.status(404).json({
        message: "Agreement version not found for this agreement.",
      });
    }

    const service = await prisma.service.findUnique({
      where: { id: serviceId as string },
    });

    if (!service) {
      return res.status(404).json({ message: "Service not found." });
    }

    if (vendorId) {
      const vendor = await prisma.vendor.findUnique({
        where: { id: vendorId as string },
      });

      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found." });
      }
    }

    const parsedEffectiveDate = asOptionalDate(effectiveDate, "effectiveDate");
    const parsedEndDate = asOptionalDate(endDate, "endDate");

    if (
      parsedEffectiveDate &&
      parsedEndDate &&
      parsedEffectiveDate > parsedEndDate
    ) {
      return res.status(400).json({
        message: "effectiveDate must be before endDate.",
      });
    }

    if (
      parsedEffectiveDate &&
      agreementVersion.endDate &&
      parsedEffectiveDate > agreementVersion.endDate
    ) {
      return res.status(400).json({
        message:
          "Service term effectiveDate cannot start after the agreement version endDate.",
      });
    }

    if (
      parsedEndDate &&
      agreementVersion.effectiveDate &&
      parsedEndDate < agreementVersion.effectiveDate
    ) {
      return res.status(400).json({
        message:
          "Service term endDate cannot end before the agreement version effectiveDate.",
      });
    }

    if (isActive ?? true) {
      const overlappingTerm = await findOverlappingActiveTerm({
        agreementId: agreementId as string,
        serviceId: serviceId as string,
        vendorId: (vendorId as string) || null,
        pricingModel,
        effectiveDate: parsedEffectiveDate,
        endDate: parsedEndDate,
      });

      if (overlappingTerm) {
        return res.status(400).json({
          message:
            "An active pricing term with overlapping effective dates already exists for this agreement, service, vendor, and pricing model.",
        });
      }
    }

    const approvalData = getPricingTermApprovalData(
      pricingModel,
      pricingConfig as Record<string, unknown>,
    );

    const term = await prisma.agreementServiceTerm.create({
      data: {
        agreementId: agreementId as string,
        agreementVersionId: agreementVersionId as string,
        serviceId: serviceId as string,
        vendorId: (vendorId as string) || null,
        pricingModel,
        pricingConfig,
        currency: currency || "USD",
        priority: priority ?? 1,
        minimumFee: minimumFee ?? undefined,
        effectiveDate: parsedEffectiveDate,
        endDate: parsedEndDate,
        isActive: approvalData.requiresApproval ? false : isActive ?? true,
        externalReference,
        approvalStatus: approvalData.requiresApproval
          ? ApprovalDecisionStatus.PENDING
          : null,
      },
      include: {
        agreement: { include: { practice: true } },
        service: true,
        vendor: true,
      },
    });

    void sendPricingTermNotificationEmails(req, term).catch((error) => {
      console.error("Pricing term notification error:", error);
    });

    return res.status(201).json({
      message: "Agreement service term created successfully.",
      term,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to create agreement service term.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updateAgreementServiceTerm(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = req.params.id as string;
    const {
      agreementVersionId,
      serviceId,
      vendorId,
      pricingModel,
      pricingConfig,
      currency,
      priority,
      minimumFee,
      effectiveDate,
      endDate,
      isActive,
      externalReference,
    } = req.body;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (pricingModel && !isPricingModel(pricingModel)) {
      return res.status(400).json({
        message: "Invalid pricing model.",
        allowedModels: Object.values(PricingModel),
      });
    }

    const existingTerm = await prisma.agreementServiceTerm.findUnique({
      where: { id },
      include: {
        agreement: {
          include: {
            versions: true,
          },
        },
      },
    });

    if (!existingTerm) {
      return res
        .status(404)
        .json({ message: "Agreement service term not found." });
    }

    const nextPricingModel = pricingModel ?? existingTerm.pricingModel;
    const nextPricingConfig =
      pricingConfig !== undefined
        ? pricingConfig
        : (existingTerm.pricingConfig as Record<string, unknown>);

    if (
      typeof nextPricingConfig !== "object" ||
      nextPricingConfig === null ||
      Array.isArray(nextPricingConfig)
    ) {
      return res.status(400).json({
        message: "pricingConfig must be a valid object.",
      });
    }

    const pricingValidation = validatePricingConfig(
      nextPricingModel,
      nextPricingConfig as Record<string, unknown>,
    );

    if (!pricingValidation.valid) {
      return res.status(400).json({ message: pricingValidation.message });
    }

    const nextMinimumFee = minimumFee !== undefined ? minimumFee : existingTerm.minimumFee;
    if (
      nextMinimumFee !== undefined &&
      nextMinimumFee !== null &&
      asNonNegativeNumber(nextMinimumFee) === null
    ) {
      return res.status(400).json({
        message: "Vendor rate must be 0 or greater.",
      });
    }

    const nextAgreementVersionId =
      agreementVersionId !== undefined
        ? (agreementVersionId as string)
        : existingTerm.agreementVersionId;

    if (!nextAgreementVersionId) {
      return res.status(400).json({
        message: "agreementVersionId is required for agreement service terms.",
      });
    }

    const agreementVersion = await prisma.agreementVersion.findUnique({
      where: { id: nextAgreementVersionId },
    });

    if (
      !agreementVersion ||
      agreementVersion.agreementId !== existingTerm.agreementId
    ) {
      return res.status(404).json({
        message: "Agreement version not found for this agreement.",
      });
    }

    if (serviceId) {
      const service = await prisma.service.findUnique({
        where: { id: serviceId as string },
      });

      if (!service) {
        return res.status(404).json({ message: "Service not found." });
      }
    }

    if (vendorId) {
      const vendor = await prisma.vendor.findUnique({
        where: { id: vendorId as string },
      });

      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found." });
      }
    }

    const parsedEffectiveDate = asOptionalDate(effectiveDate, "effectiveDate");
    const parsedEndDate = asOptionalDate(endDate, "endDate");

    if (
      parsedEffectiveDate &&
      parsedEndDate &&
      parsedEffectiveDate > parsedEndDate
    ) {
      return res.status(400).json({
        message: "effectiveDate must be before endDate.",
      });
    }

    const nextEffectiveDate =
      parsedEffectiveDate ?? existingTerm.effectiveDate ?? undefined;
    const nextEndDate = parsedEndDate ?? existingTerm.endDate ?? undefined;

    if (
      nextEffectiveDate &&
      agreementVersion.endDate &&
      nextEffectiveDate > agreementVersion.endDate
    ) {
      return res.status(400).json({
        message:
          "Service term effectiveDate cannot start after the agreement version endDate.",
      });
    }

    if (
      nextEndDate &&
      agreementVersion.effectiveDate &&
      nextEndDate < agreementVersion.effectiveDate
    ) {
      return res.status(400).json({
        message:
          "Service term endDate cannot end before the agreement version effectiveDate.",
      });
    }

    const approvalData = getPricingTermApprovalData(
      nextPricingModel,
      nextPricingConfig as Record<string, unknown>,
    );

    const nextServiceId = serviceId ? (serviceId as string) : existingTerm.serviceId;
    const nextVendorId =
      vendorId !== undefined ? ((vendorId as string) || null) : existingTerm.vendorId;
    const nextIsActive = approvalData.requiresApproval
      ? false
      : isActive ?? existingTerm.isActive;

    if (nextIsActive) {
      const overlappingTerm = await findOverlappingActiveTerm({
        agreementId: existingTerm.agreementId,
        serviceId: nextServiceId,
        vendorId: nextVendorId,
        pricingModel: nextPricingModel,
        effectiveDate: nextEffectiveDate ?? undefined,
        endDate: nextEndDate ?? undefined,
        excludeId: id,
      });

      if (overlappingTerm) {
        return res.status(400).json({
          message:
            "An active pricing term with overlapping effective dates already exists for this agreement, service, vendor, and pricing model.",
        });
      }
    }

    const term = await prisma.agreementServiceTerm.update({
      where: { id },
      data: {
        agreementVersionId: nextAgreementVersionId,
        serviceId: serviceId ? (serviceId as string) : undefined,
        vendorId: vendorId !== undefined ? ((vendorId as string) || null) : undefined,
        pricingModel: pricingModel ?? undefined,
        pricingConfig: pricingConfig ?? undefined,
        currency: currency ?? undefined,
        priority: priority ?? undefined,
        minimumFee: minimumFee ?? undefined,
        effectiveDate: parsedEffectiveDate,
        endDate: parsedEndDate,
        isActive: nextIsActive,
        externalReference: externalReference ?? undefined,
        approvalStatus: approvalData.requiresApproval
          ? ApprovalDecisionStatus.PENDING
          : null,
      },
      include: {
        agreement: { include: { practice: true } },
        service: true,
        vendor: true,
      },
    });

    void sendPricingTermNotificationEmails(req, term).catch((error) => {
      console.error("Pricing term notification error:", error);
    });

    return res.status(200).json({
      message: "Agreement service term updated successfully.",
      term,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to update agreement service term.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function deleteAgreementServiceTerm(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = req.params.id as string;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const existingTerm = await prisma.agreementServiceTerm.findUnique({
      where: { id },
    });

    if (!existingTerm) {
      return res
        .status(404)
        .json({ message: "Agreement service term not found." });
    }

    await prisma.agreementServiceTerm.delete({
      where: { id },
    });

    return res.status(200).json({
      message: "Agreement service term deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete agreement service term.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
