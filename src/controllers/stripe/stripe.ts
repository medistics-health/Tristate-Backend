import { ExternalEntityType, ExternalSyncStatus, ExternalSystem, InvoiceStatus, PaymentStatus } from "../../../generated/prisma/client";
import type { Response, Request } from "express";
import axios from "axios";
import { prisma } from "../../lib/prisma";
import { stripe, getStripeWebhookSecret } from "../../lib/stripe";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { sendOutlookEmail } from "../../utils/outlook";

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
        const stripeInvoice = await stripe.invoices.create({
          customer: customer.id,
          currency,
          auto_advance: false,
          collection_method: "send_invoice",
          days_until_due: invoice.dueDate ? undefined : 30,
          due_date: invoice.dueDate
            ? Math.floor(invoice.dueDate.getTime() / 1000)
            : undefined,
          pending_invoice_items_behavior: "exclude",
          metadata: {
            localInvoiceId: invoice.id,
            practiceId: invoice.practiceId,
            agreementId: invoice.agreementId || "",
          },
        });

        for (const lineItem of invoice.lineItems) {
          await stripe.invoiceItems.create({
            customer: customer.id,
            invoice: stripeInvoice.id,
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

      // PRINCE TASK: Automate Vendor Payable Release
      // If the invoice is fully paid, release related vendor payables that are on hold
      if (stripeInvoice.amount_paid >= stripeInvoice.amount_due) {
        await prisma.vendorPayable.updateMany({
          where: {
            invoiceId: invoice.id,
            status: { in: ["APPROVED", "ON_HOLD", "DRAFT"] },
            releasePolicy: "ON_CLIENT_PAYMENT",
          },
          data: {
            status: "RELEASED",
            releasedAt: new Date(),
          },
        });
      }

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

      // Download paid invoice receipt and send it to practice persons
      try {
        const practice = await prisma.practice.findUnique({
          where: { id: invoice.practiceId },
          include: {
            persons: {
              include: {
                person: true,
              },
            },
            company: {
              include: {
                persons: {
                  include: {
                    person: true,
                  },
                },
              },
            },
          },
        });

        const emails: string[] = [];
        if (practice) {
          if (practice.persons) {
            for (const pp of practice.persons) {
              if (pp.person?.email && pp.person.email.includes("@")) {
                emails.push(pp.person.email.trim());
              }
            }
          }
          if (practice.company?.persons) {
            for (const cp of practice.company.persons) {
              if (cp.person?.email && cp.person.email.includes("@")) {
                emails.push(cp.person.email.trim());
              }
            }
          }
          if (practice.company?.email && practice.company.email.includes("@")) {
            emails.push(practice.company.email.trim());
          }
        }
        const uniqueEmails = [...new Set(emails)];

        if (uniqueEmails.length > 0) {
          // Wait 5 seconds to let Stripe finalize and associate the charge/receipt details
          console.log("[stripe-webhook] Waiting 5 seconds for Stripe to finalize charge/receipt details...");
          await new Promise((resolve) => setTimeout(resolve, 5000));

          let latestStripeInvoice = stripeInvoice;
          try {
            console.log(`[stripe-webhook] Retrieving fresh invoice data for ID: ${stripeInvoice.id}`);
            latestStripeInvoice = await stripe.invoices.retrieve(stripeInvoice.id) as any;
          } catch (retrieveErr) {
            console.error(`[stripe-webhook] Failed to retrieve fresh invoice data:`, retrieveErr);
          }

          let pdfBuffer: Buffer | null = null;
          let isReceipt = false;
          let chargeId = latestStripeInvoice.charge;
          
          // Construct direct receipt download URL (invoicedata.stripe.com)
          let receiptFileUrl = "";
          if (latestStripeInvoice.hosted_invoice_url) {
            try {
              const urlObj = new URL(latestStripeInvoice.hosted_invoice_url);
              const parts = urlObj.pathname.split("/").filter(Boolean);
              const iIndex = parts.indexOf("i");
              if (iIndex !== -1 && parts.length > iIndex + 2) {
                const acctId = parts[iIndex + 1];
                const invoiceIdPart = parts[iIndex + 2];
                receiptFileUrl = `https://invoicedata.stripe.com/invoice_receipt_file_url/${acctId}/${invoiceIdPart}`;
                console.log(`[stripe-webhook] Constructed direct receipt metadata URL: ${receiptFileUrl}`);
              }
            } catch (err) {
              console.error("[stripe-webhook] Error constructing direct receipt URL:", err);
            }
          }

          let pdfUrl = latestStripeInvoice.invoice_pdf || latestStripeInvoice.hosted_invoice_url;
          let receiptUrl = latestStripeInvoice.hosted_invoice_url || "";

          if (receiptFileUrl) {
            try {
              console.log(`[stripe-webhook] Fetching direct receipt PDF metadata from ${receiptFileUrl}`);
              const metaResponse = await axios.get(receiptFileUrl);
              const fileUrl = (metaResponse.data as { file_url?: string })?.file_url;
              if (fileUrl) {
                pdfUrl = fileUrl;
                isReceipt = true;
                receiptUrl = fileUrl;
                console.log(`[stripe-webhook] Resolved direct receipt PDF file URL from metadata: ${pdfUrl}`);
              }
            } catch (metaErr: any) {
              console.error(`[stripe-webhook] Failed to fetch receipt PDF URL metadata from ${receiptFileUrl}:`, metaErr.message);
            }
          }

          if (!chargeId && latestStripeInvoice.payment_intent) {
            try {
              const pi = await stripe.paymentIntents.retrieve(latestStripeInvoice.payment_intent as string);
              chargeId = pi.latest_charge;
            } catch (piErr) {
              console.error(`[stripe-webhook] Failed to retrieve payment intent ${latestStripeInvoice.payment_intent}:`, piErr);
            }
          }

          if (chargeId) {
            try {
              console.log(`[stripe-webhook] Retrieving charge details for ID: ${chargeId}`);
              const charge = await stripe.charges.retrieve(chargeId as string);
              if (charge.receipt_url) {
                if (!pdfUrl || !receiptFileUrl) {
                  pdfUrl = `${charge.receipt_url.split("?")[0]}/pdf`;
                  isReceipt = true;
                }
                if (!receiptUrl || !receiptFileUrl) {
                  receiptUrl = charge.receipt_url;
                }
                console.log(`[stripe-webhook] Resolved payment receipt URL from charge: ${charge.receipt_url}`);
              }
            } catch (chargeErr) {
              console.error(`[stripe-webhook] Failed to retrieve charge details:`, chargeErr);
            }
          }

          if (pdfUrl) {
            try {
              console.log(`[stripe-webhook] Downloading PDF from ${pdfUrl}`);
              const axiosResponse = await axios.get(pdfUrl, {
                responseType: "arraybuffer",
                headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
              });
              pdfBuffer = Buffer.from(axiosResponse.data);
              console.log(`[stripe-webhook] Downloaded PDF successfully (${pdfBuffer.length} bytes)`);
            } catch (downloadErr: any) {
              console.error(`[stripe-webhook] Failed to download PDF from ${pdfUrl}:`, downloadErr.message);
              // Fallback to invoice PDF if downloading receipt PDF failed
              if (isReceipt && (latestStripeInvoice.invoice_pdf || latestStripeInvoice.hosted_invoice_url)) {
                const fallbackUrl = latestStripeInvoice.invoice_pdf || latestStripeInvoice.hosted_invoice_url;
                console.log(`[stripe-webhook] Attempting fallback PDF download from ${fallbackUrl}`);
                try {
                  const fallbackResponse = await axios.get(fallbackUrl, {
                    responseType: "arraybuffer",
                    headers: {
                      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                    }
                  });
                  pdfBuffer = Buffer.from(fallbackResponse.data);
                  isReceipt = false;
                  console.log(`[stripe-webhook] Downloaded fallback PDF successfully (${pdfBuffer.length} bytes)`);
                } catch (fallbackErr: any) {
                  console.error(`[stripe-webhook] Failed to download fallback PDF from ${fallbackUrl}:`, fallbackErr.message);
                }
              }
            }
          }

          let attachments: any[] = [];
          if (pdfBuffer) {
            const docName = isReceipt ? "receipt" : "invoice";
            attachments.push({
              name: `${docName}-${invoice.invoiceNumber || invoice.id.slice(0, 8)}.pdf`,
              contentType: "application/pdf",
              contentBytes: pdfBuffer.toString("base64"),
            });
          }

          const invoiceNum = invoice.invoiceNumber || invoice.id.slice(0, 8);
          const emailSubject = `Payment Receipt for Invoice #${invoiceNum}`;
          const emailBody = `
            <p>Dear Partner,</p>
            <p>We have received your payment for Invoice <strong>#${invoiceNum}</strong>.</p>
            <p><strong>Payment Summary:</strong></p>
            <ul>
              <li><strong>Invoice Number:</strong> #${invoiceNum}</li>
              <li><strong>Amount Paid:</strong> $${(Number(stripeInvoice.amount_paid || 0) / 100).toFixed(2)}</li>
              <li><strong>Status:</strong> Paid / Completed</li>
            </ul>
            ${
              receiptUrl
                ? `
            <p>You can view and download your official Stripe payment receipt by clicking the button below:</p>
            <p style="margin: 24px 0;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${receiptUrl}" style="height:48px;v-text-anchor:middle;width:240px;" arcsize="12%" strokecolor="#0f4c81" fillcolor="#0f4c81">
                <w:anchorlock/>
                <center style="color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:bold;">
                  Download Receipt
                </center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <a href="${receiptUrl}" target="_blank" style="background-color: #0f4c81; border: 1px solid #0f4c81; border-radius: 10px; color: #ffffff; display: inline-block; font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; font-weight: 700; line-height: 20px; padding: 14px 28px; text-decoration: none;">Download Receipt</a>
              <!--<![endif]-->
            </p>
            `
                : ""
            }
            <p>Please find your official payment document attached to this email.</p>
            <p>If you have any questions or require further assistance, please feel free to reach out to our support team.</p>
            <p>Best regards,<br/>The Tristate Team</p>
          `;

          for (const email of uniqueEmails) {
            try {
              await sendOutlookEmail(email, emailSubject, emailBody, { attachments });
              console.log(`[stripe-webhook] Receipt email sent successfully to ${email} for invoice ${invoice.id}`);
            } catch (emailErr) {
              console.error(`[stripe-webhook] Failed to send receipt email to ${email}:`, emailErr);
            }
          }
        } else {
          console.warn(`[stripe-webhook] No receipt recipients found for practice ${invoice.practiceId}`);
        }
      } catch (err) {
        console.error("[stripe-webhook] Error in sending invoice paid email receipt:", err);
      }

      return;
    }

    default:
      return;
  }
}
