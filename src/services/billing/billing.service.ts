import {
  ApprovalDecisionStatus,
  ApprovalEntityType,
  BillingRunStatus,
  InvoiceStatus,
  PaymentStatus,
  PricingModel,
  Prisma,
  PrismaClient,
  ReleasePolicy,
  VendorPayableStatus,
} from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import type {
  BillingReadinessIssue,
  BillingReadinessResponse,
  BillingSnapshotInput,
  CreateBillingRunBody,
  RecordPaymentBody,
} from "../../models/billing/billing";

type DbClient = PrismaClient | Prisma.TransactionClient;

type SnapshotMetric = {
  id: string;
  serviceId: string | null;
  metricKey: string;
  metricValue: number | null;
  metricTextValue: string | null;
  metricJsonValue: Prisma.JsonValue | null;
  sourceType: string | null;
  sourceReference: string | null;
};

type MetricResolution = {
  metricKey: string;
  quantity: number;
  snapshots: SnapshotMetric[];
};

type ComputedComponent = {
  componentType: string;
  description?: string;
  quantity?: number;
  rate?: number;
  amount: number;
  metadata?: Prisma.JsonObject;
};

type ComputedPricingResult = {
  amount: number;
  components: ComputedComponent[];
  metricResolutions: MetricResolution[];
  exceptionFlags: string[];
};

type CalculatedRunItem = {
  agreementServiceTermId: string;
  agreementId: string;
  serviceId: string;
  vendorId: string | null;
  clientAmount: number;
  vendorAmount: number | null;
  marginAmount: number | null;
  currency: string;
  components: ComputedComponent[];
  formulaSnapshot: Prisma.InputJsonObject;
  sourceSnapshot: Prisma.InputJsonObject;
  exceptionFlags: string[];
  releasePolicy: ReleasePolicy;
};

type JsonObject = Record<string, unknown>;
type PricingConfigValidationResult = {
  issues: BillingReadinessIssue[];
};

class BillingServiceError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

function asDate(value?: string | Date | null, fieldName = "date") {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BillingServiceError(400, `Invalid ${fieldName}.`);
  }

  return parsed;
}

function asNumber(
  value: unknown,
  fieldName: string,
  options?: { allowUndefined?: boolean; defaultValue?: number },
) {
  if (value === undefined || value === null || value === "") {
    if (options?.allowUndefined) {
      return options.defaultValue ?? 0;
    }

    throw new BillingServiceError(400, `${fieldName} is required.`);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new BillingServiceError(400, `Invalid ${fieldName}.`);
  }

  return parsed;
}

function normalizeCurrency(currency?: string | null) {
  return (currency || "USD").toUpperCase();
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function decimal(value: number) {
  return new Prisma.Decimal(roundMoney(value));
}

function decimalQty(value: number) {
  return new Prisma.Decimal(value.toFixed(4));
}

function toJsonObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as JsonObject;
}

function getStringList(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value === "string" && value.trim()) {
    return [value];
  }

  return [];
}

function getNumberValue(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePercent(rate: number) {
  return rate > 1 ? rate / 100 : rate;
}

function defaultMetricKeys(model: PricingModel) {
  switch (model) {
    case PricingModel.PER_UNIT:
      return ["units", "unit_count"];
    case PricingModel.PER_ENCOUNTER:
      return ["encounters", "encounter_count"];
    case PricingModel.PER_PATIENT:
      return ["patients", "patient_count"];
    case PricingModel.PER_PROVIDER:
      return ["providers", "provider_count"];
    case PricingModel.PER_SITE:
      return ["sites", "site_count"];
    case PricingModel.PERCENT_COLLECTIONS:
      return ["collections", "total_collections"];
    case PricingModel.PERCENT_REVENUE:
      return ["revenue", "total_revenue"];
    case PricingModel.PERCENT_PROFIT:
      return ["profit", "total_profit"];
    default:
      return [];
  }
}

function metricMatchesService(snapshotServiceId: string | null, serviceId: string) {
  return !snapshotServiceId || snapshotServiceId === serviceId;
}

function resolveMetric(
  config: JsonObject,
  snapshots: SnapshotMetric[],
  serviceId: string,
  pricingModel: PricingModel,
): MetricResolution | null {
  const configuredKeys = getStringList(config.metricKeys);
  const candidateKeys =
    configuredKeys.length > 0
      ? configuredKeys
      : [
          ...getStringList(config.metricKey),
          ...defaultMetricKeys(pricingModel),
        ];

  for (const key of candidateKeys) {
    const matchingSnapshots = snapshots.filter(
      (snapshot) =>
        snapshot.metricKey === key && metricMatchesService(snapshot.serviceId, serviceId),
    );

    if (matchingSnapshots.length === 0) {
      continue;
    }

    const quantity = matchingSnapshots.reduce(
      (sum, snapshot) => sum + (snapshot.metricValue ?? 0),
      0,
    );

    return {
      metricKey: key,
      quantity,
      snapshots: matchingSnapshots,
    };
  }

  return null;
}

function mapMetricResolutions(metricResolutions: MetricResolution[]) {
  return metricResolutions.map((resolution) => ({
    metricKey: resolution.metricKey,
    quantity: roundMoney(resolution.quantity),
    snapshotIds: resolution.snapshots.map((snapshot) => snapshot.id),
  }));
}

function toComponent(component: ComputedComponent): Prisma.BillingRunItemComponentCreateWithoutBillingRunItemInput {
  return {
    componentType: component.componentType,
    description: component.description,
    quantity:
      component.quantity !== undefined ? decimalQty(component.quantity) : undefined,
    rate: component.rate !== undefined ? new Prisma.Decimal(component.rate) : undefined,
    amount: decimal(component.amount),
    metadata: component.metadata,
  };
}

function buildTieredAmount(quantity: number, tiersValue: unknown) {
  const tiers = Array.isArray(tiersValue) ? tiersValue : [];
  let remaining = quantity;
  let previousUpperBound = 0;
  const components: ComputedComponent[] = [];
  let amount = 0;

  for (const tier of tiers) {
    if (!tier || typeof tier !== "object") {
      continue;
    }

    const tierConfig = tier as JsonObject;
    const from = getNumberValue(tierConfig.from) ?? previousUpperBound;
    const to = getNumberValue(tierConfig.to ?? tierConfig.upTo);
    const rate = getNumberValue(tierConfig.rate);

    if (rate === null || quantity <= from) {
      previousUpperBound = to ?? previousUpperBound;
      continue;
    }

    const upperBound = to ?? quantity;
    const billableUnits = Math.max(
      0,
      Math.min(quantity, upperBound) - Math.max(previousUpperBound, from),
    );

    if (billableUnits <= 0) {
      previousUpperBound = upperBound;
      continue;
    }

    const tierAmount = roundMoney(billableUnits * rate);
    amount += tierAmount;
    components.push({
      componentType: "TIER",
      description: `Tier ${from} - ${upperBound}`,
      quantity: billableUnits,
      rate,
      amount: tierAmount,
      metadata: {
        from,
        to: upperBound,
      },
    });
    remaining -= billableUnits;
    previousUpperBound = upperBound;
  }

  if (remaining > 0) {
    const lastTier = tiers[tiers.length - 1];
    const fallbackRate =
      lastTier && typeof lastTier === "object"
        ? getNumberValue((lastTier as JsonObject).rate)
        : null;

    if (fallbackRate !== null) {
      const tierAmount = roundMoney(remaining * fallbackRate);
      amount += tierAmount;
      components.push({
        componentType: "TIER",
        description: "Overflow tier",
        quantity: remaining,
        rate: fallbackRate,
        amount: tierAmount,
      });
    }
  }

  return {
    amount: roundMoney(amount),
    components,
  };
}

function computePricingFromModel(params: {
  pricingModel: PricingModel;
  config: JsonObject;
  snapshots: SnapshotMetric[];
  serviceId: string;
  minimumFee?: number | null;
  label?: string;
}): ComputedPricingResult {
  const { pricingModel, config, snapshots, serviceId, minimumFee, label } = params;
  const exceptionFlags: string[] = [];
  const components: ComputedComponent[] = [];
  const metricResolutions: MetricResolution[] = [];
  let amount = 0;

  const componentLabel = label || pricingModel;

  const addMinimumFeeAdjustment = () => {
    if (minimumFee === null || minimumFee === undefined) {
      return;
    }

    if (amount >= minimumFee) {
      return;
    }

    const adjustment = roundMoney(minimumFee - amount);
    components.push({
      componentType: "MINIMUM_FEE_ADJUSTMENT",
      description: "Minimum fee adjustment",
      amount: adjustment,
      metadata: {
        minimumFee,
      },
    });
    amount = roundMoney(minimumFee);
  };

  switch (pricingModel) {
    case PricingModel.FIXED_MONTHLY:
    case PricingModel.FIXED_ONE_TIME:
    case PricingModel.RETAINER: {
      const fixedAmount =
        getNumberValue(config.amount) ?? getNumberValue(config.rate) ?? 0;
      amount = roundMoney(fixedAmount);
      components.push({
        componentType: pricingModel,
        description: componentLabel,
        amount,
      });
      break;
    }

    case PricingModel.PER_UNIT:
    case PricingModel.PER_ENCOUNTER:
    case PricingModel.PER_PATIENT:
    case PricingModel.PER_PROVIDER:
    case PricingModel.PER_SITE: {
      const metric = resolveMetric(config, snapshots, serviceId, pricingModel);
      const rate = getNumberValue(config.rate);

      if (!metric) {
        exceptionFlags.push(`MISSING_METRIC_${pricingModel}`);
        break;
      }

      metricResolutions.push(metric);

      if (rate === null) {
        exceptionFlags.push(`MISSING_RATE_${pricingModel}`);
        break;
      }

      amount = roundMoney(metric.quantity * rate);
      components.push({
        componentType: pricingModel,
        description: `${componentLabel} (${metric.metricKey})`,
        quantity: metric.quantity,
        rate,
        amount,
        metadata: {
          metricKey: metric.metricKey,
        },
      });
      break;
    }

    case PricingModel.PERCENT_COLLECTIONS:
    case PricingModel.PERCENT_REVENUE:
    case PricingModel.PERCENT_PROFIT:
    case PricingModel.SUCCESS_FEE: {
      const percentMetricModel =
        pricingModel === PricingModel.SUCCESS_FEE
          ? PricingModel.PERCENT_COLLECTIONS
          : pricingModel;
      const metric = resolveMetric(config, snapshots, serviceId, percentMetricModel);
      const rate = getNumberValue(config.ratePercent ?? config.rate);

      if (!metric) {
        exceptionFlags.push(`MISSING_METRIC_${pricingModel}`);
        break;
      }

      metricResolutions.push(metric);

      if (rate === null) {
        exceptionFlags.push(`MISSING_RATE_${pricingModel}`);
        break;
      }

      const normalizedRate = normalizePercent(rate);
      amount = roundMoney(metric.quantity * normalizedRate);
      components.push({
        componentType: pricingModel,
        description: `${componentLabel} (${metric.metricKey})`,
        quantity: metric.quantity,
        rate: normalizedRate,
        amount,
        metadata: {
          metricKey: metric.metricKey,
          originalRate: rate,
        },
      });
      break;
    }

    case PricingModel.TIERED_VOLUME: {
      const metric = resolveMetric(config, snapshots, serviceId, pricingModel);

      if (!metric) {
        exceptionFlags.push(`MISSING_METRIC_${pricingModel}`);
        break;
      }

      metricResolutions.push(metric);
      const tieredResult = buildTieredAmount(metric.quantity, config.tiers);
      amount = tieredResult.amount;
      components.push(
        ...tieredResult.components.map((component) => ({
          ...component,
          metadata: {
            ...(component.metadata || {}),
            metricKey: metric.metricKey,
          },
        })),
      );
      break;
    }

    case PricingModel.MONTHLY_MINIMUM: {
      const minimumAmount =
        getNumberValue(config.minimumAmount) ??
        getNumberValue(config.amount) ??
        minimumFee;
      const baseCalculation = toJsonObject(config.baseCalculation);
      let baseAmount = 0;

      if (Object.keys(baseCalculation).length > 0) {
        const nestedPricingModelRaw = baseCalculation.pricingModel;
        if (
          typeof nestedPricingModelRaw === "string" &&
          Object.values(PricingModel).includes(nestedPricingModelRaw as PricingModel)
        ) {
          const nestedResult = computePricingFromModel({
            pricingModel: nestedPricingModelRaw as PricingModel,
            config: baseCalculation,
            snapshots,
            serviceId,
          });
          baseAmount = nestedResult.amount;
          components.push(...nestedResult.components);
          metricResolutions.push(...nestedResult.metricResolutions);
          exceptionFlags.push(...nestedResult.exceptionFlags);
        }
      }

      amount = roundMoney(Math.max(baseAmount, minimumAmount ?? 0));

      if (minimumAmount !== null && minimumAmount !== undefined && amount === minimumAmount) {
        components.push({
          componentType: pricingModel,
          description: componentLabel,
          amount,
          metadata: {
            baseAmount,
            minimumAmount,
          },
        });
      }
      break;
    }

    case PricingModel.HYBRID:
    case PricingModel.MULTI_COMPONENT: {
      const subComponents = Array.isArray(config.components)
        ? config.components
        : [];

      if (subComponents.length === 0) {
        exceptionFlags.push(`MISSING_COMPONENTS_${pricingModel}`);
        break;
      }

      for (const componentValue of subComponents) {
        if (!componentValue || typeof componentValue !== "object") {
          continue;
        }

        const componentConfig = componentValue as JsonObject;
        const nestedModelRaw = componentConfig.pricingModel;

        if (
          typeof nestedModelRaw !== "string" ||
          !Object.values(PricingModel).includes(nestedModelRaw as PricingModel)
        ) {
          exceptionFlags.push("INVALID_COMPONENT_PRICING_MODEL");
          continue;
        }

        const nestedResult = computePricingFromModel({
          pricingModel: nestedModelRaw as PricingModel,
          config: componentConfig,
          snapshots,
          serviceId,
          label:
            typeof componentConfig.label === "string"
              ? componentConfig.label
              : nestedModelRaw,
        });

        amount = roundMoney(amount + nestedResult.amount);
        components.push(...nestedResult.components);
        metricResolutions.push(...nestedResult.metricResolutions);
        exceptionFlags.push(...nestedResult.exceptionFlags);
      }
      break;
    }

    case PricingModel.CUSTOM_ATTACHMENT_DEFINED: {
      exceptionFlags.push("MANUAL_REVIEW_REQUIRED_CUSTOM_PRICING");
      break;
    }

    default: {
      exceptionFlags.push(`UNSUPPORTED_PRICING_MODEL_${pricingModel}`);
      break;
    }
  }

  addMinimumFeeAdjustment();

  return {
    amount: roundMoney(amount),
    components,
    metricResolutions,
    exceptionFlags: [...new Set(exceptionFlags)],
  };
}

function determineReleasePolicy(pricingConfig: JsonObject) {
  const configuredValue = pricingConfig.releasePolicy;

  if (
    typeof configuredValue === "string" &&
    Object.values(ReleasePolicy).includes(configuredValue as ReleasePolicy)
  ) {
    return configuredValue as ReleasePolicy;
  }

  return ReleasePolicy.ON_CLIENT_PAYMENT;
}

function datesOverlap(
  rangeStart: Date | null | undefined,
  rangeEnd: Date | null | undefined,
  periodStart: Date,
  periodEnd: Date,
) {
  const normalizedStart = rangeStart ?? new Date("1900-01-01T00:00:00.000Z");
  const normalizedEnd = rangeEnd ?? new Date("9999-12-31T23:59:59.999Z");
  return normalizedStart <= periodEnd && normalizedEnd >= periodStart;
}

function validatePricingConfigForReadiness(params: {
  pricingModel: PricingModel;
  pricingConfig: JsonObject;
  agreementId: string;
  agreementServiceTermId: string;
}) {
  const { pricingModel, pricingConfig, agreementId, agreementServiceTermId } = params;
  const issues: BillingReadinessIssue[] = [];

  const requireKey = (key: string, message: string) => {
    const value = pricingConfig[key];
    if (value === undefined || value === null || value === "") {
      issues.push({
        code: `MISSING_${key.toUpperCase()}`,
        message,
        severity: "ERROR",
        agreementId,
        agreementServiceTermId,
      });
    }
  };

  switch (pricingModel) {
    case PricingModel.FIXED_MONTHLY:
    case PricingModel.FIXED_ONE_TIME:
    case PricingModel.RETAINER:
      if (
        getNumberValue(pricingConfig.amount) === null &&
        getNumberValue(pricingConfig.rate) === null
      ) {
        issues.push({
          code: "MISSING_FIXED_AMOUNT",
          message: "Fixed-price service term is missing amount or rate.",
          severity: "ERROR",
          agreementId,
          agreementServiceTermId,
        });
      }
      break;
    case PricingModel.PER_UNIT:
    case PricingModel.PER_ENCOUNTER:
    case PricingModel.PER_PATIENT:
    case PricingModel.PER_PROVIDER:
    case PricingModel.PER_SITE:
      requireKey("rate", "Volume-based service term is missing rate.");
      if (
        getStringList(pricingConfig.metricKey).length === 0 &&
        getStringList(pricingConfig.metricKeys).length === 0 &&
        defaultMetricKeys(pricingModel).length === 0
      ) {
        issues.push({
          code: "MISSING_METRIC_KEY",
          message: "Volume-based service term is missing metric key.",
          severity: "ERROR",
          agreementId,
          agreementServiceTermId,
        });
      }
      break;
    case PricingModel.PERCENT_COLLECTIONS:
    case PricingModel.PERCENT_REVENUE:
    case PricingModel.PERCENT_PROFIT:
    case PricingModel.SUCCESS_FEE:
      if (
        getNumberValue(pricingConfig.ratePercent) === null &&
        getNumberValue(pricingConfig.rate) === null
      ) {
        issues.push({
          code: "MISSING_PERCENT_RATE",
          message: "Percentage-based service term is missing ratePercent or rate.",
          severity: "ERROR",
          agreementId,
          agreementServiceTermId,
        });
      }
      break;
    case PricingModel.TIERED_VOLUME:
      if (!Array.isArray(pricingConfig.tiers) || pricingConfig.tiers.length === 0) {
        issues.push({
          code: "MISSING_TIERS",
          message: "Tiered-volume service term is missing tiers.",
          severity: "ERROR",
          agreementId,
          agreementServiceTermId,
        });
      }
      break;
    case PricingModel.HYBRID:
    case PricingModel.MULTI_COMPONENT:
      if (
        !Array.isArray(pricingConfig.components) ||
        pricingConfig.components.length === 0
      ) {
        issues.push({
          code: "MISSING_COMPONENTS",
          message: "Hybrid or multi-component service term is missing components.",
          severity: "ERROR",
          agreementId,
          agreementServiceTermId,
        });
      }
      break;
    case PricingModel.MONTHLY_MINIMUM:
      if (
        getNumberValue(pricingConfig.minimumAmount) === null &&
        getNumberValue(pricingConfig.amount) === null
      ) {
        issues.push({
          code: "MISSING_MINIMUM_AMOUNT",
          message: "Monthly minimum service term is missing minimumAmount or amount.",
          severity: "ERROR",
          agreementId,
          agreementServiceTermId,
        });
      }
      break;
    case PricingModel.CUSTOM_ATTACHMENT_DEFINED:
      issues.push({
        code: "CUSTOM_PRICING_REQUIRES_REVIEW",
        message: "Custom attachment defined pricing requires manual review before billing.",
        severity: "WARNING",
        agreementId,
        agreementServiceTermId,
      });
      break;
    default:
      break;
  }

  return { issues } satisfies PricingConfigValidationResult;
}

async function ensurePracticeExists(db: DbClient, practiceId: string) {
  const practice = await db.practice.findUnique({
    where: { id: practiceId },
  });

  if (!practice) {
    throw new BillingServiceError(404, "Practice not found.");
  }

  return practice;
}

async function createSnapshotsForRun(
  db: DbClient,
  params: {
    billingRunId: string;
    practiceId: string;
    snapshots: BillingSnapshotInput[];
    replaceExisting?: boolean;
  },
) {
  const { billingRunId, practiceId, snapshots, replaceExisting } = params;

  if (replaceExisting) {
    await db.billingInputSnapshot.deleteMany({
      where: { billingRunId },
    });
  }

  if (snapshots.length === 0) {
    return [];
  }

  const serviceIds = [
    ...new Set(
      snapshots
        .map((snapshot) => snapshot.serviceId)
        .filter((serviceId): serviceId is string => Boolean(serviceId)),
    ),
  ];

  if (serviceIds.length > 0) {
    const services = await db.service.findMany({
      where: {
        id: { in: serviceIds },
      },
      select: { id: true },
    });

    if (services.length !== serviceIds.length) {
      throw new BillingServiceError(404, "One or more snapshot services were not found.");
    }
  }

  const createdSnapshots: Awaited<ReturnType<typeof db.billingInputSnapshot.create>>[] = [];
  for (const snapshot of snapshots) {
    if (!snapshot.metricKey) {
      throw new BillingServiceError(400, "snapshot.metricKey is required.");
    }

    createdSnapshots.push(
      await db.billingInputSnapshot.create({
        data: {
          billingRunId,
          practiceId,
          serviceId: snapshot.serviceId || undefined,
          metricKey: snapshot.metricKey,
          metricValue:
            snapshot.metricValue !== undefined && snapshot.metricValue !== null
              ? new Prisma.Decimal(Number(snapshot.metricValue))
              : undefined,
          metricTextValue: snapshot.metricTextValue || undefined,
          metricJsonValue:
            snapshot.metricJsonValue !== undefined
              ? (snapshot.metricJsonValue as Prisma.InputJsonValue)
              : undefined,
          sourceType: snapshot.sourceType || undefined,
          sourceReference: snapshot.sourceReference || undefined,
        },
      }),
    );
  }

  return createdSnapshots;
}

async function getActiveAgreementTermsForRun(db: DbClient, practiceId: string, periodEnd: Date) {
  return db.agreementServiceTerm.findMany({
    where: {
      isActive: true,
      agreement: {
        practiceId,
        status: "ACTIVE",
      },
      OR: [
        { effectiveDate: null },
        { effectiveDate: { lte: periodEnd } },
      ],
      AND: [
        {
          OR: [
            { endDate: null },
            { endDate: { gte: periodEnd } },
          ],
        },
      ],
    },
    include: {
      agreement: true,
      agreementVersion: true,
      service: true,
      vendor: true,
    },
    orderBy: [
      { agreementId: "asc" },
      { priority: "asc" },
      { createdAt: "asc" },
    ],
  });
}

export async function getBillingReadiness(params: {
  practiceId: string;
  periodStart: string | Date;
  periodEnd: string | Date;
}): Promise<BillingReadinessResponse> {
  const practiceId = params.practiceId.trim();
  const periodStart = asDate(params.periodStart, "periodStart");
  const periodEnd = asDate(params.periodEnd, "periodEnd");

  if (!practiceId || !periodStart || !periodEnd) {
    throw new BillingServiceError(
      400,
      "practiceId, periodStart and periodEnd are required.",
    );
  }

  if (periodStart > periodEnd) {
    throw new BillingServiceError(400, "periodStart must be before periodEnd.");
  }

  const practice = await prisma.practice.findUnique({
    where: { id: practiceId },
  });

  if (!practice) {
    throw new BillingServiceError(404, "Practice not found.");
  }

  const activeAgreements = await prisma.agreement.findMany({
    where: {
      practiceId,
      status: "ACTIVE",
    },
    include: {
      versions: {
        orderBy: [{ versionNumber: "desc" }],
      },
      serviceTerms: {
        include: {
          service: true,
          vendor: true,
        },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const issues: BillingReadinessIssue[] = [];

  if (activeAgreements.length === 0) {
    issues.push({
      code: "NO_ACTIVE_AGREEMENT",
      message: "Practice has no active agreement.",
      severity: "ERROR",
    });
  }

  let currentVersionCount = 0;
  let activeServiceTermCount = 0;
  let billableServiceTermCount = 0;

  for (const agreement of activeAgreements) {
    const currentVersions = agreement.versions.filter((version) => version.isCurrent);
    currentVersionCount += currentVersions.length;

    if (agreement.versions.length > 0 && currentVersions.length === 0) {
      issues.push({
        code: "NO_CURRENT_AGREEMENT_VERSION",
        message: "Active agreement has versions but none is marked current.",
        severity: "ERROR",
        agreementId: agreement.id,
      });
    }

    const overlappingCurrentVersions = currentVersions.filter((version) =>
      datesOverlap(version.effectiveDate, version.endDate, periodStart, periodEnd),
    );

    if (currentVersions.length > 0 && overlappingCurrentVersions.length === 0) {
      issues.push({
        code: "CURRENT_VERSION_OUTSIDE_BILLING_PERIOD",
        message:
          "Current agreement version does not overlap the requested billing period.",
        severity: "ERROR",
        agreementId: agreement.id,
      });
    }

    const activeTerms = agreement.serviceTerms.filter((term) => {
      if (!term.isActive) {
        return false;
      }

      return datesOverlap(term.effectiveDate, term.endDate, periodStart, periodEnd);
    });

    activeServiceTermCount += activeTerms.length;

    if (activeTerms.length === 0) {
      issues.push({
        code: "NO_ACTIVE_SERVICE_TERMS",
        message:
          "Active agreement has no active service terms for the requested billing period.",
        severity: "ERROR",
        agreementId: agreement.id,
      });
    }

    for (const term of activeTerms) {
      if (agreement.versions.length > 0 && !term.agreementVersionId) {
        issues.push({
          code: "UNVERSIONED_SERVICE_TERM",
          message:
            "Agreement service term is not linked to an agreement version.",
          severity: "ERROR",
          agreementId: agreement.id,
          agreementServiceTermId: term.id,
        });
      }

      if (
        term.agreementVersionId &&
        !overlappingCurrentVersions.some(
          (version) => version.id === term.agreementVersionId,
        )
      ) {
        issues.push({
          code: "SERVICE_TERM_NOT_ON_CURRENT_VERSION",
          message:
            "Agreement service term is not attached to the current version for the billing period.",
          severity: "ERROR",
          agreementId: agreement.id,
          agreementVersionId: term.agreementVersionId,
          agreementServiceTermId: term.id,
        });
      }

      const pricingConfig = toJsonObject(term.pricingConfig);
      const pricingValidation = validatePricingConfigForReadiness({
        pricingModel: term.pricingModel,
        pricingConfig,
        agreementId: agreement.id,
        agreementServiceTermId: term.id,
      });

      issues.push(...pricingValidation.issues);

      if (!term.service) {
        issues.push({
          code: "MISSING_SERVICE_REFERENCE",
          message: "Agreement service term is missing a valid service reference.",
          severity: "ERROR",
          agreementId: agreement.id,
          agreementServiceTermId: term.id,
        });
      }

      if (
        pricingValidation.issues.every((issue) => issue.severity !== "ERROR") &&
        term.service
      ) {
        billableServiceTermCount += 1;
      }
    }
  }

  const uniqueIssues = issues.filter(
    (issue, index, collection) =>
      collection.findIndex(
        (candidate) =>
          candidate.code === issue.code &&
          candidate.message === issue.message &&
          candidate.agreementId === issue.agreementId &&
          candidate.agreementVersionId === issue.agreementVersionId &&
          candidate.agreementServiceTermId === issue.agreementServiceTermId,
      ) === index,
  );

  return {
    practiceId,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    isReady:
      uniqueIssues.every((issue) => issue.severity !== "ERROR") &&
      activeAgreements.length > 0 &&
      billableServiceTermCount > 0,
    summary: {
      activeAgreementCount: activeAgreements.length,
      currentVersionCount,
      activeServiceTermCount,
      billableServiceTermCount,
    },
    issues: uniqueIssues,
  };
}

function toSnapshotMetric(
  snapshot: {
    id: string;
    serviceId: string | null;
    metricKey: string;
    metricValue: Prisma.Decimal | null;
    metricTextValue: string | null;
    metricJsonValue: Prisma.JsonValue | null;
    sourceType: string | null;
    sourceReference: string | null;
  },
): SnapshotMetric {
  return {
    id: snapshot.id,
    serviceId: snapshot.serviceId,
    metricKey: snapshot.metricKey,
    metricValue: snapshot.metricValue ? Number(snapshot.metricValue) : null,
    metricTextValue: snapshot.metricTextValue,
    metricJsonValue: snapshot.metricJsonValue,
    sourceType: snapshot.sourceType,
    sourceReference: snapshot.sourceReference,
  };
}

function computeVendorAmount(
  pricingConfig: JsonObject,
  snapshots: SnapshotMetric[],
  serviceId: string,
  clientAmount: number,
) {
  const vendorPricing = toJsonObject(pricingConfig.vendorPricing);
  if (Object.keys(vendorPricing).length > 0) {
    const nestedModelRaw = vendorPricing.pricingModel ?? pricingConfig.pricingModel;
    if (
      typeof nestedModelRaw === "string" &&
      Object.values(PricingModel).includes(nestedModelRaw as PricingModel)
    ) {
      return computePricingFromModel({
        pricingModel: nestedModelRaw as PricingModel,
        config: vendorPricing,
        snapshots,
        serviceId,
      }).amount;
    }
  }

  const vendorFlatAmount = getNumberValue(pricingConfig.vendorFlatAmount);
  if (vendorFlatAmount !== null) {
    return roundMoney(vendorFlatAmount);
  }

  const vendorPercentOfClient = getNumberValue(pricingConfig.vendorPercentOfClient);
  if (vendorPercentOfClient !== null) {
    return roundMoney(clientAmount * normalizePercent(vendorPercentOfClient));
  }

  const vendorRate = getNumberValue(pricingConfig.vendorRate);
  if (vendorRate !== null) {
    const metric = resolveMetric(pricingConfig, snapshots, serviceId, PricingModel.PER_UNIT);
    if (metric) {
      return roundMoney(metric.quantity * vendorRate);
    }
  }

  return null;
}

async function setVendorPayablesReleasedForInvoice(db: DbClient, invoiceId: string) {
  await db.vendorPayable.updateMany({
    where: {
      invoiceId,
      releasePolicy: ReleasePolicy.ON_CLIENT_PAYMENT,
      status: {
        in: [
          VendorPayableStatus.CALCULATED,
          VendorPayableStatus.APPROVED,
          VendorPayableStatus.ON_HOLD,
        ],
      },
    },
    data: {
      status: VendorPayableStatus.RELEASED,
      releasedAt: new Date(),
    },
  });
}

async function refreshInvoiceStatus(db: DbClient, invoiceId: string) {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      paymentAllocations: true,
    },
  });

  if (!invoice) {
    throw new BillingServiceError(404, "Invoice not found.");
  }

  const paidAmount = invoice.paymentAllocations.reduce(
    (sum, allocation) => sum + Number(allocation.allocatedAmount),
    0,
  );
  const totalAmount = Number(invoice.totalAmount);

  let nextStatus = invoice.status;
  if (paidAmount <= 0) {
    return invoice;
  }

  if (paidAmount + 0.0001 >= totalAmount) {
    nextStatus = InvoiceStatus.PAID;
  } else {
    nextStatus = InvoiceStatus.PARTIALLY_PAID;
  }

  const updatedInvoice =
    nextStatus === invoice.status
      ? invoice
      : await db.invoice.update({
          where: { id: invoiceId },
          data: { status: nextStatus },
          include: {
            paymentAllocations: true,
          },
        });

  await setVendorPayablesReleasedForInvoice(db, invoiceId);

  return updatedInvoice;
}

function generateDocumentNumber(prefix: "INV" | "PAY") {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${stamp}-${suffix}`;
}

export async function createBillingRun(body: CreateBillingRunBody) {
  const practiceId = body.practiceId?.trim();
  const periodStart = asDate(body.periodStart, "periodStart");
  const periodEnd = asDate(body.periodEnd, "periodEnd");

  if (!practiceId || !periodStart || !periodEnd) {
    throw new BillingServiceError(
      400,
      "practiceId, periodStart and periodEnd are required.",
    );
  }

  if (periodStart > periodEnd) {
    throw new BillingServiceError(400, "periodStart must be before periodEnd.");
  }

  const readiness = await getBillingReadiness({
    practiceId,
    periodStart,
    periodEnd,
  });

  if (!readiness.isReady) {
    const blockingIssues = readiness.issues
      .filter((issue) => issue.severity === "ERROR")
      .map((issue) => issue.message);
    throw new BillingServiceError(
      400,
      `Practice is not billing-ready. ${blockingIssues.join(" ")}`,
    );
  }

  return prisma.$transaction(async (tx) => {
    await ensurePracticeExists(tx, practiceId);

    const billingRun = await tx.billingRun.create({
      data: {
        practiceId,
        periodStart,
        periodEnd,
        status: BillingRunStatus.PENDING,
        notes: body.notes || undefined,
      },
    });

    if (Array.isArray(body.snapshots) && body.snapshots.length > 0) {
      await createSnapshotsForRun(tx, {
        billingRunId: billingRun.id,
        practiceId,
        snapshots: body.snapshots,
      });
    }

    if (body.autoCalculate) {
      await calculateBillingRun(billingRun.id, tx);
    }

    return tx.billingRun.findUnique({
      where: { id: billingRun.id },
      include: {
        inputSnapshots: true,
        items: {
          include: {
            components: true,
          },
        },
      },
    });
  });
}

export async function upsertBillingRunSnapshots(
  billingRunId: string,
  snapshots: BillingSnapshotInput[],
  replaceExisting = false,
) {
  return prisma.$transaction(async (tx) => {
    const run = await tx.billingRun.findUnique({
      where: { id: billingRunId },
    });

    if (!run) {
      throw new BillingServiceError(404, "Billing run not found.");
    }

    if (
      run.status === BillingRunStatus.POSTED ||
      run.status === BillingRunStatus.CLOSED
    ) {
      throw new BillingServiceError(
        400,
        "Snapshots cannot be modified after the billing run is posted or closed.",
      );
    }

    const createdSnapshots = await createSnapshotsForRun(tx, {
      billingRunId,
      practiceId: run.practiceId,
      snapshots,
      replaceExisting,
    });

    return {
      runId: billingRunId,
      snapshotCount: createdSnapshots.length,
    };
  });
}

export async function listBillingRuns(params: {
  page?: number;
  limit?: number;
  practiceId?: string;
  status?: BillingRunStatus;
}) {
  const page = params.page && params.page > 0 ? params.page : 1;
  const limit = params.limit && params.limit > 0 ? params.limit : 10;
  const skip = (page - 1) * limit;

  const where: Prisma.BillingRunWhereInput = {};
  if (params.practiceId) {
    where.practiceId = params.practiceId;
  }
  if (params.status) {
    where.status = params.status;
  }

  const [runs, total] = await Promise.all([
    prisma.billingRun.findMany({
      where,
      include: {
        practice: true,
        approvedByUser: true,
        _count: {
          select: {
            inputSnapshots: true,
            items: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.billingRun.count({ where }),
  ]);

  return {
    runs,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getBillingRun(billingRunId: string) {
  const run = await prisma.billingRun.findUnique({
    where: { id: billingRunId },
    include: {
      practice: {
        include: {
          billToTaxId: true,
        },
      },
      approvedByUser: true,
      inputSnapshots: {
        include: {
          service: true,
        },
        orderBy: [{ serviceId: "asc" }, { metricKey: "asc" }],
      },
      items: {
        include: {
          service: true,
          vendor: true,
          agreementServiceTerm: {
            include: {
              agreement: true,
              agreementVersion: true,
            },
          },
          components: true,
          invoiceLineItems: {
            include: {
              invoice: true,
            },
          },
          vendorPayableLineItems: {
            include: {
              vendorPayable: true,
            },
          },
        },
      },
      vendorPayables: {
        include: {
          vendor: true,
          lineItems: true,
          invoice: true,
        },
      },
    },
  });

  if (!run) {
    throw new BillingServiceError(404, "Billing run not found.");
  }

  return run;
}

export async function calculateBillingRun(billingRunId: string, tx?: DbClient) {
  const db = tx ?? prisma;

  const run = await db.billingRun.findUnique({
    where: { id: billingRunId },
    include: {
      inputSnapshots: true,
    },
  });

  if (!run) {
    throw new BillingServiceError(404, "Billing run not found.");
  }

  if (
    run.status === BillingRunStatus.POSTED ||
    run.status === BillingRunStatus.CLOSED
  ) {
    throw new BillingServiceError(
      400,
      "Billing run cannot be recalculated after posting or closure.",
    );
  }

  const runTerms = await getActiveAgreementTermsForRun(db, run.practiceId, run.periodEnd);
  const snapshots = run.inputSnapshots.map(toSnapshotMetric);

  const oldItemIds = (
    await db.billingRunItem.findMany({
      where: { billingRunId },
      select: { id: true },
    })
  ).map((item) => item.id);

  if (oldItemIds.length > 0) {
    await db.exceptionEvent.deleteMany({
      where: {
        entityType: ApprovalEntityType.BILLING_RUN_ITEM,
        entityId: { in: oldItemIds },
      },
    });
  }

  await db.exceptionEvent.deleteMany({
    where: {
      entityType: ApprovalEntityType.BILLING_RUN,
      entityId: billingRunId,
    },
  });

  await db.billingRunItem.deleteMany({
    where: { billingRunId },
  });

  const calculatedItems: CalculatedRunItem[] = runTerms.map((term) => {
    const pricingConfig = toJsonObject(term.pricingConfig);
    const clientResult = computePricingFromModel({
      pricingModel: term.pricingModel,
      config: pricingConfig,
      snapshots,
      serviceId: term.serviceId,
      minimumFee: term.minimumFee ? Number(term.minimumFee) : null,
      label: term.service.name,
    });

    const clientAmount = roundMoney(clientResult.amount);
    const vendorAmount =
      term.vendorId !== null
        ? computeVendorAmount(pricingConfig, snapshots, term.serviceId, clientAmount)
        : null;
    const marginAmount =
      vendorAmount !== null ? roundMoney(clientAmount - vendorAmount) : null;
    const releasePolicy = determineReleasePolicy(pricingConfig);
    const sourceSnapshots = snapshots.filter(
      (snapshot) =>
        clientResult.metricResolutions.some((resolution) =>
          resolution.snapshots.some((item) => item.id === snapshot.id),
        ),
    );
    const formulaSnapshot: Prisma.InputJsonObject = {
      pricingModel: term.pricingModel,
      pricingConfig: pricingConfig as Prisma.InputJsonValue,
      minimumFee: term.minimumFee ? Number(term.minimumFee) : null,
      releasePolicy,
      agreementVersionId: term.agreementVersionId,
    };
    const sourceSnapshot: Prisma.InputJsonObject = {
      metricResolutions: mapMetricResolutions(
        clientResult.metricResolutions,
      ) as Prisma.InputJsonValue,
      snapshotIds: sourceSnapshots.map((snapshot) => snapshot.id) as Prisma.InputJsonValue,
    };

    return {
      agreementServiceTermId: term.id,
      agreementId: term.agreementId,
      serviceId: term.serviceId,
      vendorId: term.vendorId,
      clientAmount,
      vendorAmount,
      marginAmount,
      currency: normalizeCurrency(term.currency),
      components:
        clientResult.components.length > 0
          ? clientResult.components
          : [
              {
                componentType: "ZERO_AMOUNT",
                description: `${term.service.name} calculation placeholder`,
                amount: 0,
              },
            ],
      formulaSnapshot,
      sourceSnapshot,
      exceptionFlags: clientResult.exceptionFlags,
      releasePolicy,
    };
  });

  const createdItems = [];
  for (const item of calculatedItems) {
    const createdItem = await db.billingRunItem.create({
      data: {
        billingRunId,
        practiceId: run.practiceId,
        serviceId: item.serviceId,
        vendorId: item.vendorId || undefined,
        agreementServiceTermId: item.agreementServiceTermId,
        clientAmount: decimal(item.clientAmount),
        vendorAmount:
          item.vendorAmount !== null ? decimal(item.vendorAmount) : undefined,
        marginAmount:
          item.marginAmount !== null ? decimal(item.marginAmount) : undefined,
        currency: item.currency,
        formulaSnapshot: item.formulaSnapshot as Prisma.InputJsonValue,
        sourceSnapshot: item.sourceSnapshot as Prisma.InputJsonValue,
        exceptionFlags: item.exceptionFlags,
        components: {
          create: item.components.map(toComponent),
        },
      },
      include: {
        components: true,
      },
    });

    createdItems.push(createdItem);

    if (item.exceptionFlags.length > 0) {
      await db.exceptionEvent.create({
        data: {
          entityType: ApprovalEntityType.BILLING_RUN_ITEM,
          entityId: createdItem.id,
          code: item.exceptionFlags.join(","),
          message: `Billing run item requires review for service ${item.serviceId}.`,
          severity: "WARNING",
          metadata: {
            flags: item.exceptionFlags,
            agreementServiceTermId: item.agreementServiceTermId,
          },
        },
      });
    }
  }

  const hasExceptions = calculatedItems.some((item) => item.exceptionFlags.length > 0);

  const nextStatus = hasExceptions
    ? BillingRunStatus.REVIEW_REQUIRED
    : BillingRunStatus.CALCULATED;

  const updatedRun = await db.billingRun.update({
    where: { id: billingRunId },
    data: {
      status: nextStatus,
    },
    include: {
      inputSnapshots: true,
      items: {
        include: {
          components: true,
          agreementServiceTerm: {
            include: {
              agreement: true,
              agreementVersion: true,
            },
          },
          service: true,
          vendor: true,
        },
      },
    },
  });

  if (hasExceptions) {
    await db.exceptionEvent.create({
      data: {
        entityType: ApprovalEntityType.BILLING_RUN,
        entityId: billingRunId,
        code: "RUN_REVIEW_REQUIRED",
        message: "Billing run requires review before approval.",
        severity: "WARNING",
      },
    });
  }

  return updatedRun;
}

export async function approveBillingRun(billingRunId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const run = await tx.billingRun.findUnique({
      where: { id: billingRunId },
      include: {
        items: true,
      },
    });

    if (!run) {
      throw new BillingServiceError(404, "Billing run not found.");
    }

    if (
      run.status !== BillingRunStatus.CALCULATED &&
      run.status !== BillingRunStatus.REVIEW_REQUIRED
    ) {
      throw new BillingServiceError(
        400,
        "Only calculated billing runs can be approved.",
      );
    }

    if (run.items.length === 0) {
      throw new BillingServiceError(400, "Billing run has no calculated items.");
    }

    const updatedRun = await tx.billingRun.update({
      where: { id: billingRunId },
      data: {
        status: BillingRunStatus.APPROVED,
        approvedByUserId: userId,
        approvedAt: new Date(),
      },
    });

    await tx.approvalDecision.create({
      data: {
        entityType: ApprovalEntityType.BILLING_RUN,
        entityId: billingRunId,
        decision: ApprovalDecisionStatus.APPROVED,
        decidedByUserId: userId,
        decidedAt: new Date(),
        note: "Billing run approved.",
      },
    });

    return updatedRun;
  });
}

export async function postBillingRun(billingRunId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const run = await tx.billingRun.findUnique({
      where: { id: billingRunId },
      include: {
        practice: true,
        items: {
          include: {
            service: true,
            agreementServiceTerm: {
              include: {
                agreement: true,
                agreementVersion: true,
              },
            },
            components: true,
            invoiceLineItems: {
              select: { id: true },
            },
          },
        },
      },
    });

    if (!run) {
      throw new BillingServiceError(404, "Billing run not found.");
    }

    if (run.status !== BillingRunStatus.APPROVED) {
      throw new BillingServiceError(400, "Billing run must be approved before posting.");
    }

    if (run.items.some((item) => item.invoiceLineItems.length > 0)) {
      throw new BillingServiceError(400, "Billing run has already been posted.");
    }

    const invoiceGroups = new Map<
      string,
      {
        agreementId: string | null;
        items: typeof run.items;
      }
    >();

    for (const item of run.items) {
      const agreementId = item.agreementServiceTerm?.agreementId || null;
      const groupKey = agreementId || "NO_AGREEMENT";
      const existingGroup = invoiceGroups.get(groupKey);
      if (existingGroup) {
        existingGroup.items.push(item);
      } else {
        invoiceGroups.set(groupKey, {
          agreementId,
          items: [item],
        });
      }
    }

    const createdInvoices = [];
    const createdVendorPayables = [];

    for (const group of invoiceGroups.values()) {
      const subtotalAmount = roundMoney(
        group.items.reduce((sum, item) => sum + Number(item.clientAmount), 0),
      );
      const invoice = await tx.invoice.create({
        data: {
          practiceId: run.practiceId,
          agreementId: group.agreementId || undefined,
          totalAmount: decimal(subtotalAmount),
          subtotalAmount: decimal(subtotalAmount),
          taxAmount: decimal(0),
          discountAmount: decimal(0),
          status: InvoiceStatus.DRAFT,
          invoiceNumber: generateDocumentNumber("INV"),
          currency: normalizeCurrency(run.practice.defaultCurrency),
          billingPeriodStart: run.periodStart,
          billingPeriodEnd: run.periodEnd,
          dueDate: new Date(run.periodEnd.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      for (const item of group.items) {
        const defaultComponent =
          item.components.length > 0
            ? item.components
            : [
                {
                  id: "",
                  componentType: "DEFAULT",
                  description: item.service.name,
                  quantity: new Prisma.Decimal(1),
                  rate: new Prisma.Decimal(Number(item.clientAmount)),
                  amount: item.clientAmount,
                  metadata: null,
                  billingRunItemId: item.id,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              ];

        for (const component of defaultComponent) {
          const quantity = component.quantity ? Number(component.quantity) : 1;
          const amount = Number(component.amount);
          const unitPrice =
            quantity !== 0 ? roundMoney(amount / quantity) : amount;

          await tx.invoiceLineItem.create({
            data: {
              invoiceId: invoice.id,
              serviceId: item.serviceId,
              quantity: Math.max(1, Math.round(quantity)),
              unitPrice: decimal(unitPrice),
              totalPrice: decimal(amount),
              description: component.description || item.service.name,
              billingRunItemId: item.id,
              billingRunItemComponentId: component.id || undefined,
              agreementServiceTermId: item.agreementServiceTermId || undefined,
              billingPeriodStart: run.periodStart,
              billingPeriodEnd: run.periodEnd,
            },
          });
        }
      }

      createdInvoices.push(invoice);

      const vendorGroups = new Map<
        string,
        {
          vendorId: string;
          releasePolicy: ReleasePolicy;
          items: typeof group.items;
        }
      >();

      for (const item of group.items) {
        if (!item.vendorId || item.vendorAmount === null) {
          continue;
        }

        const releasePolicyRaw =
          item.formulaSnapshot &&
          typeof item.formulaSnapshot === "object" &&
          "releasePolicy" in item.formulaSnapshot
            ? (item.formulaSnapshot.releasePolicy as ReleasePolicy)
            : ReleasePolicy.ON_CLIENT_PAYMENT;

        const existingVendorGroup = vendorGroups.get(item.vendorId);
        if (existingVendorGroup) {
          existingVendorGroup.items.push(item);
        } else {
          vendorGroups.set(item.vendorId, {
            vendorId: item.vendorId,
            releasePolicy:
              Object.values(ReleasePolicy).includes(releasePolicyRaw)
                ? releasePolicyRaw
                : ReleasePolicy.ON_CLIENT_PAYMENT,
            items: [item],
          });
        }
      }

      for (const vendorGroup of vendorGroups.values()) {
        const totalAmount = roundMoney(
          vendorGroup.items.reduce(
            (sum, item) => sum + Number(item.vendorAmount || 0),
            0,
          ),
        );

        let status: VendorPayableStatus = VendorPayableStatus.APPROVED;
        let releasedAt: Date | null = null;

        if (vendorGroup.releasePolicy === ReleasePolicy.ON_INVOICE_APPROVAL) {
          status = VendorPayableStatus.RELEASED;
          releasedAt = new Date();
        }

        const payable = await tx.vendorPayable.create({
          data: {
            practiceId: run.practiceId,
            vendorId: vendorGroup.vendorId,
            invoiceId: invoice.id,
            billingRunId: run.id,
            payableNumber: generateDocumentNumber("PAY"),
            totalAmount: decimal(totalAmount),
            currency: invoice.currency,
            status,
            releasePolicy: vendorGroup.releasePolicy,
            releasedAt: releasedAt || undefined,
          },
        });

        for (const item of vendorGroup.items) {
          const totalCost = roundMoney(Number(item.vendorAmount || 0));
          await tx.vendorPayableLineItem.create({
            data: {
              vendorPayableId: payable.id,
              serviceId: item.serviceId,
              description: item.service.name,
              quantity: decimalQty(1),
              unitCost: new Prisma.Decimal(totalCost.toFixed(4)),
              totalCost: decimal(totalCost),
              billingRunItemId: item.id,
            },
          });
        }

        createdVendorPayables.push(payable);
      }
    }

    const updatedRun = await tx.billingRun.update({
      where: { id: billingRunId },
      data: {
        status: BillingRunStatus.POSTED,
        notes: run.notes
          ? `${run.notes}\nPosted by ${userId} on ${new Date().toISOString()}`
          : `Posted by ${userId} on ${new Date().toISOString()}`,
      },
    });

    await tx.approvalDecision.create({
      data: {
        entityType: ApprovalEntityType.CLIENT_INVOICE,
        entityId: billingRunId,
        decision: ApprovalDecisionStatus.APPROVED,
        decidedByUserId: userId,
        decidedAt: new Date(),
        note: "Billing run posted to invoice(s).",
      },
    });

    return {
      billingRun: updatedRun,
      invoices: createdInvoices,
      vendorPayables: createdVendorPayables,
    };
  });
}

export async function recordManualPayment(body: RecordPaymentBody) {
  const practiceId = body.practiceId?.trim();
  const amount = asNumber(body.amount, "amount");
  const paymentDate = asDate(body.paymentDate || undefined, "paymentDate");
  const allocations = Array.isArray(body.allocations) ? body.allocations : [];

  if (!practiceId) {
    throw new BillingServiceError(400, "practiceId is required.");
  }

  return prisma.$transaction(async (tx) => {
    await ensurePracticeExists(tx, practiceId);

    const allocationRequests = allocations.map((allocation) => ({
      invoiceId: allocation.invoiceId,
      allocatedAmount: asNumber(allocation.allocatedAmount, "allocatedAmount"),
    }));

    const totalAllocated = roundMoney(
      allocationRequests.reduce((sum, allocation) => sum + allocation.allocatedAmount, 0),
    );

    if (totalAllocated - amount > 0.0001) {
      throw new BillingServiceError(
        400,
        "Allocated amount cannot exceed the recorded payment amount.",
      );
    }

    const invoiceIds = [...new Set(allocationRequests.map((allocation) => allocation.invoiceId))];
    const invoices = await tx.invoice.findMany({
      where: {
        id: { in: invoiceIds },
        practiceId,
      },
      include: {
        paymentAllocations: true,
      },
    });

    if (invoices.length !== invoiceIds.length) {
      throw new BillingServiceError(
        404,
        "One or more invoices were not found for the provided practice.",
      );
    }

    for (const allocation of allocationRequests) {
      const invoice = invoices.find((item) => item.id === allocation.invoiceId);

      if (!invoice) {
        continue;
      }

      const alreadyAllocated = invoice.paymentAllocations.reduce(
        (sum, item) => sum + Number(item.allocatedAmount),
        0,
      );
      const remainingBalance = roundMoney(Number(invoice.totalAmount) - alreadyAllocated);

      if (allocation.allocatedAmount - remainingBalance > 0.0001) {
        throw new BillingServiceError(
          400,
          `Allocation exceeds remaining balance for invoice ${invoice.id}.`,
        );
      }
    }

    const payment = await tx.payment.create({
      data: {
        practiceId,
        amount: decimal(amount),
        currency: normalizeCurrency(body.currency),
        paymentDate: paymentDate || new Date(),
        paymentMethod: body.paymentMethod || "manual",
        externalReference: body.externalReference || undefined,
        status:
          allocationRequests.length === 0
            ? PaymentStatus.SUCCEEDED
            : totalAllocated + 0.0001 >= amount
              ? PaymentStatus.ALLOCATED
              : PaymentStatus.PARTIALLY_ALLOCATED,
      },
    });

    const createdAllocations = [];
    for (const allocation of allocationRequests) {
      createdAllocations.push(
        await tx.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            invoiceId: allocation.invoiceId,
            allocatedAmount: decimal(allocation.allocatedAmount),
          },
        }),
      );
      await refreshInvoiceStatus(tx, allocation.invoiceId);
    }

    return {
      payment,
      allocations: createdAllocations,
    };
  });
}

export { BillingServiceError };
