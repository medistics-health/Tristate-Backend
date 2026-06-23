import PDFDocument from "pdfkit";
import * as path from "path";
import * as fs from "fs";
import { getLogoBuffer } from "./logoHelper";

function formatDate(dateStr?: string | Date | null): string {
  if (!dateStr) return "N/A";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return String(dateStr);
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const y = date.getUTCFullYear();
  return `${m}/${d}/${y}`;
}

function formatCurrency(amount: number, currency: string = "USD"): string {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return formatter.format(amount);
}

interface PdfRow {
  service: string;
  pricingTerm: string;
  rate: string;
  qty: string;
  amount: string;
  isBold?: boolean;
  isDivider?: boolean;
}

function formatPricingTerm(pricingModel?: string): string {
  if (!pricingModel) return "";
  const modelUpper = pricingModel.toUpperCase();
  switch (modelUpper) {
    case "PERCENT_COLLECTIONS":
    case "PERCENT_COLLECTION":
    case "COLLECTIONS":
      return "Collections";
    case "PERCENT_REVENUE":
    case "REVENUE":
      return "Revenue";
    case "PERCENT_PROFIT":
    case "PROFIT":
      return "Profit";
    case "FIXED_MONTHLY":
      return "Fixed Monthly";
    case "FIXED_ONE_TIME":
    case "ONE_TIME_FEE":
    case "FIXED_ONE_TIME_FEE":
      return "One-Time Fee";
    case "RETAINER":
      return "Retainer";
    case "PER_UNIT":
      return "Per Unit";
    case "PER_ENCOUNTER":
      return "Per Encounter";
    case "PER_PATIENT":
      return "Per Patient";
    case "PER_PROVIDER":
      return "Per Provider";
    case "PER_SITE":
      return "Per Site";
    case "PER_CPT_CODE":
      return "Per CPT Code";
    case "TIERED_VOLUME":
      return "Tiered Volume";
    case "CUSTOM_ATTACHMENT_DEFINED":
    case "CUSTOM":
      return "Custom";
    case "HYBRID":
      return "Hybrid";
    case "MONTHLY_MINIMUM":
      return "Monthly Minimum";
    default:
      return pricingModel
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

function cleanComponentType(compType: string, serviceName: string): string {
  let cleaned = compType.trim();
  if (serviceName && cleaned.startsWith(serviceName)) {
    const remainder = cleaned.slice(serviceName.length).trim();
    if (remainder.startsWith("(") && remainder.endsWith(")")) {
      cleaned = remainder.slice(1, -1).trim();
    } else if (remainder.startsWith("-")) {
      cleaned = remainder.slice(1).trim();
    }
  }

  // Strip ending parentheses like (Collections), (Encounters), (Patients)
  cleaned = cleaned.replace(/\s*\([^)]*\)\s*$/, "").trim();

  const upper = cleaned.toUpperCase();
  if (upper.includes("PERCENT_COLLECTIONS") || upper.includes("PERCENT COLLECTIONS") || upper === "COLLECTIONS") {
    return "% Collections";
  }
  if (upper.includes("PERCENT_REVENUE") || upper.includes("PERCENT REVENUE") || upper === "REVENUE") {
    return "% Revenue";
  }
  if (upper.includes("PERCENT_PROFIT") || upper.includes("PERCENT PROFIT") || upper === "PROFIT") {
    return "% Profit";
  }
  return formatPricingTerm(cleaned);
}

function formatRate(rate: number, pricingModel?: string, currencySymbol: string = "USD"): string {
  if (rate == null) return "";
  const modelUpper = (pricingModel || "").toUpperCase();
  if (
    modelUpper.includes("PERCENT") ||
    modelUpper.includes("COLLECTIONS") ||
    modelUpper.includes("REVENUE") ||
    modelUpper.includes("PROFIT") ||
    modelUpper.includes("SUCCESS") ||
    modelUpper === "SUCCESS_FEE"
  ) {
    const val = rate <= 1 && rate > 0 ? Math.round(rate * 100) : rate;
    return `${val}%`;
  }
  // Remove suffixes like /unit, /encounter, etc. Show only currency or percentage.
  return formatCurrency(rate, currencySymbol);
}

function calculateRowsForLineItem(lineItem: any, currencySymbol: string = "USD"): PdfRow[] {
  const rows: PdfRow[] = [];
  const serviceName = lineItem.description || "Service";

  if (!lineItem.hasDetails) {
    rows.push({
      service: serviceName,
      pricingTerm: "",
      rate: formatCurrency(lineItem.unitPrice, currencySymbol),
      qty: String(lineItem.quantity),
      amount: formatCurrency(lineItem.totalPrice, currencySymbol),
    });
    return rows;
  }

  const pricingModel = lineItem.pricingModel || "";
  const components = lineItem.components || [];

  // Check for PERCENT_COLLECTIONS breakdown
  if (
    pricingModel === "PERCENT_COLLECTIONS" ||
    pricingModel === "PERCENT_REVENUE" ||
    pricingModel === "PERCENT_PROFIT" ||
    pricingModel === "SUCCESS_FEE"
  ) {
    const comp = components[0];
    const rateVal = comp?.rate != null ? comp.rate : (lineItem.unitPrice || 0);

    const metricKeyToCheck = pricingModel === "PERCENT_COLLECTIONS" || pricingModel === "SUCCESS_FEE"
      ? "collections"
      : (pricingModel === "PERCENT_REVENUE" ? "revenue" : "profit");

    const matchedInputs = (lineItem.capturedInputs || []).filter(
      (input: any) => input.key === metricKeyToCheck
    );

    if (matchedInputs.length > 0) {
      let baseAmount = 0;
      let isFirst = true;
      for (const input of matchedInputs) {
        const qtyVal = Number(input.value) || 0;
        const amountVal = qtyVal * rateVal;
        baseAmount += amountVal;

        const friendlyLabel = input.label || (isFirst ? formatPricingTerm(pricingModel) : `${formatPricingTerm(pricingModel)} Line`);

        rows.push({
          service: isFirst ? serviceName : "",
          pricingTerm: friendlyLabel,
          rate: formatRate(rateVal, pricingModel, currencySymbol),
          qty: String(qtyVal),
          amount: formatCurrency(amountVal, currencySymbol),
        });
        isFirst = false;
      }

      const adjustment = (lineItem.totalPrice || 0) - baseAmount;
      if (Math.abs(adjustment) >= 0.01) {
        const adjustmentLabel = adjustment > 0 ? "Minimum Fee Adjustment" : "Maximum Fee Adjustment";
        rows.push({
          service: "",
          pricingTerm: adjustmentLabel,
          rate: "",
          qty: "",
          amount: formatCurrency(adjustment, currencySymbol),
        });
      }

      rows.push({
        service: "",
        pricingTerm: "",
        rate: "",
        qty: "",
        amount: formatCurrency(lineItem.totalPrice || 0, currencySymbol),
        isBold: true,
        isDivider: true,
      });

      return rows;
    }
  }

  if (pricingModel === "HYBRID" || pricingModel === "PER_CPT_CODE") {
    let baseAmount = 0;
    let isFirstComp = true;
    for (const comp of components) {
      baseAmount += comp.clientValue || 0;
      const compLabel = cleanComponentType(comp.type || "", serviceName);
      
      rows.push({
        service: isFirstComp ? serviceName : "",
        pricingTerm: compLabel,
        rate: formatRate(comp.rate, comp.type || pricingModel, currencySymbol),
        qty: String(comp.quantity != null ? comp.quantity : ""),
        amount: formatCurrency(comp.clientValue || 0, currencySymbol),
      });
      isFirstComp = false;
    }

    const adjustment = (lineItem.totalPrice || 0) - baseAmount;
    if (Math.abs(adjustment) >= 0.01) {
      const adjustmentLabel = adjustment > 0 ? "Minimum Fee Adjustment" : "Maximum Fee Adjustment";
      rows.push({
        service: "",
        pricingTerm: adjustmentLabel,
        rate: "",
        qty: "",
        amount: formatCurrency(adjustment, currencySymbol),
      });
    }

    rows.push({
      service: "",
      pricingTerm: "",
      rate: "",
      qty: "",
      amount: formatCurrency(lineItem.totalPrice || 0, currencySymbol),
      isBold: true,
      isDivider: true,
    });

  } else {
    const comp = components[0];
    const rateVal = comp?.rate != null ? comp.rate : (lineItem.unitPrice || 0);
    const qtyVal = comp?.quantity != null ? comp.quantity : (lineItem.quantity || 0);
    const baseAmount = comp?.clientValue != null ? comp.clientValue : (qtyVal * rateVal);

    rows.push({
      service: serviceName,
      pricingTerm: formatPricingTerm(pricingModel),
      rate: formatRate(rateVal, pricingModel, currencySymbol),
      qty: String(qtyVal),
      amount: formatCurrency(baseAmount, currencySymbol),
    });

    const adjustment = (lineItem.totalPrice || 0) - baseAmount;
    if (Math.abs(adjustment) >= 0.01) {
      const adjustmentLabel = adjustment > 0 ? "Minimum Fee Adjustment" : "Maximum Fee Adjustment";
      rows.push({
        service: "",
        pricingTerm: adjustmentLabel,
        rate: "",
        qty: "",
        amount: formatCurrency(adjustment, currencySymbol),
      });
    }

    rows.push({
      service: "",
      pricingTerm: "",
      rate: "",
      qty: "",
      amount: formatCurrency(lineItem.totalPrice || 0, currencySymbol),
      isBold: true,
      isDivider: true,
    });
  }

  return rows;
}

function calculateRowHeight(row: PdfRow, doc: any): number {
  const serviceHeight = doc.heightOfString(row.service || "", { width: 170 });
  const pricingTermHeight = doc.heightOfString(row.pricingTerm || "", { width: 130 });
  return Math.max(serviceHeight, pricingTermHeight, 12) + 8;
}


export interface ReceiptLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  hasDetails?: boolean;
  vendorName?: string;
  agreementPeriod?: string;
  serviceTermPeriod?: string;
  pricingModel?: string;
  minimumFee?: number;
  maximumFee?: number;
  vendorCost?: number;
  margin?: number;
  components?: {
    type: string;
    clientValue: number;
    vendorValue?: number;
    rate?: number;
    quantity?: number;
  }[];
  capturedInputs?: {
    key: string;
    value: string | number;
  }[];
  exceptionFlags?: string[];
}

export interface ReceiptData {
  receiptNumber: string | null;
  invoiceNumber: string | null;
  receiptDate: Date;
  paidDate: Date;
  totalAmount: number;
  paidAmount: number;
  currency: string | null;
  paymentMethod: string; // 'stripe', 'credit_card', 'ach', 'check', etc.
  paymentDetails?: {
    last4Digits?: string;
    cardBrand?: string;
    bankName?: string;
    achType?: string; // 'ach_debit' or 'ach_credit'
  };
  practiceInfo: {
    name: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    email?: string;
    phone?: string;
  };
  lineItems: ReceiptLineItem[];
  logoBuffer?: Buffer | null;
}

export function generateReceiptPdfBuffer(receiptData: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: "A4" });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err) => reject(err));
      doc.on("pageAdded", () => {
        doc.rect(0, 0, 595.28, 5).fill("#10B981");
      });

      // Register Google Sans Fonts
      const regularFont = path.join(__dirname, "../assets/fonts/GoogleSans-Regular.ttf");
      const boldFont = path.join(__dirname, "../assets/fonts/GoogleSans-Bold.ttf");
      const mediumFont = path.join(__dirname, "../assets/fonts/GoogleSans-Medium.ttf");

      let hasFonts = false;
      if (fs.existsSync(regularFont)) {
        doc.registerFont("GoogleSans", regularFont);
        doc.font("GoogleSans");
        hasFonts = true;
      } else {
        doc.font("Helvetica");
      }

      if (fs.existsSync(boldFont)) {
        doc.registerFont("GoogleSans-Bold", boldFont);
      }
      if (fs.existsSync(mediumFont)) {
        doc.registerFont("GoogleSans-Medium", mediumFont);
      }

      // Add top border
      doc.rect(0, 0, 595.28, 5).fill("#10B981"); // Green for receipt

      // 1. Page Header (Page 1 of 1 at top right)
      doc.fontSize(8).fillColor("#9CA3AF");
      const pageNumFont = hasFonts ? "GoogleSans" : "Helvetica";
      doc.font(pageNumFont).text("Page 1 of 1", 0, 20, { width: 555, align: "right" });

      // 2. Company Info (Left Side) & Company Logo (Right Side)
      const companyName = receiptData.practiceInfo.name || "Tristate MSO";
      const addressLine1 = receiptData.practiceInfo.address || "N/A";
      const addressLine2 = `${receiptData.practiceInfo.city || ""}, ${receiptData.practiceInfo.state || ""} ${receiptData.practiceInfo.zipCode || ""}`.trim();
      const companyEmail = receiptData.practiceInfo.email || "billing@tristatehealth.com";
      const companyPhone = receiptData.practiceInfo.phone || "";

      doc.fontSize(9.5).fillColor("#1F2937");
      const bodyFont = hasFonts ? "GoogleSans" : "Helvetica";
      const boldTextFont = hasFonts ? "GoogleSans-Bold" : "Helvetica-Bold";
      const mediumTextFont = hasFonts ? "GoogleSans-Medium" : "Helvetica";

      // Draw Company Info on the Left
      doc.font(mediumTextFont).text(companyName, 40, 35);
      doc.font(bodyFont).text(addressLine1, 40, 48);
      if (addressLine2) {
        doc.text(addressLine2, 40, 61);
        doc.text(companyEmail, 40, 74);
        if (companyPhone) {
          doc.text(companyPhone, 40, 87);
        }
      } else {
        doc.text(companyEmail, 40, 61);
        if (companyPhone) {
          doc.text(companyPhone, 40, 74);
        }
      }

      // Draw Logo on the Right (if exists)
      if (receiptData.logoBuffer) {
        try {
          doc.image(receiptData.logoBuffer, 425, 35, { width: 130 });
        } catch (logoErr) {
          console.warn("Failed to render logo in receipt PDF, drawing without logo:", logoErr);
        }
      }

      // Set fixed offsetY for subsequent sections since logo is side-by-side
      const offsetY = 95;

      // 3. Document Title ("PAYMENT RECEIPT") with status badge
      doc.font(boldTextFont).fontSize(22).fillColor("#111827").text("PAYMENT RECEIPT", 40, 32 + offsetY);

      // Add green PAID badge
      doc.save();
      doc.fillColor("#D1F2DF"); // Light green background
      doc.roundedRect(240, 33 + offsetY, 52, 17, 4).fill();
      doc.font(boldTextFont).fontSize(9).fillColor("#10B981").text("PAID", 250, 37 + offsetY); // Green text
      doc.restore();

      // 4. Metadata section (Receipt Number, Invoice Number, Dates)
      const metaY = 70 + offsetY;

      // Column 1: Receipt Number
      const receiptNumber = receiptData.receiptNumber || "N/A";
      doc.font(boldTextFont).fontSize(8.5).fillColor("#4B5563").text("Receipt Number", 40, metaY);
      doc.font(bodyFont).fontSize(11).fillColor("#1F2937").text(receiptNumber, 40, metaY + 14);

      // Column 2: Invoice Number
      const invoiceNumber = receiptData.invoiceNumber || "N/A";
      doc.font(boldTextFont).fontSize(8.5).fillColor("#4B5563").text("Invoice Number", 210, metaY);
      doc.font(bodyFont).fontSize(11).fillColor("#1F2937").text(invoiceNumber, 210, metaY + 14);

      // Column 3: Receipt Date
      const receiptDate = formatDate(receiptData.receiptDate);
      doc.font(boldTextFont).fontSize(8.5).fillColor("#4B5563").text("Receipt Date", 360, metaY);
      doc.font(bodyFont).fontSize(11).fillColor("#1F2937").text(receiptDate, 360, metaY + 14);

      // Column 4: Payment Date
      const paidDate = formatDate(receiptData.paidDate);
      doc.font(boldTextFont).fontSize(8.5).fillColor("#10B981").text("Payment Date", 475, metaY);
      doc.font(bodyFont).fontSize(11).fillColor("#10B981").text(paidDate, 475, metaY + 14);

      // 5. Payment Method Section
      let paymentMethodExtraHeight = 0;
      const paymentMethodY = metaY + 40;

      // Build payment method display
      let paymentMethodText = "Stripe";
      let paymentDetails = "";

      if (receiptData.paymentMethod.toLowerCase() === "stripe" || receiptData.paymentMethod.toLowerCase() === "credit_card") {
        if (receiptData.paymentDetails?.cardBrand && receiptData.paymentDetails?.last4Digits) {
          paymentMethodText = `${receiptData.paymentDetails.cardBrand} ••••`;
          paymentDetails = receiptData.paymentDetails.last4Digits;
        } else {
          paymentMethodText = "Credit Card";
        }
      } else if (receiptData.paymentMethod.toLowerCase() === "ach") {
        paymentMethodText = "Bank Transfer (ACH)";
        if (receiptData.paymentDetails?.bankName) {
          paymentDetails = receiptData.paymentDetails.bankName;
        }
      } else if (receiptData.paymentMethod.toLowerCase() === "check") {
        paymentMethodText = "Check";
        if (receiptData.paymentDetails?.last4Digits) {
          paymentDetails = `Check #${receiptData.paymentDetails.last4Digits}`;
        }
      }

      // Draw Payment Method box
      doc.rect(40, paymentMethodY - 5, 200, 50).fill("#F0F9FF"); // Light blue background
      doc.font(boldTextFont).fontSize(8.5).fillColor("#4B5563").text("PAYMENT METHOD", 50, paymentMethodY);
      doc.font(boldTextFont).fontSize(12).fillColor("#0369A1").text(paymentMethodText, 50, paymentMethodY + 14);
      if (paymentDetails) {
        doc.font(bodyFont).fontSize(9).fillColor("#4B5563").text(paymentDetails, 50, paymentMethodY + 28);
      }
      paymentMethodExtraHeight = 60;

      // 6. Amount Information
      const amountY = paymentMethodY + paymentMethodExtraHeight;
      doc.font(boldTextFont).fontSize(8.5).fillColor("#4B5563").text("AMOUNT PAID", 40, amountY);
      const currencyCode = receiptData.currency?.toUpperCase() || "USD";
      doc.font(boldTextFont).fontSize(14).fillColor("#10B981").text(
        formatCurrency(receiptData.paidAmount, currencyCode),
        40,
        amountY + 14
      );

      // 7. Line Items Table
      let y = amountY + 50;

      const drawTableHeader = (posY: number) => {
        doc.rect(40, posY - 5, 515, 20).fill("#F3F4F6"); // Header background
        doc.fillColor("#4B5563");
        doc.font(boldTextFont).fontSize(8);
        doc.text("SERVICES", 44, posY);
        doc.text("CHARGE TYPE", 224, posY);
        doc.text("RATE", 364, posY, { width: 65, align: "right" });
        doc.text("QTY/COLLECTION", 439, posY, { width: 70, align: "right" });
        doc.text("AMOUNT", 484, posY, { width: 66, align: "right" });
      };

      drawTableHeader(y);
      y += 20;

      // Filter and display line items
      const lineItems = receiptData.lineItems || [];

      if (lineItems.length === 0) {
        doc.font(bodyFont).fontSize(9).fillColor("#9CA3AF");
        doc.text("No line items provided", 40, y);
        y += 20;
      } else {
        const currencySymbol = currencyCode;
        const pdfRows: PdfRow[] = [];
        for (const lineItem of lineItems) {
          pdfRows.push(...calculateRowsForLineItem(lineItem, currencySymbol));
        }

        for (const row of pdfRows) {
          const rowHeight = calculateRowHeight(row, doc);

          if (y + rowHeight > 750) {
            doc.addPage();
            y = 50;
            drawTableHeader(y);
            y += 20;
          }

          const fontToUse = row.isBold ? boldTextFont : bodyFont;
          const fontSizeToUse = row.isBold ? 9 : 8.5;
          const textColor = row.isBold ? "#111827" : "#4B5563";

          doc.font(fontToUse).fontSize(fontSizeToUse).fillColor(textColor);

          // Col 1: SERVICES (x=44, width=170)
          doc.text(row.service || "", 44, y + 4, { width: 170 });

          // Col 2: PRICING TERMS (x=224, width=100)
          doc.text(row.pricingTerm || "", 224, y + 4, { width: 100 });

          // Col 3: RATE (x=364, width=65, align right)
          doc.text(row.rate || "", 364, y + 4, { width: 65, align: "right" });

          // Col 4: QTY (x=439, width=70, align right)
          doc.text(row.qty || "", 439, y + 4, { width: 70, align: "right" });

          // Col 5: AMOUNT (x=484, width=66, align right)
          doc.text(row.amount || "", 484, y + 4, { width: 66, align: "right" });

          if (row.isDivider) {
            doc.moveTo(40, y + rowHeight - 2)
              .lineTo(555, y + rowHeight - 2)
              .strokeColor("#E5E7EB")
              .lineWidth(0.5)
              .stroke();
          }

          y += rowHeight;
        }
      }

      // Summary Card
      y += 20;
      const summaryX = 350;
      const valueX = 460;
      const valueWidth = 95;

      doc.font(boldTextFont).fontSize(12).fillColor("#10B981");
      doc.text("GRAND TOTAL", summaryX, y);
      doc.text(formatCurrency(receiptData.paidAmount, currencyCode), valueX, y, { width: valueWidth, align: "right" });

      // Footer section
      y += 40;
      doc.moveTo(40, y).lineTo(555, y).strokeColor("#E5E7EB").lineWidth(1).stroke();

      // Company footer details
      y += 15;
      doc.font(bodyFont).fontSize(8).fillColor("#6B7280");
      doc.text(companyEmail, 40, y);
      if (companyPhone) {
        doc.text(companyPhone, 40, y + 12);
      }

      // Receipt note
      y += 30;
      doc.font(bodyFont).fontSize(8).fillColor("#9CA3AF");
      doc.text(
        `This is a payment receipt for Invoice ${invoiceNumber}. Payment was processed via ${paymentMethodText} on ${paidDate}.`,
        40,
        y,
        { width: 515 }
      );

      y += 20;
      doc.text(
        `© ${new Date().getFullYear()} ${companyName}. All rights reserved. This receipt was generated on ${formatDate(new Date())}.`,
        40,
        y,
        { width: 515, align: "center" }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export async function generateReceiptPdfBufferFromDb(
  invoiceId: string,
  paymentMethod: string,
  paymentDetails?: any,
  prismaClient?: any
): Promise<Buffer> {
  if (!prismaClient) {
    throw new Error("Prisma client is required to generate receipt PDF");
  }

  const invoice = await prismaClient.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      practice: {
        include: { company: true },
      },
      lineItems: {
        include: {
          service: true,
          billingRunItem: {
            include: {
              vendor: true,
              agreementServiceTerm: {
                include: {
                  agreement: true,
                  agreementVersion: true,
                },
              },
              components: true,
              billingRun: {
                include: {
                  inputSnapshots: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found`);
  }

  // Helper to format dates
  const formatDateRange = (start?: Date | string | null, end?: Date | string | null): string => {
    if (!start && !end) return "—";
    return `${formatDate(start)} - ${formatDate(end)}`;
  };

  // Group line items by billingRunItemId to handle hybrid / service details
  const groupedItems = new Map<string, { billingRunItem: any; service: any; lineItems: any[] }>();
  const manualItems: any[] = [];

  for (const item of invoice.lineItems || []) {
    if (item.billingRunItemId && item.billingRunItem) {
      if (!groupedItems.has(item.billingRunItemId)) {
        groupedItems.set(item.billingRunItemId, {
          billingRunItem: item.billingRunItem,
          service: item.service,
          lineItems: [],
        });
      }
      groupedItems.get(item.billingRunItemId)!.lineItems.push(item);
    } else {
      manualItems.push(item);
    }
  }

  const lineItems: ReceiptLineItem[] = [];

  // Map grouped billing run items
  for (const group of groupedItems.values()) {
    const { billingRunItem, service, lineItems: grpLineItems } = group;
    const totalPrice = grpLineItems.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0);

    // Get captured inputs for this service
    const capturedInputs = (billingRunItem.billingRun?.inputSnapshots || [])
      .filter(
        (snap: any) =>
          snap.serviceId === service.id &&
          (!snap.sourceReference ||
            snap.sourceReference === billingRunItem.agreementServiceTermId),
      )
      .map((snap: any) => ({
        key: snap.metricKey,
        value: snap.metricValue,
        label: snap.metricTextValue,
      }));

    // Agreement Period
    const agreementPeriod = formatDateRange(
      billingRunItem.agreementServiceTerm?.agreementVersion?.effectiveDate ??
        billingRunItem.agreementServiceTerm?.agreement?.effectiveDate,
      billingRunItem.agreementServiceTerm?.agreementVersion?.endDate ??
        billingRunItem.agreementServiceTerm?.agreement?.terminationDate ??
        billingRunItem.agreementServiceTerm?.agreement?.renewalDate
    );

    // Service Term Period
    const serviceTermPeriod = formatDateRange(
      billingRunItem.agreementServiceTerm?.effectiveDate,
      billingRunItem.agreementServiceTerm?.endDate
    );

    // Formula snap
    const formulaSnap = (billingRunItem.formulaSnapshot || {}) as any;

    // Components
    const components = grpLineItems.map((line: any) => {
      // Find matching BillingRunItemComponent
      const dbComp = (billingRunItem.components || []).find(
        (c: any) =>
          c.description === line.description ||
          c.componentType === line.description ||
          (line.description && c.componentType && line.description.includes(c.componentType)) ||
          (line.description && c.componentType && c.componentType.includes(line.description))
      );

      const rateVal = dbComp?.rate != null ? Number(dbComp.rate) : Number(line.unitPrice);
      const qtyVal = dbComp?.quantity != null ? Number(dbComp.quantity) : Number(line.quantity);

      // Find matching vendor component from vendorPricing snapshot
      let vendorValue: number | undefined;
      try {
        if (formulaSnap.vendorPricing?.components && Array.isArray(formulaSnap.vendorPricing.components)) {
          const clientComps = Array.isArray(formulaSnap.components) ? formulaSnap.components : [];
          const cIdx = clientComps.findIndex((c: any) => c.type === line.description);
          if (cIdx !== -1 && formulaSnap.vendorPricing.components[cIdx]) {
            vendorValue = parseFloat(formulaSnap.vendorPricing.components[cIdx].value) || 0;
          }
        }
      } catch (e) {
        // Fallback
      }
      return {
        type: line.description || service.name,
        clientValue: Number(line.totalPrice || 0),
        vendorValue,
        rate: rateVal,
        quantity: qtyVal,
      };
    });

    lineItems.push({
      description: service.name,
      quantity: 1,
      unitPrice: totalPrice,
      totalPrice,
      hasDetails: true,
      vendorName: billingRunItem.vendor?.name,
      agreementPeriod,
      serviceTermPeriod,
      pricingModel: formulaSnap.pricingModel,
      minimumFee: formulaSnap.minimumFee != null ? Number(formulaSnap.minimumFee) : undefined,
      maximumFee: formulaSnap.maximumFee != null ? Number(formulaSnap.maximumFee) : undefined,
      vendorCost: billingRunItem.vendorAmount != null ? Number(billingRunItem.vendorAmount) : undefined,
      margin: billingRunItem.marginAmount != null ? Number(billingRunItem.marginAmount) : undefined,
      components,
      capturedInputs,
      exceptionFlags: billingRunItem.exceptionFlags || [],
    });
  }

  // Map manual items
  for (const item of manualItems) {
    lineItems.push({
      description: item.description || item.service?.name || "Service",
      quantity: item.quantity || 1,
      unitPrice: Number(item.unitPrice || 0),
      totalPrice: Number(item.totalPrice || 0),
    });
  }

  const practiceInfo = {
    name: invoice.practice?.name || "Tristate MSO",
    address: invoice.practice?.company?.address || "",
    city: invoice.practice?.company?.city || "",
    state: invoice.practice?.company?.state || "",
    zipCode: invoice.practice?.company?.zipCode || "",
    email: invoice.practice?.company?.email || "",
    phone: invoice.practice?.company?.phone || "",
  };

  const logoBuffer = await getLogoBuffer();

  const receiptData: ReceiptData = {
    receiptNumber: `RCP-${invoice.invoiceNumber || invoice.id.slice(0, 8)}`,
    invoiceNumber: invoice.invoiceNumber,
    receiptDate: new Date(),
    paidDate: new Date(),
    totalAmount: Number(invoice.totalAmount || 0),
    paidAmount: Number(invoice.totalAmount || 0),
    currency: invoice.currency || "USD",
    paymentMethod,
    paymentDetails,
    practiceInfo,
    lineItems,
    logoBuffer,
  };

  return generateReceiptPdfBuffer(receiptData);
}
