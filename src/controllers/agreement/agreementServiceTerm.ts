import { Request, Response } from "express";
import type { Prisma } from "../../../generated/prisma/client";
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

// ✅ NEW: Helper to check if pricing model is percentage-based
function isPercentageBasedModel(pricingModel: PricingModel | string): boolean {
  const percentageModels: PricingModel[] = [
    PricingModel.PERCENT_COLLECTIONS,
    PricingModel.PERCENT_REVENUE,
    PricingModel.PERCENT_PROFIT,
    PricingModel.SUCCESS_FEE,
  ];
  return percentageModels.includes(pricingModel as PricingModel);
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
  const hasNonNegative = (value: unknown) =>
    asNonNegativeNumber(value) !== null;

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
      if (
        !hasNonNegative(pricingConfig.unitRate) &&
        !hasNonNegative(pricingConfig.rate)
      ) {
        return fail("Rate is required and must be 0 or greater.");
      }
      return { valid: true as const };

    case PricingModel.PER_CPT_CODE: {
      const cptCodes = Array.isArray(pricingConfig.cptCodes)
        ? pricingConfig.cptCodes
        : [];
      if (cptCodes.length === 0) {
        return fail("At least one CPT code is required.");
      }
      const invalidRow = cptCodes.find((row) => {
        if (!row || typeof row !== "object") return true;
        const code = String((row as Record<string, unknown>).code ?? "").trim();
        return (
          !code ||
          asNonNegativeNumber((row as Record<string, unknown>).rate) === null
        );
      });
      if (invalidRow) {
        return fail(
          "Each CPT entry must include a code and a non-negative rate.",
        );
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
        return (
          asNonNegativeNumber((component as Record<string, unknown>).value) ===
          null
        );
      });
      if (invalidComponent) {
        return fail("Each hybrid component must have a non-negative value.");
      }
      return { valid: true as const };
    }

    case PricingModel.TIERED_VOLUME: {
      const tiers = Array.isArray(pricingConfig.tiers)
        ? pricingConfig.tiers
        : [];
      if (tiers.length === 0 && !hasNonNegative(pricingConfig.amount)) {
        return fail("At least one tier or amount is required.");
      }
      if (tiers.length > 0) {
        const invalidTier = tiers.find((tier) => {
          if (!tier || typeof tier !== "object") return true;
          return (
            asNonNegativeNumber((tier as Record<string, unknown>).rate) === null
          );
        });
        if (invalidTier) {
          return fail("Each tier must have a non-negative rate.");
        }
      }
      return { valid: true as const };
    }

    case PricingModel.CUSTOM_ATTACHMENT_DEFINED:
      if (!hasNonNegative(pricingConfig.amount)) {
        return fail("Amount is required and must be 0 or greater.");
      }
      return { valid: true as const };

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

function getPricingTotal(
  pricingModel: string,
  pricingConfig: Record<string, unknown>,
) {
  switch (pricingModel) {
    case "FIXED_MONTHLY":
    case "FIXED_ONE_TIME":
    case "RETAINER":
    case "CUSTOM_ATTACHMENT_DEFINED":
      return parseNumericValue(pricingConfig.amount);
      
    case "PERCENT_COLLECTIONS":
    case "PERCENT_REVENUE":
    case "PERCENT_PROFIT":
    case "SUCCESS_FEE":
      return parseNumericValue(
        pricingConfig.percentage ??
          pricingConfig.ratePercent ??
          pricingConfig.rate,
      );
      
    case "PER_UNIT":
    case "PER_ENCOUNTER":
    case "PER_PATIENT":
    case "PER_PROVIDER":
    case "PER_SITE":
      return parseNumericValue(
        pricingConfig.unitRate ?? pricingConfig.rate,
      );
      
    case "PER_CPT_CODE": {
      const cptCodes = Array.isArray(pricingConfig.cptCodes)
        ? pricingConfig.cptCodes
        : [];
      return cptCodes.reduce((sum, row) => {
        if (!row || typeof row !== "object") return sum;
        return sum + parseNumericValue((row as Record<string, unknown>).rate);
      }, 0);
    }
    
    case "HYBRID":
    case "MULTI_COMPONENT": {
      const components = Array.isArray(pricingConfig.components)
        ? pricingConfig.components
        : [];
      return components.reduce((sum, component) => {
        if (!component || typeof component !== "object") return sum;
        return (
          sum + parseNumericValue((component as Record<string, unknown>).value)
        );
      }, 0);
    }
    
    case "TIERED_VOLUME": {
      const tiers = Array.isArray(pricingConfig.tiers)
        ? pricingConfig.tiers
        : [];
      if (tiers.length > 0) {
        return tiers.reduce((sum, tier) => {
          if (!tier || typeof tier !== "object") return sum;
          return (
            sum + parseNumericValue((tier as Record<string, unknown>).rate)
          );
        }, 0);
      }
      return parseNumericValue(pricingConfig.amount);
    }
    
    default:
      return parseNumericValue(pricingConfig.amount);
  }
}

// ✅ UPDATED: Return percentage flag and handle percentage-based calculations
function getPricingTermApprovalData(
  pricingModel: PricingModel,
  pricingConfig: Record<string, unknown>,
) {
  const isPercentageBased = isPercentageBasedModel(pricingModel);
  
  const clientAmount = getPricingTotal(pricingModel, pricingConfig);
  const vendorPricing = pricingConfig.vendorPricing as
    | Record<string, unknown>
    | undefined;
  const vendorModel =
    typeof vendorPricing?.pricingModel === "string"
      ? String(vendorPricing.pricingModel)
      : pricingModel;
  const vendorAmount = vendorPricing
    ? getPricingTotal(vendorModel, vendorPricing)
    : 0;
  const grossMargin = clientAmount - vendorAmount;
  const marginPct =
    clientAmount > 0
      ? Number(((grossMargin / clientAmount) * 100).toFixed(2))
      : 0;

  return {
    clientAmount,
    vendorAmount,
    grossMargin,
    marginPct,
    requiresApproval: clientAmount > 0 && marginPct < 20,
    isPercentageBased, // ✅ NEW: Flag to indicate percentage-based pricing
  };
}

function formatPricingConfigHtml(
  pricingModel: PricingModel,
  pricingConfig: Record<string, unknown>,
) {
  const formatMoney = (value: unknown) => {
    const numeric = parseNumericValue(value);
    return `$${numeric.toFixed(2)}`;
  };

  const formatPercent = (value: unknown) => {
    const numeric = parseNumericValue(value);
    return `${numeric.toFixed(2)}%`;
  };

  const collectionSource =
    typeof pricingConfig.collectionSource === "string" &&
    pricingConfig.collectionSource.trim()
      ? pricingConfig.collectionSource.trim()
      : null;

  const lines: string[] = [];

  switch (pricingModel) {
    case PricingModel.FIXED_MONTHLY:
    case PricingModel.FIXED_ONE_TIME:
    case PricingModel.RETAINER:
      lines.push(
        `<div class="rate-item"><span class="rate-label">Amount:</span> <span class="rate-value">${formatMoney(pricingConfig.amount)}</span></div>`,
      );
      break;

    case PricingModel.PERCENT_COLLECTIONS:
    case PricingModel.PERCENT_REVENUE:
    case PricingModel.PERCENT_PROFIT:
    case PricingModel.SUCCESS_FEE: {
      lines.push(
        `<div class="rate-item"><span class="rate-label">Percentage:</span> <span class="rate-value">${formatPercent(pricingConfig.percentage ?? pricingConfig.ratePercent ?? pricingConfig.rate)}</span></div>`,
      );
      if (
        pricingConfig.minimumFee !== undefined &&
        pricingConfig.minimumFee !== null
      ) {
        lines.push(
          `<div class="rate-item"><span class="rate-label">Minimum Fee:</span> <span class="rate-value">${formatMoney(pricingConfig.minimumFee)}</span></div>`,
        );
      }
      if (
        pricingConfig.maximumFee !== undefined &&
        pricingConfig.maximumFee !== null
      ) {
        lines.push(
          `<div class="rate-item"><span class="rate-label">Maximum Fee:</span> <span class="rate-value">${formatMoney(pricingConfig.maximumFee)}</span></div>`,
        );
      }
      break;
    }

    case PricingModel.PER_UNIT:
    case PricingModel.PER_ENCOUNTER:
    case PricingModel.PER_PATIENT:
    case PricingModel.PER_PROVIDER:
    case PricingModel.PER_SITE:
      lines.push(
        `<div class="rate-item"><span class="rate-label">Rate per unit:</span> <span class="rate-value">${formatMoney(pricingConfig.unitRate ?? pricingConfig.rate)}</span></div>`,
      );
      if (
        pricingConfig.minimumFee !== undefined &&
        pricingConfig.minimumFee !== null
      ) {
        lines.push(
          `<div class="rate-item"><span class="rate-label">Minimum Fee:</span> <span class="rate-value">${formatMoney(pricingConfig.minimumFee)}</span></div>`,
        );
      }
      break;

    case PricingModel.PER_CPT_CODE: {
      const cptCodes = Array.isArray(pricingConfig.cptCodes)
        ? pricingConfig.cptCodes
        : [];
      if (cptCodes.length > 0) {
        lines.push(
          `<div class="rate-item"><span class="rate-label">CPT Rates:</span></div>`,
        );
        lines.push(`<ul class="rate-list">`);
        for (const row of cptCodes) {
          if (!row || typeof row !== "object") continue;
          const code = escapeHtml(
            String((row as Record<string, unknown>).code ?? ""),
          ).trim();
          const rate = formatMoney((row as Record<string, unknown>).rate);
          lines.push(
            `<li>${code || "Unknown code"}: <strong>${rate}</strong></li>`,
          );
        }
        lines.push(`</ul>`);
      }
      break;
    }

    case PricingModel.HYBRID: {
      const components = Array.isArray(pricingConfig.components)
        ? pricingConfig.components
        : [];
      if (components.length > 0) {
        lines.push(
          `<div class="rate-item"><span class="rate-label">Hybrid Components:</span></div>`,
        );
        lines.push(`<ul class="rate-list">`);
        for (const component of components) {
          if (!component || typeof component !== "object") continue;
          const type = escapeHtml(
            String((component as Record<string, unknown>).type ?? "Component"),
          );
          const value = formatMoney(
            (component as Record<string, unknown>).value,
          );
          lines.push(`<li>${type}: <strong>${value}</strong></li>`);
        }
        lines.push(`</ul>`);
      }
      break;
    }

    case PricingModel.TIERED_VOLUME: {
      const tiers = Array.isArray(pricingConfig.tiers)
        ? pricingConfig.tiers
        : [];
      if (tiers.length > 0) {
        lines.push(
          `<div class="rate-item"><span class="rate-label">Tiered Rates:</span></div>`,
        );
        lines.push(`<ul class="rate-list">`);
        for (const tier of tiers) {
          if (!tier || typeof tier !== "object") continue;
          const name = escapeHtml(
            String((tier as Record<string, unknown>).name ?? "Tier"),
          );
          const rate = formatMoney((tier as Record<string, unknown>).rate);
          lines.push(`<li>${name}: <strong>${rate}</strong></li>`);
        }
        lines.push(`</ul>`);
      } else {
        lines.push(
          `<div class="rate-item"><span class="rate-label">Amount:</span> <span class="rate-value">${formatMoney(pricingConfig.amount)}</span></div>`,
        );
      }
      break;
    }

    case PricingModel.CUSTOM_ATTACHMENT_DEFINED:
      lines.push(
        `<div class="rate-item"><span class="rate-label">Custom Amount:</span> <span class="rate-value">${formatMoney(pricingConfig.amount)}</span></div>`,
      );
      break;

    default:
      lines.push(
        `<div class="rate-item"><span class="rate-label">Amount:</span> <span class="rate-value">${formatMoney(pricingConfig.amount)}</span></div>`,
      );
      break;
  }

  return lines.join("\n");
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
    ? process.env.PRICING_TERM_APPROVAL_EMAILS.split(",")
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

  return users
    .map((user) => user.email)
    .filter((email): email is string => Boolean(email));
}

const COMMON_STYLES = `
  * { box-sizing: border-box; }
  body { 
    font-family: 'Google Sans', 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif; 
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
  h2 { margin: 0 0 16px 0; font-size: 1.1rem; font-weight: 600; color: #1a202c; }
  h3 { margin: 0 0 12px 0; font-size: 1rem; font-weight: 600; color: #1a202c; }
  .intro { margin: 0 0 18px 0; color: #64748b; font-size: 0.98rem; line-height: 1.5; }
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
    padding: 12px 24px; 
    border-radius: 8px; 
    color: #fff; 
    background: #4f46e5; 
    text-decoration: none; 
    font-weight: 600; 
    font-family: inherit;
    font-size: 0.95rem;
    margin-right: 10px; 
    margin-top: 10px;
    border: none; 
    cursor: pointer;
    transition: background 0.2s;
  }
  .button:hover { background: #4338ca; }
  .button.accept { background: #10b981; }
  .button.accept:hover { background: #059669; }
  .button.reject { background: #ef4444; }
  .button.reject:hover { background: #dc2626; }
  .section { margin-bottom: 28px; }
  .detail-card { 
    background: #f8fafc; 
    border-radius: 12px; 
    padding: 16px; 
    border: 1px solid #e2e8f0;
    margin-bottom: 12px;
  }
  .detail-card dt { 
    font-size: 0.73rem; 
    color: #64748b; 
    text-transform: uppercase; 
    letter-spacing: 0.06em; 
    font-weight: 700;
    margin-bottom: 6px;
  }
  .detail-card dd { 
    margin: 0; 
    font-size: 0.95rem; 
    color: #1a202c; 
    font-weight: 600; 
  }
  .rate-section {
    background: #f8fafc;
    border-radius: 12px;
    padding: 20px;
    border: 1px solid #e2e8f0;
    margin-bottom: 16px;
  }
  .rate-item {
    margin: 8px 0;
    font-size: 0.95rem;
  }
  .rate-label {
    color: #64748b;
    font-weight: 500;
  }
  .rate-value {
    color: #1a202c;
    font-weight: 700;
  }
  .rate-list {
    list-style: none;
    padding: 0;
    margin: 8px 0;
  }
  .rate-list li {
    padding: 8px 12px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    margin-bottom: 6px;
    color: #1a202c;
  }
  .field { margin-bottom: 16px; }
  .field label { display: block; margin-bottom: 6px; font-weight: 600; font-size: 0.92rem; color: #1a202c; }
  .field textarea { 
    width: 100%; 
    min-height: 120px; 
    padding: 12px; 
    border: 1px solid #e2e8f0; 
    border-radius: 10px; 
    font-family: inherit;
    font-size: 0.95rem; 
    resize: vertical;
  }
  .field textarea:focus { outline: none; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.08); }
  .note-card { 
    background: #f8fafc; 
    border-radius: 12px; 
    padding: 20px; 
    border: 1px solid #e2e8f0;
    margin-bottom: 16px;
    text-align: center;
  }
  .note-card.approved { border-color: #86efac; background: #f0fdf4; }
  .note-card.rejection { border-color: #fecaca; background: #fef2f2; }
  .note-card strong { display: block; margin-bottom: 8px; color: #1a202c; font-size: 1.05rem; }
  .note-card p { margin: 4px 0; color: #475569; font-size: 0.92rem; line-height: 1.5; }
  .error {
    background: #fee2e2;
    border: 1px solid #fecaca;
    color: #991b1b;
    padding: 12px;
    border-radius: 8px;
    margin-bottom: 12px;
  }
  .action-buttons {
    display: flex;
    gap: 12px;
    margin-top: 20px;
    flex-wrap: wrap;
  }
  @media (max-width: 640px) {
    .card { padding: 20px; }
    body { padding: 12px; }
  }
`;

async function sendPricingTermNotificationEmails(req: Request, term: any) {
  if (!term) return;

  const pricingConfig = term.pricingConfig as Record<string, unknown>;
  const signerEmails = getSignerEmails(
    pricingConfig,
    term.externalReference,
  ).filter(isValidEmail);
  const approvalData = getPricingTermApprovalData(
    term.pricingModel,
    pricingConfig,
  );
  const backendBaseUrl = `${req.protocol}://${req.get("host")}`;
  const clientApprovalUrl = `${backendBaseUrl}/api/v1/agreements/service-terms/${term.id}/client-approval`;
  const internalApprovalUrl = `${backendBaseUrl}/api/v1/agreements/service-terms/${term.id}/approval`;

  const agreementName = term.agreement?.practice?.name ?? "Agreement";
  const serviceName = term.service?.name ?? "Service";
  const vendorName = term.vendor?.name ?? "N/A";

  const formatDate = (value: Date | string | undefined | null) => {
    if (!value) return "N/A";
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) return "N/A";
    return date.toLocaleDateString("en-US", {
      month: "numeric",
      day: "numeric",
      year: "numeric",
    });
  };

  const effectiveStartDate = formatDate(term.effectiveDate);
  const effectiveEndDate = formatDate(term.endDate);

  // ✅ NEW: Format values based on pricing model
  const formatValue = (value: number) => {
    if (approvalData.isPercentageBased) {
      return `${value.toFixed(2)}%`;
    }
    return `$${value.toFixed(2)}`;
  };

  // Client email
  if (signerEmails.length > 0) {
    const clientRatesHtml = formatPricingConfigHtml(
      term.pricingModel,
      pricingConfig,
    );
    const collectionSource =
      typeof pricingConfig.collectionSource === "string" &&
      pricingConfig.collectionSource.trim()
        ? pricingConfig.collectionSource.trim()
        : null;

    const clientSubject = `Pricing Packet for ${serviceName} - Action Required`;
    const clientBody = `
      <p>Hi,</p>
      <p>A pricing packet has been generated for <strong>${escapeHtml(serviceName)}</strong> in agreement <strong>${escapeHtml(agreementName)}</strong>.</p>
      <p><strong>Effective Start Date:</strong> ${escapeHtml(effectiveStartDate)}</p>
      <p><strong>Effective End Date:</strong> ${escapeHtml(effectiveEndDate)}</p>
      <h3>Rates:</h3>
      ${clientRatesHtml}
      ${collectionSource ? `<p><strong>Collection Source:</strong> ${escapeHtml(collectionSource)}</p>` : ""}
      <p>Please review and respond:</p>
      <p><a href="${clientApprovalUrl}" style="display:inline-block;padding:10px 16px;border-radius:6px;background:#4f63ea;color:#ffffff;text-decoration:none;">Accept or Deny Packet</a></p>
      <p>If the button does not work, copy and paste this URL into your browser:</p>
      <p>${escapeHtml(clientApprovalUrl)}</p>
      <p>Thank you.</p>
    `;

    await Promise.all(
      signerEmails.map((email) =>
        sendOutlookEmail(email, clientSubject, clientBody),
      ),
    );
  }

  // Internal email
  if (approvalData.requiresApproval) {
    const approvalEmails = await getApprovalRecipientEmails();
    if (approvalEmails.length > 0) {
      const clientRatesHtml = formatPricingConfigHtml(
        term.pricingModel,
        pricingConfig,
      );
      const vendorPricing = pricingConfig.vendorPricing as
        | Record<string, unknown>
        | undefined;
      const vendorRatesHtml = vendorPricing
        ? formatPricingConfigHtml(
            typeof vendorPricing.pricingModel === "string"
              ? (vendorPricing.pricingModel as PricingModel)
              : term.pricingModel,
            vendorPricing,
          )
        : "";

      const approvalSubject = `Internal Approval Required — Pricing Term for ${serviceName}`;
      const approvalBody = `
        <p>Hi Internal Admin/Manager,</p>
        <p>A pricing term requires your approval for <strong>${escapeHtml(serviceName)}</strong> in agreement <strong>${escapeHtml(agreementName)}</strong>.</p>
        <p><strong>Agreement:</strong> ${escapeHtml(agreementName)}</p>
        <p><strong>Service:</strong> ${escapeHtml(serviceName)}</p>
        <p><strong>Vendor:</strong> ${escapeHtml(vendorName)}</p>
        <p><strong>Pricing Model:</strong> ${escapeHtml(term.pricingModel)}</p>
        <p><strong>Effective Start Date:</strong> ${escapeHtml(effectiveStartDate)}</p>
        <p><strong>Effective End Date:</strong> ${escapeHtml(effectiveEndDate)}</p>
        <h3>Client Rates:</h3>
        ${clientRatesHtml}
        ${vendorRatesHtml ? `<h3>Vendor Rates:</h3>${vendorRatesHtml}` : ""}
        <p><strong>${approvalData.isPercentageBased ? "Client Rate:" : "Client Amount:"}</strong> ${formatValue(approvalData.clientAmount)}</p>
        <p><strong>${approvalData.isPercentageBased ? "Vendor Rate:" : "Vendor Amount:"}</strong> ${formatValue(approvalData.vendorAmount)}</p>
        <p><strong>Gross Margin:</strong> ${formatValue(approvalData.grossMargin)}</p>
        <p><strong>Margin %:</strong> ${approvalData.marginPct.toFixed(2)}%</p>
        <p style="background:#fef3c7;border:1px solid #fde047;color:#92400e;padding:14px;border-radius:8px;font-weight:600;">⚠ Margin below threshold (${approvalData.marginPct.toFixed(2)}%)</p>
        <p><a href="${internalApprovalUrl}" style="display:inline-block;padding:10px 16px;border-radius:6px;background:#4f63ea;color:#ffffff;text-decoration:none;">Review Pricing Term</a></p>
        <p>If the button does not work, copy and paste this URL into your browser:</p>
        <p>${escapeHtml(internalApprovalUrl)}</p>
      `;

      await Promise.all(
        approvalEmails.map((email) =>
          sendOutlookEmail(email, approvalSubject, approvalBody),
        ),
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
  const {
    agreementId,
    serviceId,
    vendorId,
    pricingModel,
    effectiveDate,
    endDate,
    excludeId,
  } = params;

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
          OR: [
            { effectiveDate: null },
            {
              effectiveDate: {
                lte: endDate ?? new Date("9999-12-31T23:59:59.999Z"),
              },
            },
          ],
        },
        {
          OR: [
            { endDate: null },
            {
              endDate: {
                gte: effectiveDate ?? new Date("1900-01-01T00:00:00.000Z"),
              },
            },
          ],
        },
      ],
    },
    select: { id: true },
  });
}

export async function getAgreementServiceTermApprovalPage(
  req: Request,
  res: Response,
) {
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
    const approvalData = getPricingTermApprovalData(
      term.pricingModel,
      pricingConfig,
    );
    const internalApprovalStatus =
      (pricingConfig.internalApprovalStatus as ApprovalDecisionStatus) ??
      ApprovalDecisionStatus.PENDING;
    const actionUrl = `/api/v1/agreements/service-terms/${term.id}/approval`;

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

    // ✅ NEW: Format based on pricing model
    const formatValue = (value: number | undefined | null) => {
      if (value === undefined || value === null || isNaN(value)) return null;
      if (approvalData.isPercentageBased) {
        return `${value.toFixed(2)}%`;
      }
      return `$${value.toFixed(2)}`;
    };

    const approvalStatusCss =
      internalApprovalStatus === ApprovalDecisionStatus.APPROVED
        ? "badge-approved"
        : internalApprovalStatus === ApprovalDecisionStatus.REJECTED
          ? "badge-rejected"
          : "badge-pending";

    const collectionSource =
      typeof pricingConfig.collectionSource === "string" &&
      pricingConfig.collectionSource.trim()
        ? pricingConfig.collectionSource.trim()
        : null;

    const vendorPricing =
      typeof pricingConfig.vendorPricing === "object" &&
      pricingConfig.vendorPricing !== null
        ? (pricingConfig.vendorPricing as Record<string, unknown>)
        : undefined;

    const clientRatesHtml = formatPricingConfigHtml(
      term.pricingModel,
      pricingConfig,
    );
    const vendorRatesHtml = vendorPricing
      ? formatPricingConfigHtml(
          typeof vendorPricing.pricingModel === "string"
            ? (vendorPricing.pricingModel as PricingModel)
            : term.pricingModel,
          vendorPricing,
        )
      : "";

    const effectiveStartDate = formatDate(term.effectiveDate);
    const effectiveEndDate = formatDate(term.endDate);
    const agreementName = term.agreement?.practice?.name?.trim() || null;
    const serviceName = term.service?.name?.trim() || null;
    const vendorName = term.vendor?.name?.trim() || null;

    // ✅ NEW: Use percentage-aware formatting
    const clientRevenue = formatValue(approvalData.clientAmount);
    const vendorCost = formatValue(approvalData.vendorAmount);
    const grossMargin = formatValue(approvalData.grossMargin);
    const marginPct =
      approvalData.marginPct !== undefined && !isNaN(approvalData.marginPct)
        ? `${approvalData.marginPct.toFixed(2)}%`
        : null;

    const isAlreadyDecided =
      internalApprovalStatus !== ApprovalDecisionStatus.PENDING;

    const html = `
      <!doctype html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Pricing Term Approval</title>
        <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>${COMMON_STYLES}</style>
      </head>
      <body>
        <div class="card">
          <h1>Pricing Term Approval</h1>
          <p class="intro">Review the pricing term details below and decide whether to approve or reject it.</p>
          <span class="badge ${approvalStatusCss}">${escapeHtml(internalApprovalStatus)}</span>
          
          <div class="section">
            <h2>Basic Information</h2>
            ${agreementName ? `<div class="detail-card"><dt>Agreement</dt><dd>${escapeHtml(agreementName)}</dd></div>` : ""}
            ${serviceName ? `<div class="detail-card"><dt>Service</dt><dd>${escapeHtml(serviceName)}</dd></div>` : ""}
            <div class="detail-card"><dt>Pricing Model</dt><dd>${escapeHtml(term.pricingModel)}</dd></div>
            ${vendorName ? `<div class="detail-card"><dt>Vendor</dt><dd>${escapeHtml(vendorName)}</dd></div>` : ""}
            ${effectiveStartDate ? `<div class="detail-card"><dt>Effective Start Date</dt><dd>${escapeHtml(effectiveStartDate)}</dd></div>` : ""}
            ${effectiveEndDate ? `<div class="detail-card"><dt>Effective End Date</dt><dd>${escapeHtml(effectiveEndDate)}</dd></div>` : ""}
          </div>

          <div class="section">
            <h2>Client Rates</h2>
            <div class="rate-section">
              ${clientRatesHtml}
              ${collectionSource ? `<div class="rate-item"><span class="rate-label">Collection Source:</span> <span class="rate-value">${escapeHtml(collectionSource)}</span></div>` : ""}
            </div>
          </div>

          ${
            vendorRatesHtml
              ? `
            <div class="section">
              <h2>Vendor Rates</h2>
              <div class="rate-section">${vendorRatesHtml}</div>
            </div>
          `
              : ""
          }

          <div class="section">
            <h2>Margin Preview</h2>
            ${clientRevenue ? `<div class="detail-card"><dt>${approvalData.isPercentageBased ? "Est. Client Rate" : "Est. Client Revenue"}</dt><dd style="color:#4f46e5;font-size:1.2rem;">${escapeHtml(clientRevenue)}</dd></div>` : ""}
            ${vendorCost ? `<div class="detail-card"><dt>${approvalData.isPercentageBased ? "Est. Vendor Rate" : "Est. Vendor Cost"}</dt><dd style="color:#ef4444;font-size:1.2rem;">${escapeHtml(vendorCost)}</dd></div>` : ""}
            ${grossMargin ? `<div class="detail-card"><dt>Est. Gross Margin</dt><dd style="color:#10b981;font-size:1.2rem;">${escapeHtml(grossMargin)}</dd></div>` : ""}
            ${marginPct ? `<div class="detail-card"><dt>Margin %</dt><dd style="color:${approvalData.marginPct < 20 ? "#f59e0b" : "#10b981"};font-size:1.2rem;">${escapeHtml(marginPct)}</dd></div>` : ""}
            ${approvalData.requiresApproval ? `<div class="note-card" style="background:#fef3c7;border-color:#fde047;color:#92400e;"><strong>⚠ Margin below threshold (${approvalData.marginPct.toFixed(2)}%)</strong></div>` : ""}
          </div>

          ${
            isAlreadyDecided
              ? `
            <div class="note-card ${internalApprovalStatus === ApprovalDecisionStatus.REJECTED ? "rejection" : "approved"}">
              <strong>${internalApprovalStatus === ApprovalDecisionStatus.APPROVED ? "✓ Approved" : "✕ Rejected"}</strong>
              <p>This pricing term has already been ${internalApprovalStatus === ApprovalDecisionStatus.APPROVED ? "approved" : "rejected"}. No further responses are allowed.</p>
            </div>
          `
              : approvalData.requiresApproval
                ? `
            <div class="section">
              <h2>Make Decision</h2>
              <div class="rate-section">
                <h3>✓ Approve This Term</h3>
                <form method="post" action="${actionUrl}?action=approve">
                  <div class="field">
                    <label for="note_approve">Optional approval note</label>
                    <textarea id="note_approve" name="note" placeholder="Enter a reason or comment..."></textarea>
                  </div>
                  <button type="submit" class="button accept">Approve</button>
                </form>
              </div>
              <div class="rate-section">
                <h3>✕ Reject This Term</h3>
                <form method="post" action="${actionUrl}?action=reject" onsubmit="return validateRejection(event)">
                  <div class="field">
                    <label for="note_reject">Rejection reason (required) <span style="color:#ef4444;">*</span></label>
                    <textarea id="note_reject" name="note" placeholder="Explain why you're rejecting this term..." required></textarea>
                  </div>
                  <div id="rejection-error" class="error" style="display:none;">Rejection reason is required.</div>
                  <button type="submit" class="button reject">Reject</button>
                </form>
              </div>
            </div>
            <script>
              function validateRejection(event) {
                const note = document.getElementById('note_reject').value.trim();
                const errorDiv = document.getElementById('rejection-error');
                if (!note) {
                  errorDiv.style.display = 'block';
                  errorDiv.textContent = 'Please fix the validation errors before continuing.';
                  event.preventDefault();
                  return false;
                }
                errorDiv.style.display = 'none';
                return true;
              }
            </script>
          `
                : `
            <div class="note-card approved">
              <strong>No approval required</strong>
              <p>This pricing term can be activated without additional approval.</p>
            </div>
          `
          }
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

// Continue with the rest of the functions (getAgreementServiceTermClientApprovalPage, handleAgreementServiceTermClientApproval, etc.)
// They follow the same pattern - I'll include the key ones below:

export async function getAgreementServiceTermClientApprovalPage(
  req: Request,
  res: Response,
) {
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
    const signerEmails = getSignerEmails(
      pricingConfig,
      term.externalReference,
    ).filter(isValidEmail);
    if (signerEmails.length === 0) {
      return res
        .status(400)
        .send("Client approval is not required for this pricing term.");
    }

    const clientApprovalStatus =
      (pricingConfig.clientApprovalStatus as ApprovalDecisionStatus) ??
      ApprovalDecisionStatus.PENDING;
    const effectiveStartDate = term.effectiveDate
      ? new Date(term.effectiveDate).toLocaleDateString("en-US")
      : "N/A";
    const effectiveEndDate = term.endDate
      ? new Date(term.endDate).toLocaleDateString("en-US")
      : "N/A";
    const clientDetails = formatPricingConfigHtml(
      term.pricingModel,
      pricingConfig,
    );
    const collectionSource =
      typeof pricingConfig.collectionSource === "string" &&
      pricingConfig.collectionSource.trim()
        ? pricingConfig.collectionSource.trim()
        : null;
    const clientApprovalNote =
      typeof pricingConfig.clientApprovalNote === "string"
        ? pricingConfig.clientApprovalNote.trim()
        : null;

    if (clientApprovalStatus !== ApprovalDecisionStatus.PENDING) {
      const isApproved =
        clientApprovalStatus === ApprovalDecisionStatus.APPROVED;
      return res.status(200).contentType("text/html").send(`
        <!doctype html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Pricing Packet ${escapeHtml(clientApprovalStatus)}</title>
            <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
            <style>${COMMON_STYLES}</style>
          </head>
          <body>
            <div class="card">
              <h1>Pricing Packet ${escapeHtml(isApproved ? "Accepted" : "Denied")}</h1>
              <span class="badge ${isApproved ? "badge-approved" : "badge-rejected"}">${escapeHtml(clientApprovalStatus)}</span>
              <div class="note-card ${isApproved ? "approved" : "rejection"}">
                <strong>${isApproved ? "✓ This packet has been accepted" : "✕ This packet has been denied"}</strong>
                <p>${isApproved ? "Thank you for accepting this pricing packet." : "This pricing packet has been denied."}</p>
                ${clientApprovalNote ? `<p style="margin-top:12px;"><strong>Reason:</strong> ${escapeHtml(clientApprovalNote)}</p>` : ""}
                <p style="margin-top:16px;color:#94a3b8;font-size:0.85rem;">No further action is required.</p>
              </div>
            </div>
          </body>
        </html>
      `);
    }

    const clientApprovalUrl = `/api/v1/agreements/service-terms/${term.id}/client-approval`;
    const acceptUrl = `${clientApprovalUrl}?action=accept`;
    const rejectUrl = `${clientApprovalUrl}?action=reject`;

    const html = `
      <!doctype html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Pricing Packet Response</title>
        <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>${COMMON_STYLES}</style>
      </head>
      <body>
        <div class="card">
          <h1>Pricing Packet</h1>
          <p class="intro">Please review the pricing details below and accept or deny this packet.</p>
          <span class="badge badge-pending">Pending Your Response</span>
          
          <div class="section">
            <h2>Agreement Details</h2>
            <div class="detail-card">
              <dt>Agreement</dt>
              <dd>${escapeHtml(term.agreement?.practice?.name ?? "Agreement")}</dd>
            </div>
            <div class="detail-card">
              <dt>Service</dt>
              <dd>${escapeHtml(term.service?.name ?? "Service")}</dd>
            </div>
            <div class="detail-card">
              <dt>Effective Start Date</dt>
              <dd>${escapeHtml(effectiveStartDate)}</dd>
            </div>
            <div class="detail-card">
              <dt>Effective End Date</dt>
              <dd>${escapeHtml(effectiveEndDate)}</dd>
            </div>
          </div>

          <div class="section">
            <h2>Rates</h2>
            <div class="rate-section">
              ${clientDetails}
              ${collectionSource ? `<div class="rate-item"><span class="rate-label">Collection Source:</span> <span class="rate-value">${escapeHtml(collectionSource)}</span></div>` : ""}
            </div>
          </div>

          <div class="section">
            <h2>Your Response</h2>
            <p style="color:#64748b;margin-bottom:16px;">Please choose whether to accept or deny this pricing packet:</p>
            
            <form method="post" action="${acceptUrl}" style="display:inline-block;margin-right:12px;">
              <button type="submit" class="button accept">✓ Accept Packet</button>
            </form>
            
            <form method="post" action="${rejectUrl}" style="display:inline-block;">
              <button type="submit" class="button reject">✕ Deny Packet</button>
            </form>
            
            <p style="margin-top:16px;font-size:0.85rem;color:#94a3b8;">
              <strong>Note:</strong> If you deny this packet, you will be asked to provide a reason on the next page.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    return res.status(200).contentType("text/html").send(html);
  } catch (error) {
    console.error("Unable to render client approval page", error);
    return res.status(500).send("Unable to render client approval page.");
  }
}

export async function handleAgreementServiceTermClientApproval(
  req: Request,
  res: Response,
) {
  try {
    const termId = req.params.id as string;
    const action = String(req.query.action || "").toLowerCase();
    const note =
      typeof req.body?.note === "string" ? req.body.note.trim() : undefined;

    if (action !== "accept" && action !== "reject") {
      return res.status(400).send("Invalid client approval action.");
    }

    const term = await prisma.agreementServiceTerm.findUnique({
      where: { id: termId },
    });

    if (!term) {
      return res.status(404).send("Pricing term not found.");
    }

    const pricingConfig = term.pricingConfig as Record<string, unknown>;
    const signerEmails = getSignerEmails(
      pricingConfig,
      term.externalReference,
    ).filter(isValidEmail);
    if (signerEmails.length === 0) {
      return res
        .status(400).send("Client approval is not required for this pricing term.");
    }

    const currentClientApprovalStatus =
      (pricingConfig.clientApprovalStatus as ApprovalDecisionStatus) ??
      ApprovalDecisionStatus.PENDING;

    if (currentClientApprovalStatus !== ApprovalDecisionStatus.PENDING) {
      const isApproved =
        currentClientApprovalStatus === ApprovalDecisionStatus.APPROVED;
      return res.status(200).contentType("text/html").send(`
        <!doctype html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Already Submitted</title>
            <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
            <style>${COMMON_STYLES}</style>
          </head>
          <body>
            <div class="card">
              <h1>Response Already Submitted</h1>
              <div class="note-card ${isApproved ? "approved" : "rejection"}">
                <strong>${isApproved ? "✓ Already Accepted" : "✕ Already Denied"}</strong>
                <p>This pricing packet has already been ${isApproved ? "accepted" : "denied"}. You cannot submit another response.</p>
              </div>
            </div>
          </body>
        </html>
      `);
    }

    if (action === "reject" && !note) {
      return res.status(200).contentType("text/html").send(`
        <!doctype html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Deny Reason Required</title>
          <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
          <style>${COMMON_STYLES}</style>
        </head>
        <body>
          <div class="card">
            <h1>Deny Reason Required</h1>
            <p class="intro">Please provide a reason for denying this pricing packet.</p>
            <form method="post" action="/api/v1/agreements/service-terms/${termId}/client-approval?action=reject" onsubmit="return validateForm(event)">
              <div class="field">
                <label for="note">Deny Reason <span style="color:#ef4444;">*</span></label>
                <textarea id="note" name="note" placeholder="Explain why you're denying this packet..." required></textarea>
              </div>
              <div id="error" class="error" style="display:none;">Please fix the validation errors before continuing.</div>
              <button type="submit" class="button reject">Submit Deny Reason</button>
            </form>
          </div>
          <script>
            function validateForm(event) {
              const note = document.getElementById('note').value.trim();
              const errorDiv = document.getElementById('error');
              if (!note) {
                errorDiv.style.display = 'block';
                event.preventDefault();
                return false;
              }
              errorDiv.style.display = 'none';
              return true;
            }
          </script>
        </body>
        </html>
      `);
    }

    const approvalData = getPricingTermApprovalData(
      term.pricingModel,
      pricingConfig,
    );

    const currentInternalStatus = pricingConfig.internalApprovalStatus as
      | ApprovalDecisionStatus
      | undefined;
    const internalApprovalStatus =
      currentInternalStatus ??
      (approvalData.requiresApproval
        ? ApprovalDecisionStatus.PENDING
        : ApprovalDecisionStatus.APPROVED);

    const nextClientStatus =
      action === "accept"
        ? ApprovalDecisionStatus.APPROVED
        : ApprovalDecisionStatus.REJECTED;

    const isActive =
      nextClientStatus === ApprovalDecisionStatus.APPROVED &&
      internalApprovalStatus === ApprovalDecisionStatus.APPROVED;

    const updatedConfig = {
      ...pricingConfig,
      clientApprovalStatus: nextClientStatus,
      clientApprovalNote: note ?? null,
      internalApprovalStatus,
    } as Prisma.JsonObject;

    await prisma.agreementServiceTerm.update({
      where: { id: termId },
      data: {
        pricingConfig: updatedConfig,
        isActive,
      },
    });

    await prisma.approvalDecision.create({
      data: {
        entityType: ApprovalEntityType.AGREEMENT_TERM,
        entityId: termId,
        decision: nextClientStatus,
        note:
          note ??
          `Client ${action === "accept" ? "accepted" : "denied"} the packet`,
        decidedAt: new Date(),
      },
    });

    const isApproved = nextClientStatus === ApprovalDecisionStatus.APPROVED;

    const html = `
      <!doctype html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Pricing Packet ${escapeHtml(isApproved ? "Accepted" : "Denied")}</title>
        <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>${COMMON_STYLES}</style>
      </head>
      <body>
        <div class="card">
          <h1>Pricing Packet ${escapeHtml(isApproved ? "Accepted" : "Denied")}</h1>
          <span class="badge ${isApproved ? "badge-approved" : "badge-rejected"}">${escapeHtml(nextClientStatus)}</span>
          <div class="note-card ${isApproved ? "approved" : "rejection"}">
            <strong>${isApproved ? "✓ Thank you!" : "✕ Packet Denied"}</strong>
            <p>${isApproved ? "Thank you for accepting this pricing packet." : "The pricing packet has been denied."}</p>
            ${note ? `<p style="margin-top:12px;"><strong>Reason:</strong> ${escapeHtml(note)}</p>` : ""}
            ${isApproved && isActive ? `<p style="margin-top:12px;color:#10b981;"><strong>✓ This pricing term is now Active.</strong></p>` : ""}
            ${isApproved && !isActive ? `<p style="margin-top:12px;color:#f59e0b;"><strong>Awaiting internal approval to activate.</strong></p>` : ""}
          </div>
        </div>
      </body>
      </html>
    `;

    return res.status(200).contentType("text/html").send(html);
  } catch (error) {
    console.error("Client approval handling error:", error);
    return res.status(500).send("Unable to process client approval decision.");
  }
}

export async function handleAgreementServiceTermApproval(
  req: Request,
  res: Response,
) {
  try {
    const termId = req.params.id as string;
    const action = String(req.query.action || "").toLowerCase();
    const note =
      typeof req.body?.note === "string" ? req.body.note.trim() : undefined;

    if (action !== "approve" && action !== "reject") {
      return res.status(400).send("Invalid approval action.");
    }

    if (action === "reject" && !note) {
      return res.status(400).send("Please fix the validation errors before continuing. Rejection note is required.");
    }

    const decision =
      action === "approve"
        ? ApprovalDecisionStatus.APPROVED
        : ApprovalDecisionStatus.REJECTED;

    const term = await prisma.agreementServiceTerm.findUnique({
      where: { id: termId },
    });

    if (!term) {
      return res.status(404).send("Pricing term not found.");
    }

    const pricingConfig = term.pricingConfig as Record<string, unknown>;
    const approvalData = getPricingTermApprovalData(
      term.pricingModel,
      pricingConfig,
    );

    if (!approvalData.requiresApproval) {
      return res
        .status(400)
        .send("This pricing term does not require approval.");
    }

    const internalApprovalStatus =
      (pricingConfig.internalApprovalStatus as ApprovalDecisionStatus) ??
      ApprovalDecisionStatus.PENDING;

    if (internalApprovalStatus !== ApprovalDecisionStatus.PENDING) {
      return res
        .status(400)
        .send("Approval decision has already been submitted.");
    }

    const currentClientStatus = pricingConfig.clientApprovalStatus as
      | ApprovalDecisionStatus
      | undefined;
    const signerEmails = getSignerEmails(
      pricingConfig,
      term.externalReference,
    ).filter(isValidEmail);
    const hasSignerEmails = signerEmails.length > 0;

    const clientApprovalStatus =
      currentClientStatus ??
      (hasSignerEmails
        ? ApprovalDecisionStatus.PENDING
        : ApprovalDecisionStatus.APPROVED);

    const isActive =
      decision === ApprovalDecisionStatus.APPROVED &&
      clientApprovalStatus === ApprovalDecisionStatus.APPROVED;

    const updatedConfig = {
      ...pricingConfig,
      internalApprovalStatus: decision,
      internalApprovalNote: note ?? null,
      clientApprovalStatus,
    } as Prisma.JsonObject;

    await prisma.$transaction(async (tx) => {
      await tx.agreementServiceTerm.update({
        where: { id: termId },
        data: {
          pricingConfig: updatedConfig,
          isActive,
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
    });

    const html = `
      <!doctype html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Pricing Term ${escapeHtml(decision)}</title>
        <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>${COMMON_STYLES}</style>
      </head>
      <body>
        <div class="card">
          <h1>Pricing Term ${escapeHtml(decision)}</h1>
          <span class="badge ${decision === ApprovalDecisionStatus.APPROVED ? "badge-approved" : "badge-rejected"}">${escapeHtml(decision)}</span>
          <div class="note-card ${decision === ApprovalDecisionStatus.APPROVED ? "approved" : "rejection"}">
            <strong>${decision === ApprovalDecisionStatus.APPROVED ? "✓ Approved" : "✕ Rejected"}</strong>
            <p>The pricing term was successfully ${decision === ApprovalDecisionStatus.APPROVED ? "approved" : "rejected"}.</p>
            ${note ? `<p style="margin-top:12px;"><strong>Note:</strong> ${escapeHtml(note)}</p>` : ""}
            ${isActive ? `<p style="margin-top:12px;color:#10b981;"><strong>✓ This pricing term is now Active.</strong></p>` : ""}
            ${decision === ApprovalDecisionStatus.APPROVED && !isActive ? `<p style="margin-top:12px;color:#f59e0b;"><strong>⏳ Awaiting client approval to activate.</strong></p>` : ""}
          </div>
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
