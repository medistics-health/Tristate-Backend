import {
  BillingRunStatus,
} from "../../../generated/prisma/client";
import type { Response } from "express";
import type {
  CreateBillingRunBody,
  RecordPaymentBody,
  UpsertBillingSnapshotsBody,
} from "../../models/billing/billing";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import {
  approveBillingRun,
  BillingServiceError,
  calculateBillingRun,
  createBillingRun,
  getBillingReadiness,
  getBillingRun,
  listBillingRuns,
  postBillingRun,
  recordManualPayment,
  upsertBillingRunSnapshots,
} from "../../services/billing/billing.service";

function parseBillingRunStatus(value?: string) {
  if (!value) {
    return undefined;
  }

  return Object.values(BillingRunStatus).includes(value as BillingRunStatus)
    ? (value as BillingRunStatus)
    : null;
}

function handleBillingError(res: Response, error: unknown, fallbackMessage: string) {
  if (error instanceof BillingServiceError) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  return res.status(500).json({
    message: fallbackMessage,
    error: error instanceof Error ? error.message : error,
  });
}

export async function createBillingRunHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const billingRun = await createBillingRun(req.body as CreateBillingRunBody);

    return res.status(201).json({
      message: "Billing run created successfully.",
      billingRun,
    });
  } catch (error) {
    return handleBillingError(res, error, "Unable to create billing run.");
  }
}

export async function getBillingReadinessHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const practiceId = Array.isArray(req.params.practiceId)
      ? req.params.practiceId[0]
      : req.params.practiceId;
    const rawPeriodStart = Array.isArray(req.query.periodStart)
      ? req.query.periodStart[0]
      : req.query.periodStart;
    const rawPeriodEnd = Array.isArray(req.query.periodEnd)
      ? req.query.periodEnd[0]
      : req.query.periodEnd;
    const periodStart =
      typeof rawPeriodStart === "string" ? rawPeriodStart : undefined;
    const periodEnd = typeof rawPeriodEnd === "string" ? rawPeriodEnd : undefined;

    if (!practiceId || !periodStart || !periodEnd) {
      return res.status(400).json({
        message: "practiceId, periodStart and periodEnd are required.",
      });
    }

    const readiness = await getBillingReadiness({
      practiceId,
      periodStart,
      periodEnd,
    });

    return res.status(200).json({
      message: "Billing readiness fetched successfully.",
      readiness,
    });
  } catch (error) {
    return handleBillingError(res, error, "Unable to fetch billing readiness.");
  }
}

export async function listBillingRunsHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const parsedStatus = parseBillingRunStatus(req.query.status as string | undefined);
    if ((req.query.status as string | undefined) && parsedStatus === null) {
      return res.status(400).json({
        message: "Invalid billing run status.",
        allowedStatuses: Object.values(BillingRunStatus),
      });
    }

    const response = await listBillingRuns({
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 10,
      practiceId: (req.query.practiceId as string) || undefined,
      status: parsedStatus || undefined,
    });

    return res.status(200).json({
      message: "Billing runs fetched successfully.",
      ...response,
    });
  } catch (error) {
    return handleBillingError(res, error, "Unable to fetch billing runs.");
  }
}

export async function getBillingRunHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const billingRunId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!billingRunId) {
      return res.status(400).json({ message: "Billing run id is required." });
    }

    const billingRun = await getBillingRun(billingRunId);

    return res.status(200).json({
      message: "Billing run fetched successfully.",
      billingRun,
    });
  } catch (error) {
    return handleBillingError(res, error, "Unable to fetch billing run.");
  }
}

export async function addBillingRunSnapshotsHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const billingRunId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!billingRunId) {
      return res.status(400).json({ message: "Billing run id is required." });
    }

    const body = req.body as UpsertBillingSnapshotsBody;
    const snapshots = Array.isArray(body.snapshots) ? body.snapshots : [];

    const result = await upsertBillingRunSnapshots(
      billingRunId,
      snapshots,
      Boolean(body.replaceExisting),
    );

    return res.status(200).json({
      message: "Billing run snapshots saved successfully.",
      ...result,
    });
  } catch (error) {
    return handleBillingError(res, error, "Unable to save billing run snapshots.");
  }
}

export async function calculateBillingRunHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const billingRunId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!billingRunId) {
      return res.status(400).json({ message: "Billing run id is required." });
    }

    const billingRun = await calculateBillingRun(billingRunId);

    return res.status(200).json({
      message: "Billing run calculated successfully.",
      billingRun,
    });
  } catch (error) {
    return handleBillingError(res, error, "Unable to calculate billing run.");
  }
}

export async function approveBillingRunHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const billingRunId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!billingRunId) {
      return res.status(400).json({ message: "Billing run id is required." });
    }

    const billingRun = await approveBillingRun(billingRunId, req.user.sub);

    return res.status(200).json({
      message: "Billing run approved successfully.",
      billingRun,
    });
  } catch (error) {
    return handleBillingError(res, error, "Unable to approve billing run.");
  }
}

export async function postBillingRunHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const billingRunId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!billingRunId) {
      return res.status(400).json({ message: "Billing run id is required." });
    }

    const result = await postBillingRun(billingRunId, req.user.sub);

    return res.status(200).json({
      message: "Billing run posted successfully.",
      ...result,
    });
  } catch (error) {
    return handleBillingError(res, error, "Unable to post billing run.");
  }
}

export async function recordManualPaymentHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const result = await recordManualPayment(req.body as RecordPaymentBody);

    return res.status(201).json({
      message: "Payment recorded successfully.",
      ...result,
    });
  } catch (error) {
    return handleBillingError(res, error, "Unable to record payment.");
  }
}
