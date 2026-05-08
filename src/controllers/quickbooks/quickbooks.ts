import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import {
  completeQuickBooksConnection,
  createQuickBooksConnection,
  disconnectQuickBooksConnection,
  getQuickBooksConnectionStatus,
  QuickBooksServiceError,
  syncQuickBooksCustomer,
  syncQuickBooksInvoice,
  syncQuickBooksPayment,
  syncQuickBooksVendorBill,
  syncQuickBooksVendorBillPayment,
  syncQuickBooksVendorForCompany,
} from "../../services/quickbooks/quickbooks.service";

type QuickBooksConnectBody = {
  companyId?: string;
  isSandbox?: boolean;
};

type QuickBooksSyncBody = {
  companyId?: string;
};

function handleQuickBooksError(res: Response, error: unknown, fallbackMessage: string) {
  if (error instanceof QuickBooksServiceError) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  return res.status(500).json({
    message: fallbackMessage,
    error: error instanceof Error ? error.message : error,
  });
}

function resolveString(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return undefined;
}

export async function startQuickBooksConnectionHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const { companyId, isSandbox } = req.body as QuickBooksConnectBody;
    const resolvedCompanyId = resolveString(companyId);

    if (!resolvedCompanyId) {
      return res.status(400).json({ message: "companyId is required." });
    }

    const result = await createQuickBooksConnection({
      companyId: resolvedCompanyId,
      userId: req.user.sub,
      isSandbox,
    });

    return res.status(200).json({
      message: "QuickBooks authorization URL generated successfully.",
      authUrl: result.authUrl,
      company: result.company,
    });
  } catch (error) {
    return handleQuickBooksError(
      res,
      error,
      "Unable to start QuickBooks connection.",
    );
  }
}

export async function completeQuickBooksConnectionHandler(
  req: Request,
  res: Response,
) {
  try {
    const code = resolveString(req.query.code);
    const realmId = resolveString(req.query.realmId);
    const state = resolveString(req.query.state);

    if (!code || !realmId || !state) {
      return res.status(400).json({
        message: "code, realmId and state are required.",
      });
    }

    const connection = await completeQuickBooksConnection({
      code,
      realmId,
      state,
    });

    return res.status(200).json({
      message: "QuickBooks connected successfully.",
      connection,
    });
  } catch (error) {
    return handleQuickBooksError(
      res,
      error,
      "Unable to complete QuickBooks connection.",
    );
  }
}

export async function getQuickBooksConnectionStatusHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const companyId = resolveString(req.params.companyId);
    if (!companyId) {
      return res.status(400).json({ message: "companyId is required." });
    }

    const status = await getQuickBooksConnectionStatus(companyId);

    return res.status(200).json({
      message: "QuickBooks connection fetched successfully.",
      ...status,
    });
  } catch (error) {
    return handleQuickBooksError(
      res,
      error,
      "Unable to fetch QuickBooks connection.",
    );
  }
}

export async function disconnectQuickBooksConnectionHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const companyId = resolveString(req.params.companyId);
    if (!companyId) {
      return res.status(400).json({ message: "companyId is required." });
    }

    const result = await disconnectQuickBooksConnection(companyId);

    return res.status(200).json({
      message: "QuickBooks connection removed successfully.",
      ...result,
    });
  } catch (error) {
    return handleQuickBooksError(
      res,
      error,
      "Unable to disconnect QuickBooks.",
    );
  }
}

export async function syncQuickBooksCustomerHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const practiceId = resolveString(req.params.practiceId);
    if (!practiceId) {
      return res.status(400).json({ message: "practiceId is required." });
    }

    const result = await syncQuickBooksCustomer(practiceId);

    return res.status(200).json({
      message: "QuickBooks customer synced successfully.",
      ...result,
    });
  } catch (error) {
    return handleQuickBooksError(
      res,
      error,
      "Unable to sync QuickBooks customer.",
    );
  }
}

export async function syncQuickBooksVendorHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const vendorId = resolveString(req.params.vendorId);
    const companyId = resolveString(
      (req.body as QuickBooksSyncBody)?.companyId || req.query.companyId,
    );

    if (!vendorId) {
      return res.status(400).json({ message: "vendorId is required." });
    }

    if (!companyId) {
      return res.status(400).json({ message: "companyId is required." });
    }

    const result = await syncQuickBooksVendorForCompany(vendorId, companyId);

    return res.status(200).json({
      message: "QuickBooks vendor synced successfully.",
      ...result,
    });
  } catch (error) {
    return handleQuickBooksError(
      res,
      error,
      "Unable to sync QuickBooks vendor.",
    );
  }
}

export async function syncQuickBooksInvoiceHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const invoiceId = resolveString(req.params.invoiceId);
    if (!invoiceId) {
      return res.status(400).json({ message: "invoiceId is required." });
    }

    const result = await syncQuickBooksInvoice(invoiceId);

    return res.status(200).json({
      message: "QuickBooks invoice synced successfully.",
      ...result,
    });
  } catch (error) {
    return handleQuickBooksError(
      res,
      error,
      "Unable to sync QuickBooks invoice.",
    );
  }
}

export async function syncQuickBooksVendorBillHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const vendorPayableId = resolveString(req.params.vendorPayableId);
    if (!vendorPayableId) {
      return res.status(400).json({ message: "vendorPayableId is required." });
    }

    const result = await syncQuickBooksVendorBill(vendorPayableId);

    return res.status(200).json({
      message: "QuickBooks bill synced successfully.",
      ...result,
    });
  } catch (error) {
    return handleQuickBooksError(
      res,
      error,
      "Unable to sync QuickBooks bill.",
    );
  }
}

export async function syncQuickBooksPaymentHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const paymentId = resolveString(req.params.paymentId);
    if (!paymentId) {
      return res.status(400).json({ message: "paymentId is required." });
    }

    const result = await syncQuickBooksPayment(paymentId);

    return res.status(200).json({
      message: "QuickBooks payment synced successfully.",
      ...result,
    });
  } catch (error) {
    return handleQuickBooksError(
      res,
      error,
      "Unable to sync QuickBooks payment.",
    );
  }
}

export async function syncQuickBooksVendorBillPaymentHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const vendorPayableId = resolveString(req.params.vendorPayableId);
    if (!vendorPayableId) {
      return res.status(400).json({ message: "vendorPayableId is required." });
    }

    const result = await syncQuickBooksVendorBillPayment(vendorPayableId);

    return res.status(200).json({
      message: "QuickBooks bill payment synced successfully.",
      ...result,
    });
  } catch (error) {
    return handleQuickBooksError(
      res,
      error,
      "Unable to sync QuickBooks bill payment.",
    );
  }
}

export async function getExternalSyncLogsHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const { prisma } = require("../../lib/prisma");

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      prisma.externalSyncJob.findMany({
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.externalSyncJob.count(),
    ]);

    return res.status(200).json({
      message: "Sync logs fetched successfully.",
      logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch sync logs.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function retryExternalSyncHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const jobId = resolveString(req.params.jobId);
    if (!jobId) {
      return res.status(400).json({ message: "jobId is required." });
    }

    const { prisma } = require("../../lib/prisma");
    
    const job = await prisma.externalSyncJob.findFirst({
      where: { id: jobId }
    });

    if (!job) {
      return res.status(404).json({ message: "Sync job not found." });
    }

    let result;
    // Map the entityType to the correct sync function
    switch (job.entityType) {
      case "INVOICE":
        result = await syncQuickBooksInvoice(job.entityId);
        break;
      case "VENDOR_BILL":
      case "VENDOR_PAYABLE":
        result = await syncQuickBooksVendorBill(job.entityId);
        break;
      case "PAYMENT":
        result = await syncQuickBooksPayment(job.entityId);
        break;
      case "CUSTOMER":
        result = await syncQuickBooksCustomer(job.entityId);
        break;
      default:
        return res.status(400).json({ message: `Retry not supported for entity type: ${job.entityType}` });
    }

    return res.status(200).json({
      message: "Retry initiated and completed.",
      result,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to retry sync.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
