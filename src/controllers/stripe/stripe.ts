import { ExternalEntityType, ExternalSyncStatus, ExternalSystem, InvoiceStatus, PaymentStatus } from "../../../generated/prisma/client";
import type { Response, Request } from "express";
import { prisma } from "../../lib/prisma";
import { stripe, getStripeWebhookSecret } from "../../lib/stripe";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

function normalizeCurrency(currency?: string | null) {
  return (currency || "USD").toLowerCase();
}

function toMinorUnit(amount: number | string) {
  return Math.round(Number(amount) * 100);
}

async function createSyncJob(params: {
  entityType: ExternalEntityType;
  entityId: string;
  externalId?: string | null;
  status?: ExternalSyncStatus;
  payload?: unknown;
  lastError?: string | null;
}) {
  return prisma.externalSyncJob.create({
    data: {
      system: ExternalSystem.STRIPE,
      entityType: params.entityType,
      entityId: params.entityId,
      externalId: params.externalId ?? undefined,
      status: params.status ?? ExternalSyncStatus.PENDING,
      payload: params.payload as any,
      lastError: params.lastError ?? undefined,
    },
  });
}

async function addSyncAttempt(
  externalSyncJobId: string,
  params: {
    status: ExternalSyncStatus;
    requestPayload?: unknown;
    responsePayload?: unknown;
    errorMessage?: string | null;
  },
) {
  return prisma.externalSyncAttempt.create({
    data: {
      externalSyncJobId,
      status: params.status,
      requestPayload: params.requestPayload as any,
      responsePayload: params.responsePayload as any,
      errorMessage: params.errorMessage ?? undefined,
    },
  });
}

async function upsertStripeCustomerForPractice(practiceId: string) {
  const practice = await prisma.practice.findUnique({
    where: { id: practiceId },
    include: {
      company: true,
      taxId: true,
      billToTaxId: true,
    },
  });

  if (!practice) {
    throw new Error("Practice not found.");
  }

  if (practice.stripeCustomerId) {
    const customer = await stripe.customers.retrieve(practice.stripeCustomerId);
    if (!("deleted" in customer && customer.deleted)) {
      return { practice, customer };
    }
  }

  const customer = await stripe.customers.create({
    name: practice.name,
    email: practice.company?.email || undefined,
    metadata: {
      practiceId: practice.id,
      companyId: practice.companyId || "",
      taxIdId: practice.taxIdId || "",
      billToTaxIdId: practice.billToTaxIdId || "",
    },
  });

  await prisma.practice.update({
    where: { id: practice.id },
    data: { stripeCustomerId: customer.id },
  });

  return { practice, customer };
}

export async function syncStripeCustomer(
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

    if (!practiceId) {
      return res.status(400).json({ message: "practiceId is required." });
    }

    const syncJob = await createSyncJob({
      entityType: ExternalEntityType.CUSTOMER,
      entityId: practiceId,
      status: ExternalSyncStatus.IN_PROGRESS,
    });

    try {
      const { practice, customer } = await upsertStripeCustomerForPractice(
        practiceId,
      );

      await prisma.externalSyncJob.update({
        where: { id: syncJob.id },
        data: {
          status: ExternalSyncStatus.SYNCED,
          externalId: customer.id,
          lastSyncedAt: new Date(),
        },
      });

      await addSyncAttempt(syncJob.id, {
        status: ExternalSyncStatus.SYNCED,
        responsePayload: customer,
      });

      return res.status(200).json({
        message: "Stripe customer synced successfully.",
        practiceId: practice.id,
        stripeCustomerId: customer.id,
        customer,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await prisma.externalSyncJob.update({
        where: { id: syncJob.id },
        data: {
          status: ExternalSyncStatus.FAILED,
          lastError: message,
        },
      });
      await addSyncAttempt(syncJob.id, {
        status: ExternalSyncStatus.FAILED,
        errorMessage: message,
      });
      throw error;
    }
  } catch (error) {
    return res.status(500).json({
      message: "Unable to sync Stripe customer.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function syncStripeInvoice(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const invoiceId = Array.isArray(req.params.invoiceId)
      ? req.params.invoiceId[0]
      : req.params.invoiceId;

    if (!invoiceId) {
      return res.status(400).json({ message: "invoiceId is required." });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        practice: {
          include: {
            company: true,
            taxId: true,
            billToTaxId: true,
          },
        },
        lineItems: {
          include: { service: true },
        },
      },
    });

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found." });
    }

    if (invoice.lineItems.length === 0) {
      return res.status(400).json({
        message: "Invoice must have at least one line item before Stripe sync.",
      });
    }

    const syncJob = await createSyncJob({
      entityType: ExternalEntityType.INVOICE,
      entityId: invoice.id,
      externalId: invoice.stripeInvoiceId,
      status: ExternalSyncStatus.IN_PROGRESS,
    });

    try {
      const { customer } = await upsertStripeCustomerForPractice(invoice.practiceId);
      const currency = normalizeCurrency(invoice.currency || invoice.practice.defaultCurrency);

      if (!invoice.stripeInvoiceId) {
        for (const lineItem of invoice.lineItems) {
          await stripe.invoiceItems.create({
            customer: customer.id,
            currency,
            amount: toMinorUnit(lineItem.totalPrice.toString()),
            description:
              lineItem.description ||
              lineItem.service.code ||
              lineItem.service.name,
            metadata: {
              localInvoiceId: invoice.id,
              localInvoiceLineItemId: lineItem.id,
              serviceId: lineItem.serviceId,
            },
          });
        }

        const stripeInvoice = await stripe.invoices.create({
          customer: customer.id,
          currency,
          auto_advance: false,
          collection_method: "send_invoice",
          days_until_due: invoice.dueDate ? undefined : 30,
          due_date: invoice.dueDate
            ? Math.floor(invoice.dueDate.getTime() / 1000)
            : undefined,
          metadata: {
            localInvoiceId: invoice.id,
            practiceId: invoice.practiceId,
            agreementId: invoice.agreementId || "",
          },
        });

        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            stripeInvoiceId: stripeInvoice.id,
            stripeHostedInvoiceUrl: stripeInvoice.hosted_invoice_url,
            stripeInvoicePdfUrl: stripeInvoice.invoice_pdf,
          },
        });

        await prisma.externalSyncJob.update({
          where: { id: syncJob.id },
          data: {
            status: ExternalSyncStatus.SYNCED,
            externalId: stripeInvoice.id,
            lastSyncedAt: new Date(),
          },
        });

        await addSyncAttempt(syncJob.id, {
          status: ExternalSyncStatus.SYNCED,
          responsePayload: stripeInvoice,
        });

        return res.status(200).json({
          message: "Stripe invoice synced successfully.",
          stripeInvoice,
        });
      }

      const stripeInvoice = await stripe.invoices.retrieve(invoice.stripeInvoiceId);

      await prisma.externalSyncJob.update({
        where: { id: syncJob.id },
        data: {
          status: ExternalSyncStatus.SYNCED,
          externalId: stripeInvoice.id,
          lastSyncedAt: new Date(),
        },
      });

      await addSyncAttempt(syncJob.id, {
        status: ExternalSyncStatus.SYNCED,
        responsePayload: stripeInvoice,
      });

      return res.status(200).json({
        message: "Invoice already linked to Stripe.",
        stripeInvoice,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await prisma.externalSyncJob.update({
        where: { id: syncJob.id },
        data: {
          status: ExternalSyncStatus.FAILED,
          lastError: message,
        },
      });
      await addSyncAttempt(syncJob.id, {
        status: ExternalSyncStatus.FAILED,
        errorMessage: message,
      });
      throw error;
    }
  } catch (error) {
    return res.status(500).json({
      message: "Unable to sync invoice to Stripe.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function finalizeStripeInvoice(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const invoiceId = Array.isArray(req.params.invoiceId)
      ? req.params.invoiceId[0]
      : req.params.invoiceId;

    if (!invoiceId) {
      return res.status(400).json({ message: "invoiceId is required." });
    }

    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });

    if (!invoice?.stripeInvoiceId) {
      return res.status(400).json({
        message: "Invoice is not yet linked to Stripe.",
      });
    }

    const stripeInvoice = await stripe.invoices.finalizeInvoice(invoice.stripeInvoiceId);

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        stripeHostedInvoiceUrl: stripeInvoice.hosted_invoice_url,
        stripeInvoicePdfUrl: stripeInvoice.invoice_pdf,
      },
    });

    return res.status(200).json({
      message: "Stripe invoice finalized successfully.",
      stripeInvoice,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to finalize Stripe invoice.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function sendStripeInvoice(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const invoiceId = Array.isArray(req.params.invoiceId)
      ? req.params.invoiceId[0]
      : req.params.invoiceId;

    if (!invoiceId) {
      return res.status(400).json({ message: "invoiceId is required." });
    }

    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });

    if (!invoice?.stripeInvoiceId) {
      return res.status(400).json({
        message: "Invoice is not yet linked to Stripe.",
      });
    }

    const stripeInvoice = await stripe.invoices.sendInvoice(invoice.stripeInvoiceId);

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: InvoiceStatus.SENT,
        stripeHostedInvoiceUrl: stripeInvoice.hosted_invoice_url,
        stripeInvoicePdfUrl: stripeInvoice.invoice_pdf,
      },
    });

    return res.status(200).json({
      message: "Stripe invoice sent successfully.",
      stripeInvoice,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to send Stripe invoice.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function handleStripeWebhook(req: Request, res: Response) {
  try {
    const signature = req.headers["stripe-signature"];
    const webhookSecret = getStripeWebhookSecret();

    if (!signature || typeof signature !== "string") {
      return res.status(400).json({ message: "Missing Stripe signature." });
    }

    if (!webhookSecret) {
      return res
        .status(500)
        .json({ message: "STRIPE_WEBHOOK_SECRET is not configured." });
    }

    const event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      webhookSecret,
    );

    await processStripeWebhookEvent(event);

    return res.status(200).json({ received: true });
  } catch (error) {
    return res.status(400).json({
      message: "Stripe webhook handling failed.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

async function processStripeWebhookEvent(event: any) {
  switch (event.type) {
    case "invoice.finalized": {
      const stripeInvoice = event.data.object as any;
      if (!stripeInvoice.id) return;
      await prisma.invoice.updateMany({
        where: { stripeInvoiceId: stripeInvoice.id },
        data: {
          stripeHostedInvoiceUrl: stripeInvoice.hosted_invoice_url,
          stripeInvoicePdfUrl: stripeInvoice.invoice_pdf,
        },
      });
      return;
    }

    case "invoice.sent": {
      const stripeInvoice = event.data.object as any;
      if (!stripeInvoice.id) return;
      await prisma.invoice.updateMany({
        where: { stripeInvoiceId: stripeInvoice.id },
        data: {
          status: InvoiceStatus.SENT,
          stripeHostedInvoiceUrl: stripeInvoice.hosted_invoice_url,
          stripeInvoicePdfUrl: stripeInvoice.invoice_pdf,
        },
      });
      return;
    }

    case "invoice.payment_failed": {
      const stripeInvoice = event.data.object as any;
      if (!stripeInvoice.id) return;
      await prisma.invoice.updateMany({
        where: { stripeInvoiceId: stripeInvoice.id },
        data: { status: InvoiceStatus.OVERDUE },
      });
      return;
    }

    case "invoice.voided": {
      const stripeInvoice = event.data.object as any;
      if (!stripeInvoice.id) return;
      await prisma.invoice.updateMany({
        where: { stripeInvoiceId: stripeInvoice.id },
        data: { status: InvoiceStatus.CANCELLED },
      });
      return;
    }

    case "invoice.paid": {
      const stripeInvoice = event.data.object as any;
      if (!stripeInvoice.id) return;

      const invoice = await prisma.invoice.findFirst({
        where: { stripeInvoiceId: stripeInvoice.id },
      });

      if (!invoice) return;

      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status:
            stripeInvoice.amount_paid < stripeInvoice.amount_due
              ? InvoiceStatus.PARTIALLY_PAID
              : InvoiceStatus.PAID,
          stripeHostedInvoiceUrl: stripeInvoice.hosted_invoice_url,
          stripeInvoicePdfUrl: stripeInvoice.invoice_pdf,
        },
      });

      const amountPaid = Number(stripeInvoice.amount_paid || 0) / 100;
      if (amountPaid > 0) {
        const existingPayment = await prisma.payment.findFirst({
          where: {
            practiceId: invoice.practiceId,
            stripePaymentIntentId:
              typeof stripeInvoice.payment_intent === "string"
                ? stripeInvoice.payment_intent
                : null,
          },
        });

        if (!existingPayment) {
          const payment = await prisma.payment.create({
            data: {
              practiceId: invoice.practiceId,
              amount: amountPaid,
              currency: (stripeInvoice.currency || invoice.currency || "usd").toUpperCase(),
              status:
                stripeInvoice.amount_paid < stripeInvoice.amount_due
                  ? PaymentStatus.PARTIALLY_ALLOCATED
                  : PaymentStatus.ALLOCATED,
              paymentDate: stripeInvoice.status_transitions.paid_at
                ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
                : new Date(),
              paymentMethod: "stripe",
              stripePaymentIntentId:
                typeof stripeInvoice.payment_intent === "string"
                  ? stripeInvoice.payment_intent
                  : undefined,
            },
          });

          await prisma.paymentAllocation.create({
            data: {
              paymentId: payment.id,
              invoiceId: invoice.id,
              allocatedAmount: amountPaid,
            },
          });
        }
      }
      return;
    }

    default:
      return;
  }
}
