import PDFDocument from "pdfkit";
import * as path from "path";
import * as fs from "fs";
import { getLogoBuffer } from "./logoHelper";

export interface PrefundingPdfData {
  invoiceNumber: string;
  invoiceDate: string | Date;
  dueDate: string | Date;
  cycle: string;
  totalAmount: number;
  subtotalAmount?: number;
  processingFeeAmount?: number;
  processingFeeDescription?: string;
  status: string;
  paymentMethod?: string | null;
  paidDate?: string | Date | null;
  practice: {
    name: string;
    addressLine1?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
    phone?: string | null;
    emails?: string[];
  };
  recipientName?: string;
  recipientEmail?: string;
  lineItems: {
    name: string;
    basis?: string | null;
    pricingModel?: string | null;
    rate?: number | string | null;
    amount: number;
    notes?: string | null;
    includeInGrandTotal?: boolean;
    sequence?: number;
  }[];
}

function formatDate(dateStr?: string | Date | null): string {
  if (!dateStr) return "N/A";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return String(dateStr);
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const y = date.getUTCFullYear();
  return `${m}/${d}/${y}`;
}

function formatRate(rate?: number | string | null, model?: string | null): string {
  if (rate == null || rate === "") return "-";
  const num = Number(rate);
  const m = (model || "").toLowerCase();
  if (m === "percentage") return `${num}%`;
  if (m === "multiplication") return `x${num}`;
  if (m === "division") return `/${num}`;
  return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function generatePrefundingInvoicePdfBuffer(data: PrefundingPdfData): Promise<Buffer> {
  const logoBuffer = await getLogoBuffer();

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: "A4" });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err) => reject(err));

      // Register Google Sans Fonts if available, else Helvetica
      const regularFont = path.join(__dirname, "../assets/fonts/GoogleSans-Regular.ttf");
      const boldFont = path.join(__dirname, "../assets/fonts/GoogleSans-Bold.ttf");
      const mediumFont = path.join(__dirname, "../assets/fonts/GoogleSans-Medium.ttf");

      let hasFonts = false;
      if (fs.existsSync(regularFont)) {
        doc.registerFont("MainFont", regularFont);
        doc.font("MainFont");
        hasFonts = true;
      } else {
        doc.font("Helvetica");
      }
      if (fs.existsSync(boldFont)) doc.registerFont("MainFont-Bold", boldFont);
      if (fs.existsSync(mediumFont)) doc.registerFont("MainFont-Medium", mediumFont);

      const fBold = hasFonts && fs.existsSync(boldFont) ? "MainFont-Bold" : "Helvetica-Bold";
      const fMedium = hasFonts && fs.existsSync(mediumFont) ? "MainFont-Medium" : "Helvetica-Bold";
      const fRegular = hasFonts ? "MainFont" : "Helvetica";

      // 1. Top Decorative Brand Bar (Gold)
      doc.rect(0, 0, 595.28, 6).fill("#c3a97c");

      // 2. Header Area
      const startY = 35;
      
      // Logo on Right
      if (logoBuffer) {
        try {
          doc.image(logoBuffer, 415, startY, { fit: [140, 50], align: "right" });
        } catch {
          doc.font(fBold).fontSize(16).fillColor("#1e293b").text("TRISTATE MSO", 415, startY, { align: "right" });
        }
      } else {
        doc.font(fBold).fontSize(16).fillColor("#1e293b").text("TRISTATE MSO", 415, startY, { align: "right" });
      }

      // Title on Left
      const isPaidDoc = (data.status || "").toUpperCase() === "PAID";
      doc.font(fBold).fontSize(20).fillColor("#0f172a").text(isPaidDoc ? "PREFUNDING PAYMENT RECEIPT" : "PREFUNDING INVOICE", 40, startY);
      doc.font(fMedium).fontSize(10).fillColor("#64748b").text(isPaidDoc ? `RECEIPT #: ${data.invoiceNumber}` : `INVOICE #: ${data.invoiceNumber}`, 40, startY + 26);

      // Status pill badge under title
      const statusText = (data.status || "DRAFT").toUpperCase();
      let statusColor = "#64748b";
      let statusBg = "#f1f5f9";
      if (statusText === "PAID") {
        statusColor = "#15803d";
        statusBg = "#dcfce7";
      } else if (statusText === "POSTED") {
        statusColor = "#0f766e";
        statusBg = "#ccfbf1";
      } else if (statusText === "APPROVED") {
        statusColor = "#1e40af";
        statusBg = "#dbeafe";
      } else if (statusText.includes("PENDING")) {
        statusColor = "#854d0e";
        statusBg = "#fef9c3";
      }

      doc.roundedRect(40, startY + 44, 90, 18, 4).fill(statusBg);
      doc.font(fBold).fontSize(8).fillColor(statusColor).text(statusText, 40, startY + 49, { width: 90, align: "center" });

      // Horizontal Separator
      doc.moveTo(40, startY + 75).lineTo(555, startY + 75).lineWidth(1).strokeColor("#e2e8f0").stroke();

      // 3. Information Grid (Billed To vs Invoice Summary)
      const gridY = startY + 88;

      // Left Box: BILLED TO (Practice & First Person)
      doc.font(fBold).fontSize(9).fillColor("#94a3b8").text("BILLED TO", 40, gridY);
      doc.font(fBold).fontSize(13).fillColor("#0f172a").text(data.practice.name, 40, gridY + 14);

      let personY = gridY + 32;
      if (data.recipientName) {
        doc.font(fMedium).fontSize(9.5).fillColor("#334155").text(`Attention: ${data.recipientName}`, 40, personY);
        personY += 14;
      }
      if (data.recipientEmail) {
        doc.font(fRegular).fontSize(9).fillColor("#64748b").text(data.recipientEmail, 40, personY);
        personY += 13;
      }

      const addressLine = [data.practice.city, data.practice.state, data.practice.zipCode].filter(Boolean).join(", ");
      if (data.practice.addressLine1 || addressLine) {
        if (data.practice.addressLine1) {
          doc.font(fRegular).fontSize(8.5).fillColor("#64748b").text(data.practice.addressLine1, 40, personY);
          personY += 12;
        }
        if (addressLine) {
          doc.font(fRegular).fontSize(8.5).fillColor("#64748b").text(addressLine, 40, personY);
          personY += 12;
        }
      }

      // Right Box: INVOICE DETAILS (Expanded width: rightX 315 to 555 = 240 width)
      const rightX = 315;
      const rightWidth = 240;
      doc.font(fBold).fontSize(9).fillColor("#94a3b8").text("INVOICE DETAILS", rightX, gridY);

      const meta = [
        { label: "Invoice Date:", val: formatDate(data.invoiceDate) },
        { label: "Payment Due Date:", val: formatDate(data.dueDate) },
        { label: "Prefunding Cycle:", val: data.cycle || "N/A" },
        ...(data.paymentMethod ? [{ label: "Payment Method:", val: data.paymentMethod }] : []),
        ...(data.paidDate ? [{ label: "Paid Date:", val: formatDate(data.paidDate) }] : []),
        ...(isPaidDoc && !data.paidDate ? [{ label: "Paid Date:", val: formatDate(new Date()) }] : [])
      ];

      let metaY = gridY + 16;
      for (const m of meta) {
        doc.font(fRegular).fontSize(9).fillColor("#64748b").text(m.label, rightX, metaY);
        doc.font(fMedium).fontSize(9).fillColor("#0f172a").text(m.val, rightX + 115, metaY, { align: "right", width: rightWidth - 115 });
        metaY += 16;
      }

      // Total Due Highlight Card
      // Total Due / Paid Highlight Card
      doc.roundedRect(rightX, metaY + 6, rightWidth, 34, 6).fill(isPaidDoc ? "#f0fdf4" : "#f8fafc");
      doc.rect(rightX, metaY + 6, 4, 34).fill(isPaidDoc ? "#16a34a" : "#4f63ea");
      doc.font(fRegular).fontSize(8.5).fillColor(isPaidDoc ? "#166534" : "#64748b").text(isPaidDoc ? "Total Amount Paid" : "Total Amount Due", rightX + 14, metaY + 12);
      doc.font(fBold).fontSize(14).fillColor(isPaidDoc ? "#15803d" : "#1e293b").text(
        `$${data.totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        rightX + 14,
        metaY + 23
      );

      // 4. Line Items Table
      const tableTop = Math.max(personY + 20, metaY + 55);

      // Table Header
      doc.roundedRect(40, tableTop, 515, 24, 4).fill("#f1f5f9");
      doc.font(fBold).fontSize(8.5).fillColor("#475569");
      doc.text("#", 48, tableTop + 7, { width: 25 });
      doc.text("LINE ITEM / DESCRIPTION", 75, tableTop + 7, { width: 200 });
      doc.text("BASIS", 280, tableTop + 7, { width: 75 });
      doc.text("PRICING MODEL", 360, tableTop + 7, { width: 85 });
      doc.text("RATE", 450, tableTop + 7, { width: 45 });
      doc.text("AMOUNT", 495, tableTop + 7, { width: 55, align: "right" });

      let currentY = tableTop + 28;
      const rawItems = data.lineItems || [];

      // Sort: Gross Wages first, then checked items by sequence, then unchecked items by sequence
      const grossWageItem = rawItems.find((i) =>
        (i.name || "").toLowerCase().includes("gross wage") ||
        (i.basis || "").toLowerCase().includes("gross wage")
      );
      const otherItems = rawItems.filter((i) => i !== grossWageItem);
      const checkedItems = otherItems
        .filter((i) => i.includeInGrandTotal !== false)
        .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
      const uncheckedItems = otherItems
        .filter((i) => i.includeInGrandTotal === false)
        .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));

      const grossWagesAmount = grossWageItem ? Number(grossWageItem.amount) : 0;
      const checkedAmount = checkedItems.reduce((acc, curr) => acc + Number(curr.amount), 0);
      const prefundingSubtotal = grossWagesAmount + checkedAmount;
      const uncheckedAmount = uncheckedItems.reduce((acc, curr) => acc + Number(curr.amount), 0);

      const renderRow = (item: typeof rawItems[0], index: number, isCheckedGroup = true) => {
        // Alternate row fill
        if (index % 2 === 1) {
          doc.rect(40, currentY - 3, 515, 20).fill("#fafafa");
        }

        doc.font(fRegular).fontSize(8.5).fillColor("#64748b").text(String(index + 1), 48, currentY, { width: 25 });
        doc.font(fMedium).fontSize(8.5).fillColor("#1e293b").text(item.name || "Prefunding Item", 75, currentY, { width: 200 });
        doc.font(fRegular).fontSize(8.5).fillColor("#475569").text(item.basis || "-", 280, currentY, { width: 75 });
        doc.font(fRegular).fontSize(8.5).fillColor("#475569").text(item.pricingModel || "-", 360, currentY, { width: 85 });
        doc.font(fRegular).fontSize(8.5).fillColor("#475569").text(formatRate(item.rate, item.pricingModel), 450, currentY, { width: 45 });
        doc.font(fBold).fontSize(8.5).fillColor("#0f172a").text(
          `$${Number(item.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          495,
          currentY,
          { width: 55, align: "right" }
        );

        currentY += 21;
      };

      if (rawItems.length === 0) {
        doc.font(fRegular).fontSize(9).fillColor("#94a3b8").text("No line items specified", 48, currentY + 10);
        currentY += 30;
      } else {
        let rowIdx = 0;

        // 1. Employee Gross Wages Row
        if (grossWageItem) {
          renderRow(grossWageItem, rowIdx++, true);
        }

        // 2. Checked Adjustments (Taxes & Deductions)
        checkedItems.forEach((item) => {
          renderRow(item, rowIdx++, true);
        });

        // 3. GMS Projection Subtotal Row
        doc.rect(40, currentY - 2, 515, 26).fill("#f8fafc");
        doc.moveTo(40, currentY - 2).lineTo(555, currentY - 2).lineWidth(1).strokeColor("#e2e8f0").stroke();

        doc.font(fBold).fontSize(8.5).fillColor("#0f172a").text("GMS Projection:", 150, currentY + 2, { width: 335, align: "right" });
        doc.font(fRegular).fontSize(7.5).fillColor("#64748b").text(
          `Gross Wages ($${grossWagesAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) + Adjustments ($${checkedAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`,
          150,
          currentY + 13,
          { width: 335, align: "right" }
        );
        doc.font(fBold).fontSize(9.5).fillColor("#4f63ea").text(
          `$${prefundingSubtotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          495,
          currentY + 6,
          { width: 55, align: "right" }
        );
        currentY += 28;

        // 4. Unchecked Line Items (One-Time / Additional Fees)
        uncheckedItems.forEach((item) => {
          renderRow(item, rowIdx++, false);
        });

        // 5. Total Line Items Subtotal Row
        const lineItemsSubtotal = data.subtotalAmount ?? (prefundingSubtotal + uncheckedAmount);
        const feeAmount = data.processingFeeAmount ?? 0;

        doc.moveTo(40, currentY - 2).lineTo(555, currentY - 2).lineWidth(1.2).strokeColor("#cbd5e1").stroke();

        doc.font(fBold).fontSize(9).fillColor("#0f172a").text("PREFUNDING AMOUNT (SUBTOTAL):", 150, currentY + 3, { width: 335, align: "right" });
        doc.font(fRegular).fontSize(7.5).fillColor("#64748b").text(
          `GMS Projection ($${prefundingSubtotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) + Additional Line Items ($${uncheckedAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`,
          150,
          currentY + 14,
          { width: 335, align: "right" }
        );
        doc.font(fBold).fontSize(10.5).fillColor("#4f63ea").text(
          `$${lineItemsSubtotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          490,
          currentY + 7,
          { width: 60, align: "right" }
        );
        currentY += 34;

        if (feeAmount > 0) {
          doc.rect(40, currentY - 2, 515, 24).fill("#f8fafc");
          doc.moveTo(40, currentY - 2).lineTo(555, currentY - 2).lineWidth(1).strokeColor("#e2e8f0").stroke();

          doc.font(fMedium).fontSize(8.5).fillColor("#64748b").text(
            data.processingFeeDescription || "Payment Processing Fee:",
            150,
            currentY + 5,
            { width: 335, align: "right" }
          );
          doc.font(fBold).fontSize(9.5).fillColor("#0f172a").text(
            `+$${feeAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            490,
            currentY + 5,
            { width: 60, align: "right" }
          );
          currentY += 26;

          doc.rect(40, currentY - 2, 515, 26).fill("#eff6ff");
          doc.rect(40, currentY - 2, 515, 26).fill(isPaidDoc ? "#f0fdf4" : "#eff6ff");
          doc.moveTo(40, currentY - 2).lineTo(555, currentY - 2).lineWidth(1.5).strokeColor(isPaidDoc ? "#86efac" : "#bfdbfe").stroke();
          doc.font(fBold).fontSize(9.5).fillColor(isPaidDoc ? "#166534" : "#1e3a8a").text(isPaidDoc ? "TOTAL AMOUNT PAID:" : "GROSS INVOICE TOTAL:", 150, currentY + 6, { width: 335, align: "right" });
          doc.font(fBold).fontSize(11).fillColor(isPaidDoc ? "#16a34a" : "#4f63ea").text(
            `$${data.totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            490,
            currentY + 6,
            { width: 60, align: "right" }
          );
          currentY += 30;
        }
      }

      // Divider line
      doc.moveTo(40, currentY + 2).lineTo(555, currentY + 2).lineWidth(1).strokeColor("#e2e8f0").stroke();
      currentY += 12;

      // 6. Footer (PREFUNDING TERMS & CONDITIONS box removed as requested)
      doc.font(fRegular).fontSize(8).fillColor("#94a3b8").text(
        "Tristate MSO • Healthcare Management & Prefunding Services • Page 1 of 1",
        40,
        780,
        { width: 515, align: "center" }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
