export const billingPaymentMethods = ["ACH", "CREDIT_CARD"] as const;
export const feeBearers = ["CLIENT", "COMPANY"] as const;

export type BillingPaymentMethod = (typeof billingPaymentMethods)[number];
export type FeeBearer = (typeof feeBearers)[number];

export type FeeRule = {
  ratePercent: number;
  fixedFee: number;
  capAmount?: number | null;
};

export type ProcessingFeeSettings = {
  creditCard: Record<FeeBearer, FeeRule>;
  ach: Record<FeeBearer, FeeRule>;
};

export type ProcessingFeeAllocationSettings = {
  allocationMode: "PERCENT";
  creditCard: Record<FeeBearer, FeeRule>;
  ach: Record<FeeBearer, FeeRule>;
};

export type ProcessingFeeComputation = {
  paymentMethod: BillingPaymentMethod;
  feeBearer: FeeBearer;
  baseAmount: number;
  feeAmount: number;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundPercent(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function asNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readValue(source: any, flatKey: string, path: string[], fallback: number) {
  let nested = source;
  for (const key of path) {
    nested = nested?.[key];
  }
  return asNumber(source?.[flatKey] ?? nested, fallback);
}

export function isBillingPaymentMethod(
  value: string | null | undefined,
): value is BillingPaymentMethod {
  return billingPaymentMethods.includes(value as BillingPaymentMethod);
}

export function isFeeBearer(value: string | null | undefined): value is FeeBearer {
  return feeBearers.includes(value as FeeBearer);
}

export function getBillingPaymentMethodLabel(
  paymentMethod: BillingPaymentMethod,
) {
  return paymentMethod === "CREDIT_CARD" ? "Credit Card" : "ACH";
}

export function getFeeBearerLabel(feeBearer: FeeBearer) {
  return feeBearer === "COMPANY" ? "Company" : "Client";
}

export function getStripePaymentMethodTypes(
  paymentMethod: BillingPaymentMethod,
): string[] {
  return paymentMethod === "CREDIT_CARD" ? ["card"] : ["us_bank_account"];
}

export function getProcessingFeeDescription(
  paymentMethod: BillingPaymentMethod,
) {
  return `${getBillingPaymentMethodLabel(paymentMethod)} processing fee`;
}

export function getDefaultProcessingFeeSettings(): ProcessingFeeSettings {
  return {
    creditCard: {
      COMPANY: { ratePercent: 1.4, fixedFee: 0.3, capAmount: null },
      CLIENT: { ratePercent: 1.5, fixedFee: 0, capAmount: null },
    },
    ach: {
      COMPANY: { ratePercent: 0.8, fixedFee: 0, capAmount: 5 },
      CLIENT: { ratePercent: 0, fixedFee: 0, capAmount: 0 },
    },
  };
}

function getAllocationShare(value: number, total: number) {
  if (total <= 0) {
    return 0;
  }
  return roundPercent((value / total) * 100);
}

function normalizeAllocationPair(
  first: number,
  second: number,
): [number, number] {
  const total = roundMoney(Math.max(0, first) + Math.max(0, second));
  if (total <= 0) {
    return [0, 0];
  }

  const firstShare = getAllocationShare(Math.max(0, first), total);
  return [firstShare, roundPercent(100 - firstShare)];
}

export function getGeneralProcessingFeeTotals(source?: any) {
  const normalized = buildProcessingFeeSettings(source);

  return {
    creditCard: {
      ratePercent: roundMoney(
        normalized.creditCard.COMPANY.ratePercent +
          normalized.creditCard.CLIENT.ratePercent,
      ),
      fixedFee: roundMoney(
        normalized.creditCard.COMPANY.fixedFee +
          normalized.creditCard.CLIENT.fixedFee,
      ),
    },
    ach: {
      ratePercent: roundMoney(
        normalized.ach.COMPANY.ratePercent +
          normalized.ach.CLIENT.ratePercent,
      ),
      capAmount: roundMoney(
        (normalized.ach.COMPANY.capAmount || 0) +
          (normalized.ach.CLIENT.capAmount || 0),
      ),
    },
  };
}

export function buildPracticeDefaultProcessingFeeSettings(
  source?: any,
): ProcessingFeeAllocationSettings {
  const actualSettings = buildProcessingFeeSettings(source);
  return buildProcessingFeeAllocationSettings(actualSettings);
}

export function buildProcessingFeeAllocationSettings(
  source?: any,
): ProcessingFeeAllocationSettings {
  if (source?.allocationMode === "PERCENT") {
    return {
      allocationMode: "PERCENT",
      creditCard: {
        COMPANY: {
          ratePercent: readValue(
            source,
            "creditCardCompanyRatePercent",
            ["creditCard", "COMPANY", "ratePercent"],
            0,
          ),
          fixedFee: readValue(
            source,
            "creditCardCompanyFixedFee",
            ["creditCard", "COMPANY", "fixedFee"],
            0,
          ),
          capAmount: null,
        },
        CLIENT: {
          ratePercent: readValue(
            source,
            "creditCardClientRatePercent",
            ["creditCard", "CLIENT", "ratePercent"],
            0,
          ),
          fixedFee: readValue(
            source,
            "creditCardClientFixedFee",
            ["creditCard", "CLIENT", "fixedFee"],
            0,
          ),
          capAmount: null,
        },
      },
      ach: {
        COMPANY: {
          ratePercent: readValue(
            source,
            "achCompanyRatePercent",
            ["ach", "COMPANY", "ratePercent"],
            0,
          ),
          fixedFee: 0,
          capAmount: readValue(
            source,
            "achCompanyCapAmount",
            ["ach", "COMPANY", "capAmount"],
            0,
          ),
        },
        CLIENT: {
          ratePercent: readValue(
            source,
            "achClientRatePercent",
            ["ach", "CLIENT", "ratePercent"],
            0,
          ),
          fixedFee: 0,
          capAmount: readValue(
            source,
            "achClientCapAmount",
            ["ach", "CLIENT", "capAmount"],
            0,
          ),
        },
      },
    };
  }

  const actualSettings = buildProcessingFeeSettings(source);
  const [creditRateCompany, creditRateClient] = normalizeAllocationPair(
    actualSettings.creditCard.COMPANY.ratePercent,
    actualSettings.creditCard.CLIENT.ratePercent,
  );
  const [creditFixedCompany, creditFixedClient] = normalizeAllocationPair(
    actualSettings.creditCard.COMPANY.fixedFee,
    actualSettings.creditCard.CLIENT.fixedFee,
  );
  const [achRateCompany, achRateClient] = normalizeAllocationPair(
    actualSettings.ach.COMPANY.ratePercent,
    actualSettings.ach.CLIENT.ratePercent,
  );
  const [achCapCompany, achCapClient] = normalizeAllocationPair(
    actualSettings.ach.COMPANY.capAmount || 0,
    actualSettings.ach.CLIENT.capAmount || 0,
  );

  return {
    allocationMode: "PERCENT",
    creditCard: {
      COMPANY: {
        ratePercent: creditRateCompany,
        fixedFee: creditFixedCompany,
        capAmount: null,
      },
      CLIENT: {
        ratePercent: creditRateClient,
        fixedFee: creditFixedClient,
        capAmount: null,
      },
    },
    ach: {
      COMPANY: {
        ratePercent: achRateCompany,
        fixedFee: 0,
        capAmount: achCapCompany,
      },
      CLIENT: {
        ratePercent: achRateClient,
        fixedFee: 0,
        capAmount: achCapClient,
      },
    },
  };
}

export function materializeProcessingFeeSettings(
  allocationSettings: ProcessingFeeAllocationSettings,
  totalsSource?: any,
): ProcessingFeeSettings {
  const totals = buildProcessingFeeSettings(totalsSource);

  return {
    creditCard: {
      COMPANY: {
        ratePercent: roundMoney(
          (totals.creditCard.COMPANY.ratePercent +
            totals.creditCard.CLIENT.ratePercent) *
            (allocationSettings.creditCard.COMPANY.ratePercent / 100),
        ),
        fixedFee: roundMoney(
          (totals.creditCard.COMPANY.fixedFee +
            totals.creditCard.CLIENT.fixedFee) *
            (allocationSettings.creditCard.COMPANY.fixedFee / 100),
        ),
        capAmount: null,
      },
      CLIENT: {
        ratePercent: roundMoney(
          (totals.creditCard.COMPANY.ratePercent +
            totals.creditCard.CLIENT.ratePercent) *
            (allocationSettings.creditCard.CLIENT.ratePercent / 100),
        ),
        fixedFee: roundMoney(
          (totals.creditCard.COMPANY.fixedFee +
            totals.creditCard.CLIENT.fixedFee) *
            (allocationSettings.creditCard.CLIENT.fixedFee / 100),
        ),
        capAmount: null,
      },
    },
    ach: {
      COMPANY: {
        ratePercent: roundMoney(
          (totals.ach.COMPANY.ratePercent + totals.ach.CLIENT.ratePercent) *
            (allocationSettings.ach.COMPANY.ratePercent / 100),
        ),
        fixedFee: 0,
        capAmount: roundMoney(
          ((totals.ach.COMPANY.capAmount || 0) +
            (totals.ach.CLIENT.capAmount || 0)) *
            ((allocationSettings.ach.COMPANY.capAmount || 0) / 100),
        ),
      },
      CLIENT: {
        ratePercent: roundMoney(
          (totals.ach.COMPANY.ratePercent + totals.ach.CLIENT.ratePercent) *
            (allocationSettings.ach.CLIENT.ratePercent / 100),
        ),
        fixedFee: 0,
        capAmount: roundMoney(
          ((totals.ach.COMPANY.capAmount || 0) +
            (totals.ach.CLIENT.capAmount || 0)) *
            ((allocationSettings.ach.CLIENT.capAmount || 0) / 100),
        ),
      },
    },
  };
}

export function buildProcessingFeeSettings(source?: any): ProcessingFeeSettings {
  const defaults = getDefaultProcessingFeeSettings();
  return {
    creditCard: {
      COMPANY: {
        ratePercent: readValue(
          source,
          "creditCardCompanyRatePercent",
          ["creditCard", "COMPANY", "ratePercent"],
          defaults.creditCard.COMPANY.ratePercent,
        ),
        fixedFee: readValue(
          source,
          "creditCardCompanyFixedFee",
          ["creditCard", "COMPANY", "fixedFee"],
          defaults.creditCard.COMPANY.fixedFee,
        ),
        capAmount: null,
      },
      CLIENT: {
        ratePercent: readValue(
          source,
          "creditCardClientRatePercent",
          ["creditCard", "CLIENT", "ratePercent"],
          defaults.creditCard.CLIENT.ratePercent,
        ),
        fixedFee: readValue(
          source,
          "creditCardClientFixedFee",
          ["creditCard", "CLIENT", "fixedFee"],
          defaults.creditCard.CLIENT.fixedFee,
        ),
        capAmount: null,
      },
    },
    ach: {
      COMPANY: {
        ratePercent: readValue(
          source,
          "achCompanyRatePercent",
          ["ach", "COMPANY", "ratePercent"],
          defaults.ach.COMPANY.ratePercent,
        ),
        fixedFee: 0,
        capAmount: readValue(
          source,
          "achCompanyCapAmount",
          ["ach", "COMPANY", "capAmount"],
          defaults.ach.COMPANY.capAmount || 0,
        ),
      },
      CLIENT: {
        ratePercent: readValue(
          source,
          "achClientRatePercent",
          ["ach", "CLIENT", "ratePercent"],
          defaults.ach.CLIENT.ratePercent,
        ),
        fixedFee: 0,
        capAmount: readValue(
          source,
          "achClientCapAmount",
          ["ach", "CLIENT", "capAmount"],
          defaults.ach.CLIENT.capAmount || 0,
        ),
      },
    },
  };
}

export function validateProcessingFeeSettingsOverride(
  baseSettings: ProcessingFeeSettings,
  overrideSettings: ProcessingFeeSettings,
) {
  const fields: Array<[number, number, string]> = [
    [
      overrideSettings.creditCard.COMPANY.ratePercent,
      baseSettings.creditCard.COMPANY.ratePercent,
      "Credit Card Company Rate",
    ],
    [
      overrideSettings.creditCard.COMPANY.fixedFee,
      baseSettings.creditCard.COMPANY.fixedFee,
      "Credit Card Company Fixed Fee",
    ],
    [
      overrideSettings.creditCard.CLIENT.ratePercent,
      baseSettings.creditCard.CLIENT.ratePercent,
      "Credit Card Client Rate",
    ],
    [
      overrideSettings.creditCard.CLIENT.fixedFee,
      baseSettings.creditCard.CLIENT.fixedFee,
      "Credit Card Client Fixed Fee",
    ],
    [
      overrideSettings.ach.COMPANY.ratePercent,
      baseSettings.ach.COMPANY.ratePercent,
      "ACH Company Rate",
    ],
    [
      overrideSettings.ach.COMPANY.capAmount || 0,
      baseSettings.ach.COMPANY.capAmount || 0,
      "ACH Company Cap",
    ],
    [
      overrideSettings.ach.CLIENT.ratePercent,
      baseSettings.ach.CLIENT.ratePercent,
      "ACH Client Rate",
    ],
    [
      overrideSettings.ach.CLIENT.capAmount || 0,
      baseSettings.ach.CLIENT.capAmount || 0,
      "ACH Client Cap",
    ],
  ];

  for (const [value, maxValue, label] of fields) {
    if (value < 0) {
      throw new Error(`${label} cannot be negative.`);
    }
    if (value > maxValue) {
      throw new Error(`${label} cannot exceed General Settings.`);
    }
  }
}

export function getFeeRule(
  settings: ProcessingFeeSettings,
  paymentMethod: BillingPaymentMethod,
  feeBearer: FeeBearer,
): FeeRule {
  return paymentMethod === "CREDIT_CARD"
    ? settings.creditCard[feeBearer]
    : settings.ach[feeBearer];
}

export function calculateConfiguredFee(
  baseAmount: number,
  rule: FeeRule,
): number {
  const normalizedBase = roundMoney(Math.max(0, baseAmount));
  let feeAmount = roundMoney(normalizedBase * (rule.ratePercent / 100) + rule.fixedFee);
  if (typeof rule.capAmount === "number") {
    feeAmount = roundMoney(Math.min(feeAmount, Math.max(0, rule.capAmount)));
  }
  return feeAmount;
}

export function calculateBearerProcessingAmounts(params: {
  baseAmount: number;
  paymentMethod: BillingPaymentMethod;
  feeBearer: FeeBearer;
  settings: ProcessingFeeSettings;
  companyFeeAmountOverride?: number | null;
}) {
  const normalizedBase = roundMoney(Math.max(0, params.baseAmount));
  const clientRule = getFeeRule(params.settings, params.paymentMethod, "CLIENT");
  const companyRule = getFeeRule(
    params.settings,
    params.paymentMethod,
    "COMPANY",
  );

  const maxClientFeeAmount = calculateConfiguredFee(normalizedBase, clientRule);
  const maxCompanyFeeAmount = calculateConfiguredFee(normalizedBase, companyRule);
  const clientFeeAmount = maxClientFeeAmount;
  const companyFeeAmount = maxCompanyFeeAmount;

  return {
    baseAmount: normalizedBase,
    paymentMethod: params.paymentMethod,
    feeBearer:
      clientFeeAmount > 0 ? "CLIENT" : companyFeeAmount > 0 ? "COMPANY" : params.feeBearer,
    clientFeeAmount,
    companyFeeAmount,
    maxClientFeeAmount,
    maxCompanyFeeAmount,
    customerInvoiceAmount: roundMoney(normalizedBase + clientFeeAmount),
  };
}

export function allocateCompanyFeeAcrossAmounts(
  amounts: number[],
  totalCompanyFeeAmount: number,
): number[] {
  const roundedFee = roundMoney(Math.max(0, totalCompanyFeeAmount));
  if (roundedFee <= 0 || amounts.length === 0) {
    return amounts.map(() => 0);
  }

  const normalizedAmounts = amounts.map((amount) => roundMoney(Math.max(0, amount)));
  const subtotal = roundMoney(
    normalizedAmounts.reduce((sum, amount) => sum + amount, 0),
  );

  if (subtotal <= 0) {
    return normalizedAmounts.map(() => 0);
  }

  let allocatedTotal = 0;
  const allocations = normalizedAmounts.map((amount, index) => {
    if (index === normalizedAmounts.length - 1) {
      return 0;
    }
    const share = roundMoney((amount / subtotal) * roundedFee);
    const bounded = roundMoney(Math.min(share, amount));
    allocatedTotal = roundMoney(allocatedTotal + bounded);
    return bounded;
  });

  const remainder = roundMoney(
    Math.min(
      roundedFee - allocatedTotal,
      normalizedAmounts[normalizedAmounts.length - 1],
    ),
  );
  allocations[normalizedAmounts.length - 1] = remainder;

  return allocations;
}
