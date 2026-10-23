import { prisma } from "../lib/prisma";

export interface PracticePrefundingValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  details: {
    isPrefundingEnabled: boolean;
    prefundingCycle: string | null;
    prefundingStartDate: Date | null;
    hasRates: boolean;
    ratesCount: number;
    hasRecipient: boolean;
    recipientName?: string | null;
    prefundingState: string | null;
    prefundingDueOn: number | null;
    prefundingReminderOn: number | null;
    prefundingStripeAccountId: string | null;
    billingPaymentMethod: string | null;
  };
}

export async function validatePracticeForPrefunding(
  practiceId: string
): Promise<PracticePrefundingValidationResult> {
  const practice = await prisma.practice.findUnique({
    where: { id: practiceId },
    include: {
      prefundingRates: {
        include: { prefundingRate: true },
      },
      persons: {
        include: { person: true },
      },
    },
  });

  if (!practice) {
    return {
      isValid: false,
      errors: ["Practice not found."],
      warnings: [],
      details: {
        isPrefundingEnabled: false,
        prefundingCycle: null,
        prefundingStartDate: null,
        hasRates: false,
        ratesCount: 0,
        hasRecipient: false,
        prefundingState: null,
        prefundingDueOn: null,
        prefundingReminderOn: null,
        prefundingStripeAccountId: null,
        billingPaymentMethod: null,
      },
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Prefunding Enabled
  if (!practice.isPrefundingEnabled) {
    errors.push("Prefunding is not enabled for this practice.");
  }

  // 2. Prefunding Cycle must be configured
  if (!practice.prefundingCycle || !practice.prefundingCycle.trim()) {
    errors.push("Prefunding Cycle must be configured in Practice Settings.");
  }

  // 3. Start Date must be configured
  if (!practice.prefundingStartDate) {
    errors.push("Prefunding Start Date must be configured in Practice Settings.");
  }

  // 4. At least one applicable Prefunding Rate should be selected where required
  const ratesCount = practice.prefundingRates?.length || 0;
  if (ratesCount === 0) {
    // Check if there are any rates assigned directly or globally to this practice
    const assignedRatesCount = await prisma.prefundingPracticeRate.count({
      where: { practiceId },
    });
    if (assignedRatesCount === 0) {
      errors.push("At least one applicable Prefunding Rate must be selected / assigned to the practice.");
    }
  }

  // 5. Prefunding Invoice Recipient must be available
  let recipientName: string | null = null;
  let hasRecipient = false;

  if (practice.prefundingInvoiceRecipientId) {
    const recipientPerson = await prisma.person.findUnique({
      where: { id: practice.prefundingInvoiceRecipientId },
    });
    if (recipientPerson) {
      hasRecipient = true;
      recipientName = `${recipientPerson.firstName} ${recipientPerson.lastName}`.trim();
    }
  }

  // Fallback check: if no designated recipient, check if practice has associated contact persons or emails
  if (!hasRecipient) {
    const firstPerson = practice.persons?.[0]?.person;
    if (firstPerson?.email) {
      hasRecipient = true;
      recipientName = `${firstPerson.firstName} ${firstPerson.lastName}`.trim();
      warnings.push(`No designated Prefunding Invoice Recipient configured; defaulting to primary contact (${recipientName}).`);
    } else if (practice.emails && practice.emails.length > 0) {
      hasRecipient = true;
      recipientName = practice.emails[0];
      warnings.push(`No designated Prefunding Invoice Recipient configured; defaulting to practice email (${practice.emails[0]}).`);
    } else {
      errors.push("Prefunding Invoice Recipient must be available (neither designated recipient nor contact person with valid email exists).");
    }
  }

  // 6. State of Operation must be configured
  const effectiveState = practice.prefundingState || practice.state;
  if (!effectiveState || !effectiveState.trim()) {
    errors.push("State of Operation must be configured in Practice Settings.");
  }

  // 7. Due On and Reminder On must contain valid values (numbers > 0)
  if (practice.prefundingDueOn === null || practice.prefundingDueOn === undefined || Number(practice.prefundingDueOn) <= 0) {
    errors.push("Due On must contain a valid positive number (days before cycle start).");
  }

  if (practice.prefundingReminderOn === null || practice.prefundingReminderOn === undefined || Number(practice.prefundingReminderOn) <= 0) {
    errors.push("Reminder On must contain a valid positive number (days before due date).");
  }

  // 8. A valid Prefunding Stripe Account must be selected before invoice creation/posting where Stripe payment processing is applicable
  const paymentMethod = (practice.billingPaymentMethod || "ACH").toUpperCase();
  const isStripeApplicable = paymentMethod === "CREDIT_CARD" || paymentMethod === "ACH" || paymentMethod === "STRIPE";

  if (isStripeApplicable && (!practice.prefundingStripeAccountId || !practice.prefundingStripeAccountId.trim())) {
    errors.push("A valid Prefunding Stripe Account must be selected in Practice Settings where Stripe payment processing is applicable.");
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    details: {
      isPrefundingEnabled: practice.isPrefundingEnabled,
      prefundingCycle: practice.prefundingCycle,
      prefundingStartDate: practice.prefundingStartDate,
      hasRates: (practice.prefundingRates?.length || 0) > 0,
      ratesCount: practice.prefundingRates?.length || 0,
      hasRecipient,
      recipientName,
      prefundingState: effectiveState,
      prefundingDueOn: practice.prefundingDueOn,
      prefundingReminderOn: practice.prefundingReminderOn,
      prefundingStripeAccountId: practice.prefundingStripeAccountId,
      billingPaymentMethod: practice.billingPaymentMethod,
    },
  };
}
