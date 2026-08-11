import { Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { buildProcessingFeeSettings } from "../../utils/paymentProcessing";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeOptionalEmail(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeEmailList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean))];
}

function parseNonNegativeNumber(
  value: unknown,
  fieldLabel: string,
  fallback?: number,
) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldLabel} must be a non-negative number.`);
  }

  return parsed;
}

export async function getSystemSettings(req: AuthenticatedRequest, res: Response) {
  try {
    let settings = await prisma.systemSettings.findFirst();

    if (!settings) {
      const feeSettings = buildProcessingFeeSettings();
      // Initialize with defaults if none exist
      settings = await prisma.systemSettings.create({
        data: {
          organizationName: "Tristate MSO",
          domain: "tristate-mso.com",
          address: "123 Enterprise Way, Suite 500, New Jersey, NJ 07102",
          notifyTo: [],
          creditCardCompanyRatePercent: feeSettings.creditCard.COMPANY.ratePercent,
          creditCardCompanyFixedFee: feeSettings.creditCard.COMPANY.fixedFee,
          creditCardClientRatePercent: feeSettings.creditCard.CLIENT.ratePercent,
          creditCardClientFixedFee: feeSettings.creditCard.CLIENT.fixedFee,
          achCompanyRatePercent: feeSettings.ach.COMPANY.ratePercent,
          achCompanyCapAmount: feeSettings.ach.COMPANY.capAmount || 0,
          achClientRatePercent: feeSettings.ach.CLIENT.ratePercent,
          achClientCapAmount: feeSettings.ach.CLIENT.capAmount || 0,
          invoiceDueDays: 15,
          invoiceReminderDays: 5,
          credentialingReminderDays: 5,
        },
      });
    }

    return res.status(200).json({
      message: "Settings fetched successfully.",
      settings,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch settings.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updateSystemSettings(req: AuthenticatedRequest, res: Response) {
  try {
    const {
      organizationName,
      domain,
      address,
      supportEmail,
      authorizedSigner,
      notifyTo,
      creditCardCompanyRatePercent,
      creditCardCompanyFixedFee,
      creditCardClientRatePercent,
      creditCardClientFixedFee,
      achCompanyRatePercent,
      achCompanyCapAmount,
      achClientRatePercent,
      achClientCapAmount,
      invoiceDueDays,
      invoiceReminderDays,
      credentialingReminderDays,
    } = req.body;

    const normalizedAuthorizedSigner = normalizeOptionalEmail(authorizedSigner);
    const normalizedNotifyTo = normalizeEmailList(notifyTo);

    if (
      normalizedAuthorizedSigner &&
      !EMAIL_REGEX.test(normalizedAuthorizedSigner)
    ) {
      return res.status(400).json({
        message: "authorizedSigner must be a valid email address.",
      });
    }

    const invalidNotifyTo = normalizedNotifyTo.find(
      (email) => !EMAIL_REGEX.test(email),
    );

    if (invalidNotifyTo) {
      return res.status(400).json({
        message: `Invalid notifyTo email: ${invalidNotifyTo}.`,
      });
    }

    const parsedInvoiceDueDays = invoiceDueDays !== undefined ? parseInt(invoiceDueDays, 10) : 15;
    const parsedInvoiceReminderDays = invoiceReminderDays !== undefined ? parseInt(invoiceReminderDays, 10) : 5;
    const parsedCredentialingReminderDays = credentialingReminderDays !== undefined ? parseInt(credentialingReminderDays, 10) : 5;
    const feeSettings = buildProcessingFeeSettings({
      creditCardCompanyRatePercent: parseNonNegativeNumber(
        creditCardCompanyRatePercent,
        "Credit card company rate percent",
      ),
      creditCardCompanyFixedFee: parseNonNegativeNumber(
        creditCardCompanyFixedFee,
        "Credit card company fixed fee",
      ),
      creditCardClientRatePercent: parseNonNegativeNumber(
        creditCardClientRatePercent,
        "Credit card client rate percent",
      ),
      creditCardClientFixedFee: parseNonNegativeNumber(
        creditCardClientFixedFee,
        "Credit card client fixed fee",
      ),
      achCompanyRatePercent: parseNonNegativeNumber(
        achCompanyRatePercent,
        "ACH company rate percent",
      ),
      achCompanyCapAmount: parseNonNegativeNumber(
        achCompanyCapAmount,
        "ACH company cap amount",
      ),
      achClientRatePercent: parseNonNegativeNumber(
        achClientRatePercent,
        "ACH client rate percent",
      ),
      achClientCapAmount: parseNonNegativeNumber(
        achClientCapAmount,
        "ACH client cap amount",
      ),
    });

    if (isNaN(parsedInvoiceDueDays) || parsedInvoiceDueDays <= 0) {
      return res.status(400).json({
        message: "Invoice due days must be a positive integer.",
      });
    }

    if (isNaN(parsedInvoiceReminderDays) || parsedInvoiceReminderDays <= 0) {
      return res.status(400).json({
        message: "Invoice reminder days must be a positive integer.",
      });
    }

    if (isNaN(parsedCredentialingReminderDays) || parsedCredentialingReminderDays <= 0) {
      return res.status(400).json({
        message: "Credentialing reminder days must be a positive integer.",
      });
    }

    const existing = await prisma.systemSettings.findFirst();
    const data = {
      organizationName,
      domain,
      address,
      supportEmail,
      authorizedSigner: normalizedAuthorizedSigner,
      notifyTo: normalizedNotifyTo,
      creditCardCompanyRatePercent: feeSettings.creditCard.COMPANY.ratePercent,
      creditCardCompanyFixedFee: feeSettings.creditCard.COMPANY.fixedFee,
      creditCardClientRatePercent: feeSettings.creditCard.CLIENT.ratePercent,
      creditCardClientFixedFee: feeSettings.creditCard.CLIENT.fixedFee,
      achCompanyRatePercent: feeSettings.ach.COMPANY.ratePercent,
      achCompanyCapAmount: feeSettings.ach.COMPANY.capAmount ?? 0,
      achClientRatePercent: feeSettings.ach.CLIENT.ratePercent,
      achClientCapAmount: feeSettings.ach.CLIENT.capAmount ?? 0,
      invoiceDueDays: parsedInvoiceDueDays,
      invoiceReminderDays: parsedInvoiceReminderDays,
      credentialingReminderDays: parsedCredentialingReminderDays,
    };

    let settings;
    if (existing) {
      settings = await prisma.systemSettings.update({
        where: { id: existing.id },
        data,
      });
    } else {
      settings = await prisma.systemSettings.create({
        data,
      });
    }

    return res.status(200).json({
      message: "Settings updated successfully.",
      settings,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("must be a non-negative number")) {
      return res.status(400).json({
        message: error.message,
      });
    }
    return res.status(500).json({
      message: "Unable to update settings.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
