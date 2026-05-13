import { PaymentStatus } from "../../../generated/prisma/client";
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
import { prisma } from "../../lib/prisma";

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
      isSandbox: isSandbox === true || isSandbox === undefined, // Default to true if not specified
    });

    console.log("Generated QuickBooks Auth URL:", result.authUrl);

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
    const error = resolveString(req.query.error);
    const errorDescription = resolveString(req.query.error_description);

    if (error) {
      throw new Error(`${error}: ${errorDescription || "No description provided"}`);
    }

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

    return res.status(200).send(`
      <html>
        <head>
          <title>QuickBooks Connected</title>
          <style>
            body { font-family: -apple-system, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; }
            .card { background: white; padding: 2rem; border-radius: 1rem; shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); text-align: center; }
            h1 { color: #1e293b; margin-bottom: 0.5rem; }
            p { color: #64748b; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Connected!</h1>
            <p>Connection successful. Closing window...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage('qb-connected', '*');
              setTimeout(() => window.close(), 1000);
            } else {
              window.location.href = '/settings?tab=integrations';
            }
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("QuickBooks Connection Error:", error);
    return res.status(500).send(`
      <html>
        <head>
          <title>Connection Failed</title>
          <style>
            body { font-family: -apple-system, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #fff1f2; }
            .card { background: white; padding: 2.5rem; border-radius: 1.5rem; box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1); text-align: center; max-width: 400px; border: 1px solid #fecaca; }
            h1 { color: #991b1b; margin-bottom: 0.5rem; font-size: 1.5rem; }
            p { color: #7f1d1d; font-size: 0.875rem; line-height: 1.5; margin-bottom: 1.5rem; }
            code { background: #fef2f2; padding: 0.5rem; border-radius: 0.5rem; color: #b91c1c; font-family: monospace; display: block; margin-bottom: 1.5rem; word-break: break-all; }
            button { background: #1e293b; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.75rem; font-weight: bold; cursor: pointer; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Connection Failed</h1>
            <p>We couldn't link your QuickBooks account. This usually happens if the Redirect URI doesn't match or you're using a Production account instead of a Sandbox one.</p>
            <code>Error: ${error instanceof Error ? error.message : "Handshake failed"}</code>
            <button onclick="window.close()">Close & Try Again</button>
          </div>
        </body>
      </html>
    `);
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

export async function quickSyncInvoicePaymentHandler(
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

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        paymentAllocations: true,
        practice: true,
      },
    });

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found." });
    }

    if (invoice.status !== "PAID") {
       return res.status(400).json({ message: "Invoice must be in PAID status to quick sync payment." });
    }

    let paymentId: string;

    if (invoice.paymentAllocations && invoice.paymentAllocations.length > 0) {
      paymentId = invoice.paymentAllocations[0].paymentId;
    } else {
      // Create a dummy payment record in TriState to represent this payment
      const payment = await prisma.payment.create({
        data: {
          practiceId: invoice.practiceId,
          amount: invoice.totalAmount,
          paymentDate: new Date(),
          status: PaymentStatus.SUCCEEDED,
          paymentMethod: "MANUAL",
          currency: invoice.currency || "USD",
          allocations: {
            create: {
              invoiceId: invoice.id,
              allocatedAmount: invoice.totalAmount,
            }
          }
        }
      });
      paymentId = payment.id;
    }

    const result = await syncQuickBooksPayment(paymentId);

    return res.status(200).json({
      message: "QuickBooks payment synced successfully via quick-sync.",
      ...result,
    });
  } catch (error) {
    return handleQuickBooksError(
      res,
      error,
      "Unable to quick-sync QuickBooks payment.",
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

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    const [logs, total] = await Promise.all([
      prisma.externalSyncJob.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.externalSyncJob.count({ where }),
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
      case "BILL":
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
