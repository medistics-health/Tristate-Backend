import { prisma } from "../../lib/prisma";
import { stripeRequest } from "../../lib/stripeApi";
import { stripe } from "../../lib/stripe";
import { sendOutlookEmail } from "../../utils/outlook";
import { getPrimaryPracticeEmail } from "../../utils/practiceEmail";
import { generatePrefundingInvoicePdfBuffer } from "../../utils/prefundingInvoicePdf";
import { ensureStripeCustomerForPractice } from "../invoice/invoice";
import {
  isBillingPaymentMethod,
  getStripePaymentMethodTypes,
  buildProcessingFeeSettings,
  calculateBearerProcessingAmounts,
  getProcessingFeeDescription,
  BillingPaymentMethod,
  buildProcessingFeeAllocationSettings,
  buildPracticeDefaultProcessingFeeSettings,
  materializeProcessingFeeSettings,
  getFeeRule,
} from "../../utils/paymentProcessing";

export async function processAndEmailPrefundingInvoice(prefundingInvoiceId: string): Promise<any> {
  const inv: any = await prisma.prefundingInvoice.findUnique({
    where: { id: prefundingInvoiceId },
    include: {
      practice: {
        include: {
          persons: {
            include: { person: true },
          },
          company: true,
        },
      },
      lineItems: {
        orderBy: { sequence: "asc" },
      },
      createdByUser: true,
    },
  });

  if (!inv || !inv.practice) {
    throw new Error("Prefunding Invoice or practice not found");
  }

  // 1. Practice Stripe Connected Account validation (Section 16 requirement)
  const connectedAccountId = inv.practice.prefundingStripeAccountId?.trim();
  if (!connectedAccountId) {
    throw new Error(
      `Practice "${inv.practice.name}" does not have a configured Prefunding Stripe Account. Please assign a Stripe Account in Practice Settings before posting.`
    );
  }

  const currency = (inv.currency || inv.practice.defaultCurrency || "USD").toLowerCase();
  const invoiceNumber = inv.invoiceNumber || `INV-${new Date(inv.createdAt).getFullYear()}-${inv.id.replace(/-/g, "").slice(0, 5).toUpperCase()}`;

  // 2. Billing Payment Method & Processing Fee Calculation (Exact Billing Run Logic)
  const practicePaymentMethod = (inv.practice.billingPaymentMethod || "ACH").toUpperCase();
  const paymentMethod: BillingPaymentMethod = isBillingPaymentMethod(practicePaymentMethod)
    ? practicePaymentMethod
    : "ACH";

  const subtotalAmount = Number(inv.subtotalAmount ?? inv.totalAmount);
  const settings = await prisma.systemSettings.findFirst();

  const processingFeeAllocation = inv.practice.processingFeeConfig
    ? buildProcessingFeeAllocationSettings(inv.practice.processingFeeConfig)
    : buildPracticeDefaultProcessingFeeSettings(settings);

  const processingFeeConfig = materializeProcessingFeeSettings(
    processingFeeAllocation,
    settings,
  );

  const processingAmounts = calculateBearerProcessingAmounts({
    baseAmount: subtotalAmount,
    paymentMethod,
    feeBearer: "CLIENT",
    settings: processingFeeConfig,
  });

  const clientFee = processingAmounts.clientFeeAmount || 0;
  const companyFee = processingAmounts.companyFeeAmount || 0;
  const customerInvoiceAmount = processingAmounts.customerInvoiceAmount;

  const clientRule = getFeeRule(processingFeeConfig, paymentMethod, "CLIENT");
  const isCc = paymentMethod === "CREDIT_CARD";
  let feeDetail = "";
  if (clientRule) {
    if (isCc) {
      const parts = [];
      if (clientRule.ratePercent > 0) parts.push(`${clientRule.ratePercent}%`);
      if (clientRule.fixedFee > 0) parts.push(`$${clientRule.fixedFee.toFixed(2)}`);
      if (parts.length > 0) feeDetail = ` (${parts.join(" + ")})`;
    } else {
      const parts = [];
      if (clientRule.ratePercent > 0) parts.push(`${clientRule.ratePercent}%`);
      if (clientRule.capAmount != null && clientRule.capAmount > 0) parts.push(`$${clientRule.capAmount.toFixed(2)} max`);
      if (parts.length > 0) feeDetail = ` (${parts.join(" / ")})`;
    }
  }
  const feeDescription = `${isCc ? "Credit Card" : "ACH"} processing fee${feeDetail}`;

  // 3. Ensure Stripe Customer for Practice
  const stripeCustomerId = await ensureStripeCustomerForPractice(inv.practice);
  const paymentMethodTypes = getStripePaymentMethodTypes(paymentMethod);

  let stripeInvoiceId: string | null = inv.stripeInvoiceId || null;
  let hostedUrl: string | null = inv.stripeHostedInvoiceUrl || null;
  let pdfUrl: string | null = inv.stripeInvoicePdfUrl || null;

  if (!stripeInvoiceId) {
    const nowUnix = Math.floor(Date.now() / 1000);
    const invoiceDueDateUnix = inv.dueDate
      ? Math.floor(new Date(inv.dueDate).getTime() / 1000)
      : null;
    // Stripe requires due_date to be strictly in the future (at least an hour from now)
    const isFutureDueDate =
      invoiceDueDateUnix !== null && invoiceDueDateUnix > nowUnix + 3600;

    // Create Stripe Invoice
    const stripeInvoice = await stripeRequest<{
      id: string;
      hosted_invoice_url?: string | null;
      invoice_pdf?: string | null;
    }>("POST", "/v1/invoices", {
      customer: stripeCustomerId,
      currency,
      auto_advance: false,
      collection_method: "send_invoice",
      due_date: isFutureDueDate ? invoiceDueDateUnix : undefined,
      days_until_due: isFutureDueDate ? undefined : 1,
      pending_invoice_items_behavior: "exclude",
      metadata: {
        prefundingInvoiceId: inv.id,
        invoiceNumber,
        practiceId: inv.practiceId,
        cycle: inv.cycle,
        prefundingStripeAccountId: connectedAccountId,
      },
      payment_settings: {
        payment_method_types: paymentMethodTypes,
      },
    });

    stripeInvoiceId = stripeInvoice.id;

    // Create Line Items on Stripe
    const rawItems = inv.lineItems || [];
    if (rawItems.length > 0) {
      for (const item of rawItems) {
        const itemAmount = Math.round(Number(item.amount) * 100);
        if (itemAmount !== 0) {
          await stripeRequest("POST", "/v1/invoiceitems", {
            customer: stripeCustomerId,
            invoice: stripeInvoiceId,
            amount: itemAmount,
            currency,
            description: `${item.name}${item.basis ? ` (${item.basis})` : ""}`,
            metadata: {
              prefundingInvoiceId: inv.id,
              lineItemId: item.id,
              pricingModel: item.pricingModel || "",
            },
          });
        }
      }
    } else {
      await stripeRequest("POST", "/v1/invoiceitems", {
        customer: stripeCustomerId,
        invoice: stripeInvoiceId,
        amount: Math.round(subtotalAmount * 100),
        currency,
        description: `Prefunding Invoice ${invoiceNumber}`,
      });
    }

    // Add Client Processing Fee item if applicable
    if (clientFee > 0) {
      await stripeRequest("POST", "/v1/invoiceitems", {
        customer: stripeCustomerId,
        invoice: stripeInvoiceId,
        amount: Math.round(clientFee * 100),
        currency,
        description: feeDescription,
        metadata: {
          prefundingInvoiceId: inv.id,
          itemType: "processing_fee",
        },
      });
    }
  }

  // Finalize Invoice in Stripe if not finalized
  if (stripeInvoiceId) {
    let finalizedInvoice: any;
    if (!hostedUrl) {
      try {
        finalizedInvoice = await stripeRequest(
          "POST",
          `/v1/invoices/${stripeInvoiceId}/finalize`
        );
      } catch (err: any) {
        if (err.message && err.message.includes("can only be finalized in draft")) {
          finalizedInvoice = await stripeRequest("GET", `/v1/invoices/${stripeInvoiceId}`);
        } else {
          throw err;
        }
      }
    } else {
      finalizedInvoice = await stripeRequest("GET", `/v1/invoices/${stripeInvoiceId}`);
    }

    hostedUrl = finalizedInvoice.hosted_invoice_url || hostedUrl;
    pdfUrl = finalizedInvoice.invoice_pdf || pdfUrl;
  }

  // 4. Update Prefunding Invoice in DB
  const updatedInvoice = await prisma.prefundingInvoice.update({
    where: { id: inv.id },
    data: {
      invoiceNumber,
      status: "Posted",
      subtotalAmount,
      totalAmount: customerInvoiceAmount,
      currency: currency.toUpperCase(),
      paymentMethod,
      feeBearer: clientFee > 0 ? "CLIENT" : "COMPANY",
      processingFeeAmount: clientFee,
      companyFeeAmount: companyFee,
      stripeInvoiceId,
      stripeHostedInvoiceUrl: hostedUrl,
      stripeInvoicePdfUrl: pdfUrl,
    },
    include: {
      practice: true,
      lineItems: true,
    },
  });

  // 5. Generate A4 Prefunding Invoice PDF buffer
  let pdfBuffer: Buffer | null = null;
  try {
    const firstPerson = inv.practice?.persons?.[0]?.person;
    const recipientName = firstPerson ? `${firstPerson.firstName} ${firstPerson.lastName}`.trim() : undefined;
    const recipientEmail = firstPerson?.email || inv.practice?.emails?.[0] || undefined;

    pdfBuffer = await generatePrefundingInvoicePdfBuffer({
      invoiceNumber,
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate,
      cycle: inv.cycle,
      subtotalAmount,
      processingFeeAmount: clientFee,
      processingFeeDescription: feeDescription,
      totalAmount: customerInvoiceAmount,
      status: "POSTED",
      practice: inv.practice,
      recipientName,
      recipientEmail,
      lineItems: (inv.lineItems || []).map((item: any) => ({
        ...item,
        rate: item.rate !== null ? Number(item.rate) : null,
        amount: Number(item.amount),
        includeInGrandTotal: item.includeInGrandTotal !== false,
        sequence: item.sequence ?? 0,
      })),
    });
  } catch (pdfErr) {
    console.error("[prefundingStripe] Failed to generate PDF buffer:", pdfErr);
  }

  // 6. Gather Recipients & Send Email
  const recipientEmails: string[] = [];

  // Check designated prefundingInvoiceRecipientId on practice first
  if (inv.practice.prefundingInvoiceRecipientId) {
    const designatedPerson = await prisma.person.findUnique({
      where: { id: inv.practice.prefundingInvoiceRecipientId },
      select: { email: true },
    });
    if (designatedPerson?.email && designatedPerson.email.includes("@")) {
      recipientEmails.push(designatedPerson.email.trim());
    }
  }

  // Practice associated persons
  if (inv.practice.persons) {
    for (const pp of inv.practice.persons) {
      if (pp.person?.email && pp.person.email.includes("@")) {
        recipientEmails.push(pp.person.email.trim());
      }
    }
  }

  // Primary practice fallback email
  if (recipientEmails.length === 0) {
    const primaryEmail = await getPrimaryPracticeEmail(inv.practice);
    if (primaryEmail) {
      recipientEmails.push(primaryEmail);
    }
  }

  const uniqueEmails = [...new Set(recipientEmails)];

  if (uniqueEmails.length > 0 && hostedUrl) {
    const practiceName = inv.practice.name;
    const formatUTCDate = (d: Date | string | null | undefined) => {
      if (!d) return "N/A";
      const date = new Date(d);
      return `${String(date.getUTCMonth() + 1).padStart(2, "0")}/${String(date.getUTCDate()).padStart(2, "0")}/${date.getUTCFullYear()}`;
    };

    let recipientName = "";
    let recipientEmail = "";
    if (inv.practice.prefundingInvoiceRecipientId) {
      const designated = await prisma.person.findUnique({
        where: { id: inv.practice.prefundingInvoiceRecipientId },
        select: { firstName: true, lastName: true, email: true },
      });
      if (designated) {
        recipientName = `${designated.firstName || ""} ${designated.lastName || ""}`.trim();
        recipientEmail = designated.email || "";
      }
    }
    if (!recipientName && inv.practice.persons && inv.practice.persons.length > 0) {
      const firstP = inv.practice.persons[0]?.person;
      if (firstP) {
        recipientName = `${firstP.firstName || ""} ${firstP.lastName || ""}`.trim();
        recipientEmail = firstP.email || "";
      }
    }
    if (!recipientEmail && inv.practice.emails && inv.practice.emails.length > 0) {
      recipientEmail = inv.practice.emails[0];
    }

    const dueDateFormatted = formatUTCDate(inv.dueDate);
    const invoiceDateFormatted = formatUTCDate(inv.invoiceDate || inv.createdAt);
    const createdDateFormatted = formatUTCDate(inv.createdAt);
    const postedDateFormatted = formatUTCDate(new Date());
    const createdByName = inv.createdByUser?.name || "System Administrator";

    const totalAmountFormatted = customerInvoiceAmount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const subtotalFormatted = subtotalAmount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    // Breakdown Line Items calculation
    const items = (inv.lineItems || []).map((i: any) => ({
      ...i,
      rate: i.rate !== null && i.rate !== undefined ? Number(i.rate) : null,
      amount: Number(i.amount),
      includeInGrandTotal: i.includeInGrandTotal !== false,
      sequence: i.sequence ?? 0,
      isOneTime: Boolean(i.isOneTime),
    }));

    const grossWageItem = items.find((i: any) =>
      (i.name || "").toLowerCase().includes("gross wage") ||
      (i.basis || "").toLowerCase().includes("gross wage")
    );
    const otherItems = items.filter((i: any) => i.id !== grossWageItem?.id);

    const checkedItems = otherItems
      .filter((i: any) => i.includeInGrandTotal !== false)
      .sort((a: any, b: any) => (a.sequence ?? 0) - (b.sequence ?? 0));

    const uncheckedItems = otherItems
      .filter((i: any) => i.includeInGrandTotal === false)
      .sort((a: any, b: any) => (a.sequence ?? 0) - (b.sequence ?? 0));

    const grossWagesAmount = grossWageItem ? grossWageItem.amount : 0;
    const checkedAmount = checkedItems.reduce((acc: number, curr: any) => acc + curr.amount, 0);
    const prefundingSubtotal = grossWagesAmount + checkedAmount;
    const uncheckedAmount = uncheckedItems.reduce((acc: number, curr: any) => acc + curr.amount, 0);

    const formatRateVal = (rate: number | null, model: string | null) => {
      if (rate === null || rate === undefined) return "-";
      if (model === "Percentage") return `${rate}%`;
      if (model === "Multiplication") return `x${rate}`;
      if (model === "Division") return `/${rate}`;
      return `$${rate}`;
    };

    const emailSubject = `Prefunding Invoice ${invoiceNumber} for ${practiceName}`;

    const grossWageRowHtml = grossWageItem
      ? `
        <tr style="background-color: #f0fdf4;">
          <td style="padding: 10px 12px; font-family: 'Google Sans', sans-serif; font-size: 12px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #ece8e1;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: #10b981; margin-right: 6px;"></span>
            ${grossWageItem.name}
          </td>
          <td style="padding: 10px 12px; font-family: 'Google Sans', sans-serif; font-size: 11px; color: #475569; border-bottom: 1px solid #ece8e1;">
            <span style="display: inline-block; background-color: #f1f5f9; color: #334155; padding: 2px 8px; border-radius: 4px; font-weight: 500;">Gross Wages</span>
          </td>
          <td style="padding: 10px 12px; font-family: 'Google Sans', sans-serif; font-size: 12px; color: #475569; border-bottom: 1px solid #ece8e1;">Addition</td>
          <td style="padding: 10px 12px; font-family: 'Google Sans', sans-serif; font-size: 12px; color: #475569; border-bottom: 1px solid #ece8e1;">-</td>
          <td align="right" style="padding: 10px 12px; font-family: 'Google Sans', sans-serif; font-size: 12px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #ece8e1;">
            $${grossWageItem.amount.toFixed(2)}
          </td>
          <td align="center" style="padding: 10px 12px; font-family: 'Google Sans', sans-serif; font-size: 10px; border-bottom: 1px solid #ece8e1;">
            <span style="display: inline-block; background-color: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; padding: 2px 6px; border-radius: 4px; font-weight: 600;">Wages</span>
          </td>
        </tr>
      `
      : "";

    const checkedRowsHtml = checkedItems
      .map(
        (item: any) => `
        <tr style="background-color: #ffffff;">
          <td style="padding: 10px 12px; font-family: 'Google Sans', sans-serif; font-size: 12px; font-weight: 600; color: #1e293b; border-bottom: 1px solid #ece8e1;">
            <div>${item.name}</div>
            ${item.notes ? `<div style="font-size: 10px; color: #64748b; font-style: italic; margin-top: 2px;"><span style="font-style: normal; color: #94a3b8;">Note:</span> ${item.notes}</div>` : ""}
          </td>
          <td style="padding: 10px 12px; font-family: 'Google Sans', sans-serif; font-size: 11px; color: #475569; border-bottom: 1px solid #ece8e1;">
            <span style="display: inline-block; background-color: #f1f5f9; color: #334155; padding: 2px 8px; border-radius: 4px; font-weight: 500;">${item.basis || "-"}</span>
          </td>
          <td style="padding: 10px 12px; font-family: 'Google Sans', sans-serif; font-size: 12px; color: #475569; border-bottom: 1px solid #ece8e1;">${item.pricingModel || "-"}</td>
          <td style="padding: 10px 12px; font-family: 'Google Sans', sans-serif; font-size: 12px; color: #475569; border-bottom: 1px solid #ece8e1;">${formatRateVal(item.rate, item.pricingModel)}</td>
          <td align="right" style="padding: 10px 12px; font-family: 'Google Sans', sans-serif; font-size: 12px; font-weight: 600; color: #1e293b; border-bottom: 1px solid #ece8e1;">
            $${item.amount.toFixed(2)}
          </td>
          <td align="center" style="padding: 10px 12px; font-family: 'Google Sans', sans-serif; font-size: 10px; border-bottom: 1px solid #ece8e1;">
            ${
              item.isOneTime
                ? `<span style="display: inline-block; background-color: #fffbeb; color: #b45309; border: 1px solid #fde68a; padding: 2px 6px; border-radius: 4px; font-weight: 600;">One-Time</span>`
                : `<span style="display: inline-block; background-color: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 2px 6px; border-radius: 4px; font-weight: 600;">Template</span>`
            }
          </td>
        </tr>
      `
      )
      .join("");

    const gmsProjectionSubtotalHtml = `
      <tr style="background-color: #f8fafc; border-top: 1px solid #ece8e1;">
        <td colspan="4" align="right" style="padding: 10px 12px; font-family: 'Google Sans', sans-serif; font-size: 11px; color: #334155; font-weight: 600; border-bottom: 1px solid #ece8e1;">
          <div>GMS Projection:</div>
          <div style="font-size: 10px; color: #64748b; font-weight: 400; margin-top: 1px;">
            Gross Wages ($${grossWagesAmount.toFixed(2)}) + Adjustments ($${checkedAmount.toFixed(2)})
          </div>
        </td>
        <td align="right" style="padding: 10px 12px; font-family: 'Google Sans', sans-serif; font-size: 12px; font-weight: 700; color: #4338ca; border-bottom: 1px solid #ece8e1;">
          $${prefundingSubtotal.toFixed(2)}
        </td>
        <td style="border-bottom: 1px solid #ece8e1;"></td>
      </tr>
    `;

    const uncheckedRowsHtml = uncheckedItems
      .map(
        (item: any) => `
        <tr style="background-color: #fcfcfd;">
          <td style="padding: 10px 12px; font-family: 'Google Sans', sans-serif; font-size: 12px; font-weight: 600; color: #1e293b; border-bottom: 1px solid #ece8e1;">
            <div>${item.name}</div>
            ${item.notes ? `<div style="font-size: 10px; color: #64748b; font-style: italic; margin-top: 2px;"><span style="font-style: normal; color: #94a3b8;">Note:</span> ${item.notes}</div>` : ""}
          </td>
          <td style="padding: 10px 12px; font-family: 'Google Sans', sans-serif; font-size: 11px; color: #475569; border-bottom: 1px solid #ece8e1;">
            <span style="display: inline-block; background-color: #f1f5f9; color: #334155; padding: 2px 8px; border-radius: 4px; font-weight: 500;">${item.basis || "Grand Total"}</span>
          </td>
          <td style="padding: 10px 12px; font-family: 'Google Sans', sans-serif; font-size: 12px; color: #475569; border-bottom: 1px solid #ece8e1;">${item.pricingModel || "-"}</td>
          <td style="padding: 10px 12px; font-family: 'Google Sans', sans-serif; font-size: 12px; color: #475569; border-bottom: 1px solid #ece8e1;">${formatRateVal(item.rate, item.pricingModel)}</td>
          <td align="right" style="padding: 10px 12px; font-family: 'Google Sans', sans-serif; font-size: 12px; font-weight: 600; color: #1e293b; border-bottom: 1px solid #ece8e1;">
            $${item.amount.toFixed(2)}
          </td>
          <td align="center" style="padding: 10px 12px; font-family: 'Google Sans', sans-serif; font-size: 10px; border-bottom: 1px solid #ece8e1;">
            ${
              item.isOneTime
                ? `<span style="display: inline-block; background-color: #fffbeb; color: #b45309; border: 1px solid #fde68a; padding: 2px 6px; border-radius: 4px; font-weight: 600;">One-Time</span>`
                : `<span style="display: inline-block; background-color: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 2px 6px; border-radius: 4px; font-weight: 600;">Template</span>`
            }
          </td>
        </tr>
      `
      )
      .join("");

    const grandTotalRowHtml = `
      <tr style="background-color: #ffffff; border-top: 1px solid #e2ded6;">
        <td colspan="4" align="right" style="padding: 12px; font-family: 'Google Sans', sans-serif;">
          <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #4f63ea; letter-spacing: 0.05em;">
            Total Grand Total:
          </div>
          <div style="font-size: 10px; color: #64748b; font-weight: 400; margin-top: 1px;">
            ${
              uncheckedItems.length > 0
                ? `GMS Projection ($${prefundingSubtotal.toFixed(2)}) + Additional Line Items ($${uncheckedAmount.toFixed(2)})`
                : `GMS Projection ($${prefundingSubtotal.toFixed(2)})`
            }
          </div>
        </td>
        <td align="right" style="padding: 12px; font-family: 'Google Sans', sans-serif; font-size: 13px; font-weight: 900; color: #4f63ea;">
          $${subtotalFormatted}
        </td>
        <td></td>
      </tr>
    `;

    const clientFeeRowHtml =
      clientFee > 0
        ? `
      <tr style="background-color: #f8fafc; border-top: 1px solid #ece8e1;">
        <td colspan="4" align="right" style="padding: 10px 12px; font-family: 'Google Sans', sans-serif; font-size: 11px; color: #64748b; font-weight: 600;">
          Payment Processing Fee (${getProcessingFeeDescription(paymentMethod)}):
        </td>
        <td align="right" style="padding: 10px 12px; font-family: 'Google Sans', sans-serif; font-size: 12px; font-weight: 600; color: #0f172a;">
          +$${clientFee.toFixed(2)}
        </td>
        <td></td>
      </tr>
      <tr style="background-color: #eff6ff; border-top: 2px solid #bfdbfe;">
        <td colspan="4" align="right" style="padding: 12px; font-family: 'Google Sans', sans-serif; font-size: 12px; font-weight: 700; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.05em;">
          Final Total Amount Due:
        </td>
        <td align="right" style="padding: 12px; font-family: 'Google Sans', sans-serif; font-size: 15px; font-weight: 900; color: #4f63ea;">
          $${totalAmountFormatted}
        </td>
        <td></td>
      </tr>
    `
        : "";

    const emailBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Prefunding Invoice ${invoiceNumber}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700;900&display=swap" rel="stylesheet">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700;900&display=swap');
    * {
      font-family: 'Google Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    }
    body {
      margin: 0;
      padding: 24px 12px;
      background-color: #f8fafc;
      font-family: 'Google Sans', sans-serif !important;
      -webkit-font-smoothing: antialiased;
    }
  </style>
</head>
<body style="margin: 0; padding: 24px 12px; background-color: #f8fafc; font-family: 'Google Sans', sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    
    <!-- Top Header matching brand bar -->
    <tr>
      <td style="background-color: #0f172a; padding: 22px 30px; text-align: left;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <span style="display: block; font-size: 11px; font-weight: 700; color: #c3a97c; letter-spacing: 0.1em; text-transform: uppercase; font-family: 'Google Sans', sans-serif;">
                TRISTATE MSO • PREFUNDING INVOICE
              </span>
              <h1 style="margin: 4px 0 0 0; color: #ffffff; font-size: 20px; font-weight: 700; font-family: 'Google Sans', sans-serif;">
                ${invoiceNumber}
              </h1>
            </td>
            <td align="right" valign="middle">
              <span style="display: inline-block; background-color: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; font-family: 'Google Sans', sans-serif;">
                Posted
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Main Content Area -->
    <tr>
      <td style="padding: 28px 32px;">
        
        <!-- Practice & Cycle Header (Matches Details Page) -->
        <div style="margin-bottom: 24px;">
          <h2 style="margin: 0; font-size: 22px; font-weight: 700; color: #0f172a; font-family: 'Google Sans', sans-serif;">
            ${practiceName}
          </h2>
          <p style="margin: 6px 0 0 0; font-size: 13px; color: #64748b; font-family: 'Google Sans', sans-serif;">
            Prefunding Cycle: <strong style="color: #334155; font-weight: 600;">${inv.cycle}</strong>
          </p>
        </div>

        <!-- Primary Invoice Details Card (Matches Details Page grid) -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 20px;">
          <tr>
            <td width="50%" style="padding: 14px 18px 10px 18px; vertical-align: top;">
              <span style="display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; font-family: 'Google Sans', sans-serif;">
                Invoice Date
              </span>
              <span style="display: block; font-size: 14px; font-weight: 600; color: #1e293b; margin-top: 3px; font-family: 'Google Sans', sans-serif;">
                ${invoiceDateFormatted}
              </span>
            </td>
            <td width="50%" style="padding: 14px 18px 10px 18px; vertical-align: top;">
              <span style="display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; font-family: 'Google Sans', sans-serif;">
                Due Date
              </span>
              <span style="display: block; font-size: 14px; font-weight: 700; color: #dc2626; margin-top: 3px; font-family: 'Google Sans', sans-serif;">
                ${dueDateFormatted}
              </span>
            </td>
          </tr>
          <tr>
            <td colspan="2" style="padding: 10px 18px 14px 18px; vertical-align: top; border-top: 1px solid #edf2f7;">
              <span style="display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; font-family: 'Google Sans', sans-serif;">
                Recipient (Primary Contact)
              </span>
              <div style="margin-top: 3px;">
                <span style="font-size: 14px; font-weight: 600; color: #1e293b; font-family: 'Google Sans', sans-serif;">
                  ${recipientName || practiceName}
                </span>
                ${recipientEmail ? `<span style="font-size: 12px; color: #64748b; margin-left: 6px; font-family: 'Google Sans', sans-serif;">(${recipientEmail})</span>` : ""}
              </div>
            </td>
          </tr>
          <tr>
            <td colspan="2" style="padding: 14px 18px; border-top: 1px solid #e2e8f0; background-color: #f1f5f9; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-family: 'Google Sans', sans-serif;">
                      Total Invoice Amount
                    </span>
                    ${
                      clientFee > 0
                        ? `<span style="display: block; font-size: 11px; color: #64748b; margin-top: 2px; font-family: 'Google Sans', sans-serif;">Subtotal: $${subtotalFormatted} + Processing Fee: $${clientFee.toFixed(2)}</span>`
                        : ""
                    }
                  </td>
                  <td align="right" valign="middle">
                    <span style="font-size: 20px; font-weight: 900; color: #4f63ea; font-family: 'Google Sans', sans-serif;">
                      $${totalAmountFormatted}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Audit Information Box (Matches Details Page) -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 20px;">
          <tr>
            <td style="padding: 14px 18px;">
              <span style="display: block; font-size: 12px; font-weight: 700; color: #1e293b; font-family: 'Google Sans', sans-serif; margin-bottom: 8px;">
                Audit Information
              </span>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="33%" style="font-size: 11px; font-family: 'Google Sans', sans-serif;">
                    <span style="display: block; color: #94a3b8; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em;">Created By</span>
                    <span style="display: block; font-size: 12px; font-weight: 600; color: #1e293b; margin-top: 2px;">${createdByName}</span>
                  </td>
                  <td width="33%" style="font-size: 11px; font-family: 'Google Sans', sans-serif;">
                    <span style="display: block; color: #94a3b8; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em;">Created Date</span>
                    <span style="display: block; font-size: 12px; font-weight: 600; color: #1e293b; margin-top: 2px;">${createdDateFormatted}</span>
                  </td>
                  <td width="34%" style="font-size: 11px; font-family: 'Google Sans', sans-serif;">
                    <span style="display: block; color: #94a3b8; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em;">Posted Date</span>
                    <span style="display: block; font-size: 12px; font-weight: 600; color: #1e293b; margin-top: 2px;">${postedDateFormatted}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Payment & Stripe Details Box (Shown after Audit Information) -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; margin-bottom: 24px;">
          <tr>
            <td style="padding: 14px 18px;">
              <span style="display: block; font-size: 12px; font-weight: 700; color: #1e3a8a; font-family: 'Google Sans', sans-serif; margin-bottom: 8px;">
                Payment & Stripe Details
              </span>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="50%" style="font-size: 11px; color: #64748b; font-family: 'Google Sans', sans-serif;">
                    <span style="display: block; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8;">Payment Method</span>
                    <span style="display: block; font-size: 13px; font-weight: 600; color: #1e293b; margin-top: 2px;">
                      ${paymentMethod === "CREDIT_CARD" ? "Credit Card (2.9% + $0.30)" : "Bank Transfer (ACH 0.8%)"}
                    </span>
                  </td>
                  <td width="50%" align="right" style="vertical-align: middle;">
                    <a href="${hostedUrl}" target="_blank" style="display: inline-block; background-color: #4f63ea; color: #ffffff; text-decoration: none; padding: 10px 20px; font-size: 12px; font-weight: 700; border-radius: 8px; font-family: 'Google Sans', sans-serif; box-shadow: 0 2px 4px rgba(79, 99, 234, 0.25);">
                      Pay Online / Stripe Invoice &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Line Items & Rates Breakdown Table (Matches Details Page) -->
        <div style="margin-bottom: 24px;">
          <h3 style="margin: 0 0 10px 0; font-size: 13px; font-weight: 700; color: #1e293b; font-family: 'Google Sans', sans-serif;">
            Invoice Line Items & Rates Breakdown
          </h3>
          <div style="border: 1px solid #ece8e1; border-radius: 12px; overflow: hidden;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
              <thead>
                <tr style="background-color: #fbfaf8; border-bottom: 1px solid #ece8e1;">
                  <th align="left" style="padding: 10px 12px; font-family: 'Google Sans', sans-serif; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Rate / Line Item</th>
                  <th align="left" style="padding: 10px 12px; font-family: 'Google Sans', sans-serif; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Basis</th>
                  <th align="left" style="padding: 10px 12px; font-family: 'Google Sans', sans-serif; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Model</th>
                  <th align="left" style="padding: 10px 12px; font-family: 'Google Sans', sans-serif; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Rate</th>
                  <th align="right" style="padding: 10px 12px; font-family: 'Google Sans', sans-serif; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Amount</th>
                  <th align="center" style="padding: 10px 12px; font-family: 'Google Sans', sans-serif; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Type</th>
                </tr>
              </thead>
              <tbody>
                ${grossWageRowHtml}
                ${checkedRowsHtml}
                ${gmsProjectionSubtotalHtml}
                ${uncheckedRowsHtml}
                ${grandTotalRowHtml}
                ${clientFeeRowHtml}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Stripe Pay Button Primary CTA -->
        <div style="text-align: center; margin: 32px 0 20px 0;">
          <a href="${hostedUrl}" target="_blank" style="display: inline-block; background-color: #4f63ea; color: #ffffff; text-decoration: none; padding: 14px 36px; font-size: 14px; font-weight: 700; border-radius: 8px; font-family: 'Google Sans', sans-serif; box-shadow: 0 4px 6px -1px rgba(79, 99, 234, 0.3);">
            Pay Prefunding Invoice with Stripe &rarr;
          </a>
          <p style="text-align: center; font-size: 11px; color: #94a3b8; margin: 8px 0 0 0; font-family: 'Google Sans', sans-serif;">
            Secure online payment powered by Stripe
          </p>
        </div>

        <!-- Attachment notice -->
        <div style="border-top: 1px solid #e2e8f0; padding-top: 18px; margin-top: 24px;">
          <p style="margin: 0; font-size: 12px; color: #64748b; line-height: 1.6; font-family: 'Google Sans', sans-serif;">
            📎 <strong>Official Document:</strong> The complete A4 Prefunding Invoice PDF is attached to this email.<br />
            If you have any questions or require support, please contact our team at <a href="mailto:info@tristatemso.com" style="color: #4f63ea; text-decoration: none; font-weight: 600;">info@tristatemso.com</a>.
          </p>
        </div>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 32px; text-align: center;">
        <p style="margin: 0; font-size: 11px; color: #94a3b8; line-height: 1.5; font-family: 'Google Sans', sans-serif;">
          &copy; ${new Date().getFullYear()} Tristate MSO • 155 Willowbrook Blvd, Ste 110 #3408 Wayne, NJ 07470<br />
          All rights reserved. Prefunding & Management Services.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
`;

    const pdfFileName = `Prefunding-Invoice-${invoiceNumber}.pdf`;

    for (const email of uniqueEmails) {
      try {
        await sendOutlookEmail(email, emailSubject, emailBody, {
          attachments: pdfBuffer
            ? [
                {
                  name: pdfFileName,
                  contentType: "application/pdf",
                  contentBytes: pdfBuffer.toString("base64"),
                },
              ]
            : undefined,
        });
        console.log(`[prefundingStripe] Successfully sent invoice email to ${email}`);
      } catch (emailErr) {
        console.error(`[prefundingStripe] Failed to send invoice email to ${email}:`, emailErr);
      }
    }
  }

  return updatedInvoice;
}
