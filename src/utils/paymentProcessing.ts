export const billingPaymentMethods = ["ACH", "CREDIT_CARD"] as const;

export type BillingPaymentMethod = (typeof billingPaymentMethods)[number];

type ProcessingFeeConfig = {
  rate: number;
  fixedFee: number;
  maxFee?: number;
};

export type ProcessingFeeBreakdown = {
  paymentMethod: BillingPaymentMethod;
  netAmount: number;
  grossAmount: number;
  feeAmount: number;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getConfig(paymentMethod: BillingPaymentMethod): ProcessingFeeConfig {
  if (paymentMethod === "CREDIT_CARD") {
    return { rate: 0.029, fixedFee: 0.3 };
  }

  return { rate: 0.008, fixedFee: 0, maxFee: 5 };
}

export function isBillingPaymentMethod(
  value: string | null | undefined,
): value is BillingPaymentMethod {
  return billingPaymentMethods.includes(value as BillingPaymentMethod);
}

export function getBillingPaymentMethodLabel(
  paymentMethod: BillingPaymentMethod,
) {
  return paymentMethod === "CREDIT_CARD" ? "Credit Card" : "ACH";
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

export function calculateProcessingFee(
  netAmount: number,
  paymentMethod: BillingPaymentMethod,
): ProcessingFeeBreakdown {
  const normalizedNetAmount = roundMoney(Math.max(0, netAmount));
  const { rate, fixedFee, maxFee } = getConfig(paymentMethod);

  if (normalizedNetAmount <= 0) {
    return {
      paymentMethod,
      netAmount: normalizedNetAmount,
      grossAmount: normalizedNetAmount,
      feeAmount: 0,
    };
  }

  let grossAmount = roundMoney((normalizedNetAmount + fixedFee) / (1 - rate));

  while (true) {
    let feeAmount = roundMoney(grossAmount * rate + fixedFee);
    if (typeof maxFee === "number") {
      feeAmount = Math.min(feeAmount, maxFee);
      feeAmount = roundMoney(feeAmount);
    }

    const actualNet = roundMoney(grossAmount - feeAmount);
    if (actualNet === normalizedNetAmount) {
      return {
        paymentMethod,
        netAmount: normalizedNetAmount,
        grossAmount,
        feeAmount,
      };
    }

    grossAmount = roundMoney(
      grossAmount + (actualNet < normalizedNetAmount ? 0.01 : -0.01),
    );
  }
}
