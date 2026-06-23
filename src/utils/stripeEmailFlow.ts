import { sendOutlookEmail } from "./outlook";
import { generateInvoicePdfBuffer, generateInvoicePdfBufferFromDb, type InvoiceData } from "./invoicePdf";
import { generateReceiptPdfBuffer, generateReceiptPdfBufferFromDb, type ReceiptData } from "./receiptPdf";
import { generateReceiptEmailTemplate } from "./emailHelpers";

interface PaymentMethodInfo {
  type: string;
  brand?: string;
  last4?: string;
  bankName?: string;
  isAch?: boolean;
}

/**
 * Extracts payment method info from Stripe charge or payment intent
 */
export async function extractPaymentMethodInfo(
  charge: any,
  paymentIntent?: any,
  stripeClient?: any,
): Promise<PaymentMethodInfo> {
  let paymentType = "stripe";
  let brand = "";
  let last4 = "";
  let bankName = "";
  let isAch = false;

  try {
    // If charge exists, get payment method info from it
    if (charge?.payment_method_details) {
      const pmDetails = charge.payment_method_details;

      if (pmDetails.type === "card" && pmDetails.card) {
        paymentType = "credit_card";
        brand = pmDetails.card.brand?.toUpperCase() || "Card";
        last4 = pmDetails.card.last4 || "";
      } else if (pmDetails.type === "us_bank_account" && pmDetails.us_bank_account) {
        paymentType = "ach";
        bankName = pmDetails.us_bank_account.bank_name || "Bank";
        last4 = pmDetails.us_bank_account.last4 || "";
        isAch = true;
      } else if (pmDetails.type === "ach_debit" || pmDetails.type === "ach_credit") {
        paymentType = "ach";
        isAch = true;
        if (pmDetails.ach_debit) {
          bankName = pmDetails.ach_debit.bank_name || "Bank";
          last4 = pmDetails.ach_debit.last4 || "";
        } else if (pmDetails.ach_credit) {
          bankName = pmDetails.ach_credit.bank_name || "Bank";
          last4 = pmDetails.ach_credit.last4 || "";
        }
      }
    }

    // Fallback: get payment method from payment intent
    if (!brand && !bankName && paymentIntent?.payment_method && stripeClient) {
      const pmId = paymentIntent.payment_method;
      if (typeof pmId === "string") {
        try {
          const pm = await stripeClient.paymentMethods.retrieve(pmId);
          if (pm.type === "card" && pm.card) {
            paymentType = "credit_card";
            brand = pm.card.brand?.toUpperCase() || "Card";
            last4 = pm.card.last4 || "";
          }
        } catch (pmErr) {
          console.warn("[paymentMethodHelper] Failed to retrieve payment method:", pmErr);
        }
      }
    }
  } catch (err) {
    console.warn("[paymentMethodHelper] Error extracting payment method info:", err);
  }

  return {
    type: paymentType,
    brand: brand || undefined,
    last4: last4 || undefined,
    bankName: bankName || undefined,
    isAch,
  };
}

/**
 * Sends invoice PDF email first (initial invoice notification)
 */
export async function sendInvoiceFirstEmail(
  recipientEmails: string[],
  invoice: any,
  invoiceNumber: string | null,
  prismaClient: any,
): Promise<void> {
  if (recipientEmails.length === 0) {
    console.warn("[emailFlow] No recipient emails found for sending invoice");
    return;
  }

  if (invoiceNumber === "INV-2606231007-MU21") {
    console.log(`[emailFlow] Skipping email for invoice ${invoiceNumber} as requested`);
    return;
  }

  try {
    // Fetch full invoice data with line items
    const fullInvoice = await prismaClient.invoice.findUnique({
      where: { id: invoice.id },
      include: {
        practice: {
          include: { company: true },
        },
        lineItems: {
          include: { service: true },
        },
      },
    });

    if (!fullInvoice) {
      console.warn("[emailFlow] Invoice not found for email sending");
      return;
    }

    // Generate invoice PDF
    const pdfBuffer = await generateInvoicePdfBufferFromDb(invoice.id, prismaClient);

    // Generate HTML email body
    const formattedDate = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(fullInvoice.dueDate));

    const invoiceHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto, Arial, sans-serif; color: #1F2937; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; background: #f9fafb; }
        .header { background: linear-gradient(135deg, #c3a97c 0%, #d4b896 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
        .content { background: white; padding: 30px; }
        .section { margin: 20px 0; padding: 15px; background: #f3f4f6; border-left: 4px solid #c3a97c; border-radius: 4px; }
        .amount { font-size: 28px; font-weight: bold; color: #111827; margin: 10px 0; }
        .footer { background: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #6B7280; border-radius: 0 0 8px 8px; }
        .item-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="margin: 0; font-size: 28px;">Invoice Notification</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Invoice #${invoiceNumber || "N/A"}</p>
        </div>
        
        <div class="content">
            <p>Dear Valued Client,</p>
            
            <p>We have prepared an invoice for your account. Please find the details below:</p>
            
            <div class="section">
                <strong>Invoice Details:</strong><br>
                <strong>Invoice Number:</strong> ${invoiceNumber || "N/A"}<br>
                <strong>Invoice Date:</strong> ${new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(fullInvoice.createdAt))}<br>
                <strong>Due Date:</strong> ${formattedDate}<br>
                <strong style="font-size: 18px; color: #111827;">Total Amount: $${(fullInvoice.totalAmount || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}</strong>
            </div>
            
            <p>Your invoice PDF is attached to this email for your records. Please review it carefully and ensure all details are correct.</p>
            
            <p style="margin-top: 30px; color: #6B7280; font-size: 14px;">
                If you have any questions or concerns about this invoice, please don't hesitate to contact us.
            </p>
        </div>
        
        <div class="footer">
            <p style="margin: 0;">© ${new Date().getFullYear()} Tristate MSO. All rights reserved.</p>
            <p style="margin: 5px 0 0 0;">This email contains your invoice details.</p>
        </div>
    </div>
</body>
</html>
    `.trim();

    const pdfFileName = `Invoice-${invoiceNumber || "Document"}.pdf`;

    // Send to each recipient
    for (const email of recipientEmails) {
      try {
        await sendOutlookEmail(email, `Invoice #${invoiceNumber} - Please Review`, invoiceHtml, {
          attachments: [
            {
              name: pdfFileName,
              contentType: "application/pdf",
              contentBytes: pdfBuffer.toString("base64"),
            },
          ],
        });
        console.log(`[emailFlow] Invoice email sent to ${email}`);
      } catch (emailErr) {
        console.error(`[emailFlow] Failed to send invoice email to ${email}:`, emailErr);
      }
    }
  } catch (err) {
    console.error("[emailFlow] Error sending invoice email:", err);
  }
}

/**
 * Sends payment receipt PDF email (after payment is received)
 */
export async function sendPaymentReceiptEmail(
  recipientEmails: string[],
  invoice: any,
  invoiceNumber: string | null,
  stripeInvoice: any,
  paymentMethodInfo: PaymentMethodInfo,
  prismaClient: any,
): Promise<void> {
  if (recipientEmails.length === 0) {
    console.warn("[emailFlow] No recipient emails found for sending receipt");
    return;
  }

  try {
    // Fetch full invoice data with line items
    const fullInvoice = await prismaClient.invoice.findUnique({
      where: { id: invoice.id },
      include: {
        practice: {
          include: { company: true },
        },
        lineItems: {
          include: { service: true },
        },
      },
    });

    if (!fullInvoice) {
      console.warn("[emailFlow] Invoice not found for receipt email sending");
      return;
    }

    const paidAmount = Number(stripeInvoice.amount_paid || 0) / 100;
    const receiptNumber = `RCP-${invoiceNumber || fullInvoice.id.slice(0, 8)}`;

    // Generate receipt PDF
    const pdfBuffer = await generateReceiptPdfBufferFromDb(
      invoice.id,
      paymentMethodInfo.type,
      {
        cardBrand: paymentMethodInfo.brand,
        last4Digits: paymentMethodInfo.last4,
        bankName: paymentMethodInfo.bankName,
      },
      prismaClient
    );

    // Generate HTML email body with payment method info
    const paymentMethodDisplay = getPaymentMethodDisplay(paymentMethodInfo);
    const receiptHtml = generateReceiptEmailTemplate(
      invoiceNumber,
      receiptNumber,
      paidAmount,
      new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date()),
      paymentMethodInfo.type,
      {
        cardBrand: paymentMethodInfo.brand,
        last4Digits: paymentMethodInfo.last4,
        bankName: paymentMethodInfo.bankName,
      },
      fullInvoice.currency || "USD",
    );

    const pdfFileName = `Receipt-${receiptNumber}.pdf`;

    // Send to each recipient
    for (const email of recipientEmails) {
      try {
        await sendOutlookEmail(email, `Payment Received - Receipt #${receiptNumber}`, receiptHtml, {
          attachments: [
            {
              name: pdfFileName,
              contentType: "application/pdf",
              contentBytes: pdfBuffer.toString("base64"),
            },
          ],
        });
        console.log(`[emailFlow] Payment receipt email sent to ${email} via ${paymentMethodDisplay}`);
      } catch (emailErr) {
        console.error(`[emailFlow] Failed to send receipt email to ${email}:`, emailErr);
      }
    }
  } catch (err) {
    console.error("[emailFlow] Error sending payment receipt email:", err);
  }
}

/**
 * Generates human-readable payment method display
 */
function getPaymentMethodDisplay(paymentMethodInfo: PaymentMethodInfo): string {
  if (paymentMethodInfo.type === "credit_card") {
    return `${paymentMethodInfo.brand || "Card"} ••••${paymentMethodInfo.last4 || ""}`;
  } else if (paymentMethodInfo.type === "ach") {
    return `Bank Transfer (ACH) - ${paymentMethodInfo.bankName || "Bank"}`;
  }
  return "Stripe Payment";
}
