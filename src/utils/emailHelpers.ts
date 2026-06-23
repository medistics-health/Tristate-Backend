import { sendOutlookEmail } from "./outlook";
import { generateInvoicePdfBuffer, type InvoiceData } from "./invoicePdf";
import { generateReceiptPdfBuffer, type ReceiptData } from "./receiptPdf";

/**
 * Sends a custom invoice PDF via email with HTML body
 */
export async function sendInvoiceEmailWithPdf(
  to: string | string[],
  invoicePdfData: InvoiceData,
  emailTemplateHtml: string,
  subject: string,
  options: { cc?: string[]; bcc?: string[] } = {},
): Promise<void> {
  const recipientEmails = Array.isArray(to) ? to : [to];
  
  // Generate PDF buffer
  const pdfBuffer = await generateInvoicePdfBuffer(invoicePdfData);
  
  const pdfFileName = `Invoice-${invoicePdfData.invoiceNumber || 'Document'}.pdf`;
  
  // Send email to each recipient
  for (const email of recipientEmails) {
    try {
      await sendOutlookEmail(email, subject, emailTemplateHtml, {
        cc: options.cc,
        attachments: [
          {
            name: pdfFileName,
            contentType: "application/pdf",
            contentBytes: pdfBuffer.toString("base64"),
          },
        ],
      });
      console.log(`[emailHelpers] Invoice email sent successfully to ${email} with PDF: ${pdfFileName}`);
    } catch (emailErr) {
      console.error(`[emailHelpers] Failed to send invoice email to ${email}:`, emailErr);
      throw emailErr;
    }
  }
}

/**
 * Sends a payment receipt PDF via email with HTML body
 */
export async function sendReceiptEmailWithPdf(
  to: string | string[],
  receiptPdfData: ReceiptData,
  emailTemplateHtml: string,
  subject: string,
  options: { cc?: string[]; bcc?: string[] } = {},
): Promise<void> {
  const recipientEmails = Array.isArray(to) ? to : [to];
  
  // Generate PDF buffer
  const pdfBuffer = await generateReceiptPdfBuffer(receiptPdfData);
  
  const pdfFileName = `Receipt-${receiptPdfData.receiptNumber || 'Payment'}.pdf`;
  
  // Send email to each recipient
  for (const email of recipientEmails) {
    try {
      await sendOutlookEmail(email, subject, emailTemplateHtml, {
        cc: options.cc,
        attachments: [
          {
            name: pdfFileName,
            contentType: "application/pdf",
            contentBytes: pdfBuffer.toString("base64"),
          },
        ],
      });
      console.log(`[emailHelpers] Receipt email sent successfully to ${email} with PDF: ${pdfFileName}`);
    } catch (emailErr) {
      console.error(`[emailHelpers] Failed to send receipt email to ${email}:`, emailErr);
      throw emailErr;
    }
  }
}

/**
 * Generates HTML email template for invoice
 */
export function generateInvoiceEmailTemplate(
  invoiceNumber: string | null,
  invoiceAmount: number,
  dueDate: string,
  currency: string = "USD",
  invoiceLink?: string,
): string {
  const currencySymbol = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(0).replace(/[0.]/, "");

  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto, Arial, sans-serif; color: #1F2937; }
        .container { max-width: 600px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #c3a97c 0%, #d4b896 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
        .amount { font-size: 24px; font-weight: bold; color: #111827; margin: 20px 0; }
        .due-date { color: #6B7280; font-size: 14px; margin: 15px 0; }
        .button { background: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; }
        .footer { background: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #6B7280; border-radius: 0 0 8px 8px; }
        .line-item { margin: 15px 0; padding: 10px; background: white; border-left: 3px solid #c3a97c; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="margin: 0; font-size: 28px;">Invoice Notification</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Invoice #${invoiceNumber || 'N/A'}</p>
        </div>
        
        <div class="content">
            <p>Dear Valued Client,</p>
            
            <p>We have prepared an invoice for your account. Please find the details below:</p>
            
            <div class="line-item">
                <strong>Invoice Number:</strong> ${invoiceNumber || 'N/A'}<br>
                <strong>Amount Due:</strong> <span style="color: #10B981; font-size: 18px;">${currencySymbol}${invoiceAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span><br>
                <strong>Due Date:</strong> ${dueDate}
            </div>
            
            <p>Your invoice PDF is attached to this email for your records. Please review it carefully and ensure all details are correct.</p>
            
            ${invoiceLink ? `<a href="${invoiceLink}" class="button">View Invoice Online</a>` : ""}
            
            <p style="margin-top: 30px; color: #6B7280; font-size: 14px;">
                If you have any questions or concerns about this invoice, please don't hesitate to contact us.
            </p>
        </div>
        
        <div class="footer">
            <p style="margin: 0;">© ${new Date().getFullYear()} Tristate MSO. All rights reserved.</p>
            <p style="margin: 5px 0 0 0;">This email contains important information about your account.</p>
        </div>
    </div>
</body>
</html>
  `.trim();
}

/**
 * Generates HTML email template for payment receipt with payment method info
 */
export function generateReceiptEmailTemplate(
  invoiceNumber: string | null,
  receiptNumber: string,
  paidAmount: number,
  paidDate: string,
  paymentMethod: string,
  paymentDetails?: { cardBrand?: string; last4Digits?: string; bankName?: string },
  currency: string = "USD",
): string {
  const currencySymbol = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(0).replace(/[0.]/, "");

  // Format payment method display
  let paymentMethodDisplay = "Stripe";
  if (paymentMethod.toLowerCase() === "stripe" || paymentMethod.toLowerCase() === "credit_card") {
    if (paymentDetails?.cardBrand) {
      paymentMethodDisplay = `${paymentDetails.cardBrand} ••••${paymentDetails.last4Digits || ""}`;
    } else {
      paymentMethodDisplay = "Credit Card";
    }
  } else if (paymentMethod.toLowerCase() === "ach") {
    paymentMethodDisplay = "Bank Transfer (ACH)";
    if (paymentDetails?.bankName) {
      paymentMethodDisplay += ` - ${paymentDetails.bankName}`;
    }
  } else if (paymentMethod.toLowerCase() === "check") {
    paymentMethodDisplay = "Check";
    if (paymentDetails?.last4Digits) {
      paymentMethodDisplay += ` #${paymentDetails.last4Digits}`;
    }
  }

  return `
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
        .footer { background: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #6B7280; border-radius: 0 0 8px 8px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="margin: 0; font-size: 28px;">Payment Received</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Receipt #${receiptNumber}</p>
        </div>
        
        <div class="content">
            <p>Dear Valued Client,</p>
            
            <p>Thank you! We have successfully received your payment. Please find the receipt details below:</p>
            
            <div class="section">
                <strong>Receipt Details:</strong><br>
                <strong>Invoice Number:</strong> ${invoiceNumber || 'N/A'}<br>
                <strong>Receipt Number:</strong> ${receiptNumber}<br>
                <strong>Payment Date:</strong> ${paidDate}<br>
                <strong>Payment Method:</strong> ${paymentMethodDisplay}<br>
                <strong style="font-size: 18px; color: #111827;">Amount Paid: ${currencySymbol}${paidAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </div>
            
            <p>Your payment receipt PDF is attached to this email for your records.</p>
            
            <p style="margin-top: 30px; color: #6B7280; font-size: 14px;">
                If you have any questions about this payment or need any assistance, please feel free to contact us.
            </p>
        </div>
        
        <div class="footer">
            <p style="margin: 0;">© ${new Date().getFullYear()} Tristate MSO. All rights reserved.</p>
            <p style="margin: 5px 0 0 0;">This receipt confirms your payment has been processed successfully.</p>
        </div>
    </div>
</body>
</html>
  `.trim();
}
