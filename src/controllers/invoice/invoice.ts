import { InvoiceStatus } from "../../../generated/prisma/client";
import { Response } from "express";
import { prisma } from "../../lib/prisma";
import { stripe } from "../../lib/stripe";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { sendOutlookEmail } from "../../utils/outlook";


type InvoiceBody = {
  practiceId?: string;
  agreementId?: string | null;
  totalAmount?: number;
  status?: string;
  dueDate?: string;
  invoiceNumber?: string | null;
  currency?: string | null;
  billingPeriodStart?: string | null;
  billingPeriodEnd?: string | null;
  subtotalAmount?: number | null;
  taxAmount?: number | null;
  discountAmount?: number | null;
  stripeInvoiceId?: string | null;
  stripeHostedInvoiceUrl?: string | null;
  stripeInvoicePdfUrl?: string | null;
  quickbooksInvoiceId?: string | null;
};

function isInvoiceStatus(status: string): status is InvoiceStatus {
  return Object.values(InvoiceStatus).includes(status as InvoiceStatus);
}

export async function createInvoice(req: AuthenticatedRequest, res: Response) {
  try {
    const {
      practiceId,
      agreementId,
      totalAmount,
      status,
      dueDate,
      invoiceNumber,
      currency,
      billingPeriodStart,
      billingPeriodEnd,
      subtotalAmount,
      taxAmount,
      discountAmount,
      stripeInvoiceId,
      stripeHostedInvoiceUrl,
      stripeInvoicePdfUrl,
      quickbooksInvoiceId,
    } = req.body as InvoiceBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!practiceId || totalAmount === undefined || !status) {
      return res.status(400).json({
        message: "practiceId, totalAmount and status are required.",
      });
    }

    if (!isInvoiceStatus(status)) {
      return res.status(400).json({
        message: "Invalid invoice status.",
        allowedStatuses: Object.values(InvoiceStatus),
      });
    }

    const practice = await prisma.practice.findFirst({
      where: { id: practiceId },
    });

    if (!practice) {
      return res.status(404).json({ message: "Practice not found." });
    }

    if (agreementId) {
      const agreement = await prisma.agreement.findFirst({
        where: {
          id: agreementId,
          practiceId,
        },
      });

      if (!agreement) {
        return res
          .status(404)
          .json({ message: "Agreement not found for practice." });
      }
    }

    const invoice = await prisma.invoice.create({
      data: {
        practiceId,
        agreementId: agreementId ?? undefined,
        totalAmount,
        status,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        ...(invoiceNumber !== undefined
          ? { invoiceNumber: invoiceNumber || null }
          : {}),
        ...(currency !== undefined ? { currency: currency || null } : {}),
        ...(billingPeriodStart !== undefined
          ? {
              billingPeriodStart: billingPeriodStart
                ? new Date(billingPeriodStart)
                : null,
            }
          : {}),
        ...(billingPeriodEnd !== undefined
          ? {
              billingPeriodEnd: billingPeriodEnd
                ? new Date(billingPeriodEnd)
                : null,
            }
          : {}),
        ...(subtotalAmount !== undefined ? { subtotalAmount } : {}),
        ...(taxAmount !== undefined ? { taxAmount } : {}),
        ...(discountAmount !== undefined ? { discountAmount } : {}),
        ...(stripeInvoiceId !== undefined
          ? { stripeInvoiceId: stripeInvoiceId || null }
          : {}),
        ...(stripeHostedInvoiceUrl !== undefined
          ? { stripeHostedInvoiceUrl: stripeHostedInvoiceUrl || null }
          : {}),
        ...(stripeInvoicePdfUrl !== undefined
          ? { stripeInvoicePdfUrl: stripeInvoicePdfUrl || null }
          : {}),
        ...(quickbooksInvoiceId !== undefined
          ? { quickbooksInvoiceId: quickbooksInvoiceId || null }
          : {}),
      },
    });

    return res.status(201).json({
      message: "Invoice created successfully.",
      invoice,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to create invoice.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getInvoice(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Invoice id is required." });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id,  },
      include: {
        practice: true,
        agreement: true,
        lineItems: true,
        purchaseOrders: true,
        vendorPayables: true,
        paymentAllocations: {
          include: {
            payment: true,
          },
        },
      },
    });

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found." });
    }

    return res.status(200).json({
      message: "Invoice fetched successfully.",
      invoice,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch invoice.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updateInvoice(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const {
      agreementId,
      totalAmount,
      status,
      dueDate,
      invoiceNumber,
      currency,
      billingPeriodStart,
      billingPeriodEnd,
      subtotalAmount,
      taxAmount,
      discountAmount,
      stripeInvoiceId,
      stripeHostedInvoiceUrl,
      stripeInvoicePdfUrl,
      quickbooksInvoiceId,
    } = req.body as InvoiceBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Invoice id is required." });
    }

    if (status !== undefined && !isInvoiceStatus(status)) {
      return res.status(400).json({
        message: "Invalid invoice status.",
        allowedStatuses: Object.values(InvoiceStatus),
      });
    }

    const existingInvoice = await prisma.invoice.findFirst({
      where: { id,  },
    });

    if (!existingInvoice) {
      return res.status(404).json({ message: "Invoice not found." });
    }

    if (totalAmount !== undefined && Number(totalAmount) !== Number(existingInvoice.totalAmount)) {
      return res.status(400).json({ message: "Editing totalAmount is not allowed." });
    }

    if (status !== undefined && status !== existingInvoice.status) {
      return res.status(400).json({ message: "Editing status is not allowed." });
    }

    if (dueDate !== undefined && dueDate) {
      const parsedDueDate = new Date(dueDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (parsedDueDate < today) {
        return res.status(400).json({ message: "Due date must be today or a future date." });
      }
    }

    if (agreementId) {
      const agreement = await prisma.agreement.findFirst({
        where: {
          id: agreementId,
          practiceId: existingInvoice.practiceId,
        },
      });

      if (!agreement) {
        return res
          .status(404)
          .json({ message: "Agreement not found for invoice." });
      }
    }

    const invoice = await prisma.invoice.update({
      where: { id },
      data: {
        ...(agreementId !== undefined
          ? { agreementId: agreementId || null }
          : {}),
        ...(totalAmount !== undefined ? { totalAmount } : {}),
        ...(status !== undefined ? { status: status as InvoiceStatus } : {}),
        ...(dueDate !== undefined
          ? { dueDate: dueDate ? new Date(dueDate) : null }
          : {}),
        ...(invoiceNumber !== undefined
          ? { invoiceNumber: invoiceNumber || null }
          : {}),
        ...(currency !== undefined ? { currency: currency || null } : {}),
        ...(billingPeriodStart !== undefined
          ? {
              billingPeriodStart: billingPeriodStart
                ? new Date(billingPeriodStart)
                : null,
            }
          : {}),
        ...(billingPeriodEnd !== undefined
          ? {
              billingPeriodEnd: billingPeriodEnd
                ? new Date(billingPeriodEnd)
                : null,
            }
          : {}),
        ...(subtotalAmount !== undefined ? { subtotalAmount } : {}),
        ...(taxAmount !== undefined ? { taxAmount } : {}),
        ...(discountAmount !== undefined ? { discountAmount } : {}),
        ...(stripeInvoiceId !== undefined
          ? { stripeInvoiceId: stripeInvoiceId || null }
          : {}),
        ...(stripeHostedInvoiceUrl !== undefined
          ? { stripeHostedInvoiceUrl: stripeHostedInvoiceUrl || null }
          : {}),
        ...(stripeInvoicePdfUrl !== undefined
          ? { stripeInvoicePdfUrl: stripeInvoicePdfUrl || null }
          : {}),
        ...(quickbooksInvoiceId !== undefined
          ? { quickbooksInvoiceId: quickbooksInvoiceId || null }
          : {}),
      },
    });

    return res.status(200).json({
      message: "Invoice updated successfully.",
      invoice,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to update invoice.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function deleteInvoice(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Invoice id is required." });
    }

    const existingInvoice = await prisma.invoice.findFirst({
      where: { id,  },
    });

    if (!existingInvoice) {
      return res.status(404).json({ message: "Invoice not found." });
    }

    await prisma.invoice.delete({ where: { id } });

    return res.status(200).json({ message: "Invoice deleted successfully." });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete invoice.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getAllInvoices(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const status = (req.query.status as string) || "";

    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.practice = {
        ...where.practice,
        name: { contains: search, mode: "insensitive" },
      };
    }

    if (status) {
      if (!isInvoiceStatus(status)) {
        return res.status(400).json({
          message: "Invalid invoice status.",
          allowedStatuses: Object.values(InvoiceStatus),
        });
      }
      where.status = status as InvoiceStatus;
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: { practice: true, agreement: true },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.invoice.count({ where }),
    ]);

    return res.status(200).json({
      message: "Invoices fetched successfully.",
      invoices,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch invoices.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getInvoiceStripeEvents(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Invoice id is required." });
    }

    const events = await prisma.stripeEventLog.findMany({
      where: { invoiceId: id },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      message: "Stripe events fetched successfully.",
      events,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch stripe events.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function processAndEmailInvoice(invoiceId: string): Promise<void> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      practice: {
        include: {
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
      },
    },
  });

  if (!invoice || !invoice.practice) {
    throw new Error("Invoice or practice not found");
  }

  const billingRunItems = await prisma.billingRunItem.findMany({
    where: {
      invoiceLineItems: {
        some: {
          invoiceId: invoiceId,
        },
      },
    },
    include: {
      service: true,
    },
  });

  let stripeInvoiceId: string | null = invoice.stripeInvoiceId || null;
  let hostedUrl: string | null = invoice.stripeHostedInvoiceUrl || null;
  let pdfUrl: string | null = invoice.stripeInvoicePdfUrl || null;

  if (!stripeInvoiceId) {
    // 1. Get or create Stripe Customer
    let customerId = invoice.practice.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: invoice.practice.name,
        email: "billing@" + invoice.practice.name.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com",
        metadata: { practiceId: invoice.practice.id },
      });
      customerId = customer.id;
      await prisma.practice.update({
        where: { id: invoice.practice.id },
        data: { stripeCustomerId: customerId },
      });
    }

    // 2. Create Invoice Items
    if (billingRunItems.length > 0) {
      for (const item of billingRunItems) {
        await stripe.invoiceItems.create({
          customer: customerId,
          amount: Math.round(Number(item.clientAmount) * 100), // amount in cents
          currency: "usd",
          description: item.service?.name || "Service Item",
        });
      }
    } else {
      await stripe.invoiceItems.create({
        customer: customerId,
        amount: Math.round(Number(invoice.totalAmount) * 100), // amount in cents
        currency: "usd",
        description: `Invoice ${invoice.invoiceNumber || invoice.id.slice(0, 8)}`,
      });
    }

    // 3. Create Invoice
    const stripeInvoice = await stripe.invoices.create({
      customer: customerId,
      auto_advance: false,
      collection_method: "send_invoice",
      days_until_due: 30,
      pending_invoice_items_behavior: "include",
      metadata: { invoiceId: invoice.id },
    });

    stripeInvoiceId = stripeInvoice.id;
  }

  // Finalize the invoice if it needs to be finalized
  if (stripeInvoiceId && !hostedUrl) {
    let finalizedInvoice;
    try {
      finalizedInvoice = await stripe.invoices.finalizeInvoice(stripeInvoiceId);
    } catch (err: any) {
      // If it's already finalized, just retrieve it
      if (err.message && err.message.includes("can only be finalized in draft")) {
        finalizedInvoice = await stripe.invoices.retrieve(stripeInvoiceId);
      } else {
        throw err;
      }
    }

    hostedUrl = finalizedInvoice.hosted_invoice_url || null;
    pdfUrl = finalizedInvoice.invoice_pdf || null;

    // Update DB with the finalized URL
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        stripeInvoiceId,
        stripeHostedInvoiceUrl: hostedUrl,
        stripeInvoicePdfUrl: pdfUrl,
      },
    });

    // Log the event
    await prisma.stripeEventLog.create({
      data: {
        invoiceId: invoice.id,
        eventType: "invoice.sent",
        stripeEventId: "evt_resend_" + Date.now(),
        payload: { action: "Sent payment email with Stripe link" },
      },
    });
  }

  // Update status to SENT if it was DRAFT
  if (invoice.status === "DRAFT") {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: "SENT" },
    });
  }

  // Fetch recipient emails
  const emails = invoice.practice.company?.persons
    ?.map(cp => cp.person?.email)
    .filter((email): email is string => typeof email === 'string' && email.includes('@')) || [];

  let recipientEmails = [...new Set(emails)];
  if (recipientEmails.length === 0 && invoice.practice.company?.email) {
    recipientEmails.push(invoice.practice.company.email);
  }

  if (recipientEmails.length > 0 && hostedUrl) {
    const practiceName = invoice.practice.name;
    const invoiceNumber = invoice.invoiceNumber || invoice.id.slice(0, 8);
    const billingPeriodStart = invoice.billingPeriodStart ? new Date(invoice.billingPeriodStart).toLocaleDateString() : "N/A";
    const billingPeriodEnd = invoice.billingPeriodEnd ? new Date(invoice.billingPeriodEnd).toLocaleDateString() : "N/A";
    const billingPeriod = `${billingPeriodStart} to ${billingPeriodEnd}`;
    const dueDate = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "N/A";
    const totalAmount = Number(invoice.totalAmount).toFixed(2);

    const itemsListHtml = billingRunItems && billingRunItems.length > 0
      ? `
  <div style="margin-top: 25px; margin-bottom: 25px;">
    <h3 style="margin-top: 0; margin-bottom: 10px; color: #475569; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: bold;">Invoice Items</h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #334155;">
      <thead>
        <tr style="border-bottom: 2px solid #cbd5e1; text-align: left; color: #475569;">
          <th style="padding: 8px 4px; font-weight: bold;">Description</th>
          <th style="padding: 8px 4px; font-weight: bold; text-align: right; width: 120px;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${billingRunItems.map(item => `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 8px 4px; vertical-align: top;">${item.service?.name || 'Service Item'}</td>
            <td style="padding: 8px 4px; text-align: right; vertical-align: top; font-weight: bold; color: #1e293b;">$${Number(item.clientAmount).toFixed(2)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
      `
      : '';

    const emailSubject = `Payment Required: Invoice ${invoiceNumber} for ${practiceName}`;
    const emailBody = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #f0ece6; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
  <div style="border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 20px;">
    <h2 style="margin: 0; color: #6366f1;">Tristate MSO</h2>
    <span style="font-size: 14px; color: #94a3b8;">Invoice Payment Request</span>
  </div>
  
  <p style="font-size: 16px; line-height: 1.5; color: #334155; margin-bottom: 20px;">
    Hello,
  </p>
  <p style="font-size: 15px; line-height: 1.5; color: #334155; margin-bottom: 20px;">
    An invoice has been generated for <strong>${practiceName}</strong>. Please find the invoice details and the payment link below:
  </p>

  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin-bottom: 25px;">
    <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #475569;">
      <tr>
        <td style="padding: 6px 0; font-weight: bold; width: 40%;">Invoice Number:</td>
        <td style="padding: 6px 0;">${invoiceNumber}</td>
      </tr>
      <tr>
        <td style="padding: 6px 0; font-weight: bold;">Billing Period:</td>
        <td style="padding: 6px 0;">${billingPeriod}</td>
      </tr>
      <tr>
        <td style="padding: 6px 0; font-weight: bold;">Total Amount:</td>
        <td style="padding: 6px 0; font-weight: bold; color: #1e293b; font-size: 16px;">$${totalAmount}</td>
      </tr>
      <tr>
        <td style="padding: 6px 0; font-weight: bold;">Due Date:</td>
        <td style="padding: 6px 0;">${dueDate}</td>
      </tr>
    </table>
  </div>

  ${itemsListHtml}

  <div style="text-align: center; margin-bottom: 30px;">
    <a href="${hostedUrl}" target="_blank" style="display: inline-block; background-color: #6366f1; color: #ffffff; text-decoration: none; padding: 12px 28px; font-size: 15px; font-weight: bold; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(99, 102, 241, 0.2), 0 2px 4px -1px rgba(99, 102, 241, 0.1);">
      Pay Invoice with Stripe
    </a>
  </div>

  <p style="font-size: 13px; line-height: 1.5; color: #64748b; margin-bottom: 0;">
    If you have any questions regarding this invoice, please reach out to our billing team.
  </p>
  <p style="font-size: 13px; line-height: 1.5; color: #64748b; margin-top: 15px; margin-bottom: 0;">
    Best regards,<br/>
    <strong>The Tristate Team</strong>
  </p>
</div>
    `;

    for (const email of recipientEmails) {
      try {
        await sendOutlookEmail(email, emailSubject, emailBody);
      } catch (emailErr) {
        console.error(`Failed to send outlook email to ${email}:`, emailErr);
      }
    }
  } else {
    console.warn(`No recipient emails found or no hosted Stripe url available for invoice ${invoiceId}`);
  }
}

export async function resendStripeInvoice(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Invoice id is required." });
    }

    await processAndEmailInvoice(id);

    return res.status(200).json({
      message: "Invoice payment email sent successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to resend invoice.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
