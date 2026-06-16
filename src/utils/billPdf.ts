import PDFDocument from "pdfkit";
import * as path from "path";
import * as fs from "fs";

function formatDate(dateStr?: string | Date | null): string {
  if (!dateStr) return "N/A";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return String(dateStr);
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const y = date.getUTCFullYear();
  return `${m}/${d}/${y}`;
}

export function generateBillPdfBuffer(
  payable: any,
  qbBill?: any,
  qbCompanyInfo?: any,
  logoBuffer?: Buffer | null
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: "A4" });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err) => reject(err));

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
      doc.rect(0, 0, 595.28, 5).fill("#c3a97c");

      // 1. Page Header (Page 1 of 1 at top right)
      doc.fontSize(8).fillColor("#9CA3AF");
      const pageNumFont = hasFonts ? "GoogleSans" : "Helvetica";
      doc.font(pageNumFont).text("Page 1 of 1", 0, 20, { width: 555, align: "right" });

      // 2. Company Info (Left Side) & Company Logo (Right Side)
      let companyName = qbCompanyInfo?.CompanyName || payable.practice?.name || "Sandbox Company";
      let addressLine1 = "N/A";
      let addressLine2 = "";
      
      if (qbCompanyInfo?.CompanyAddr) {
        const addr = qbCompanyInfo.CompanyAddr;
        addressLine1 = addr.Line1 || "";
        addressLine2 = `${addr.City || ""}, ${addr.CountrySubDivisionCode || ""} ${addr.PostalCode || ""}`.trim();
      } else {
        addressLine1 = "123 Sierra Way";
        addressLine2 = "San Pablo, CA 87999";
      }
      
      let companyEmail = qbCompanyInfo?.Email?.Address || 
                         qbCompanyInfo?.CustomerCommunicationEmailAddr?.Address || 
                         "developments@medisticshealth.com";

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
      } else {
        doc.text(companyEmail, 40, 61);
      }

      // Draw Logo on the Right (if exists)
      if (logoBuffer) {
        try {
          doc.image(logoBuffer, 425, 35, { width: 130 });
        } catch (logoErr) {
          console.warn("Failed to render logo in PDF, drawing without logo:", logoErr);
        }
      }

      // Set fixed offsetY for subsequent sections since logo is side-by-side
      const offsetY = 95;

      // 3. Document Title ("Bill") & PAID Status Badge
      doc.font(boldTextFont).fontSize(22).fillColor("#111827").text("Bill", 40, 32 + offsetY);
      
      const isPaid = payable.status === "PAID";
      if (isPaid) {
        // Draw a premium rounded green PAID badge next to the title
        doc.save();
        doc.fillColor("#E6F4EA"); // Very light green background
        doc.roundedRect(82, 33 + offsetY, 42, 17, 4).fill();
        doc.font(boldTextFont).fontSize(9).fillColor("#137333").text("PAID", 92, 37 + offsetY); // Dark green text
        doc.restore();
      }

      // 4. Metadata section (Vendor, Bill Number, Bill Date, Due Date, Date Paid)
      const metaY = 70 + offsetY;
      
      // Column 1: Vendor Details
      doc.font(boldTextFont).fontSize(8.5).fillColor("#4B5563").text("Vendor", 40, metaY);
      const vendorName = payable.vendor?.name || qbBill?.VendorRef?.name || "SecureTech Compliance";
      doc.font(mediumTextFont).fontSize(11).fillColor("#1F2937").text(vendorName, 40, metaY + 14, { width: 170 });

      // Column 2: Bill Number
      const billNumber = qbBill?.DocNumber || payable.payableNumber || "N/A";
      doc.font(boldTextFont).fontSize(8.5).fillColor("#4B5563").text("Bill Number", 225, metaY);
      doc.font(mediumTextFont).fontSize(11).fillColor("#1F2937").text(billNumber, 225, metaY + 14, { width: 95 });

      // Column 3: Bill Date
      const billDateStr = qbBill?.TxnDate || payable.createdAt;
      const billDate = formatDate(billDateStr);
      doc.font(boldTextFont).fontSize(8.5).fillColor("#4B5563").text("Bill Date", 335, metaY);
      doc.font(bodyFont).fontSize(11).fillColor("#1F2937").text(billDate, 335, metaY + 14);

      // Column 4: Due Date
      const dueDateStr = qbBill?.DueDate || payable.dueDate || qbBill?.TxnDate || payable.createdAt;
      const dueDate = formatDate(dueDateStr);
      doc.font(boldTextFont).fontSize(8.5).fillColor("#4B5563").text("Due Date", 445, metaY);
      doc.font(bodyFont).fontSize(11).fillColor("#1F2937").text(dueDate, 445, metaY + 14);

      // Extra: Date Paid (if Paid)
      let extraHeight = 0;
      if (isPaid) {
        const paidDateStr = payable.paidAt || qbBill?.MetaData?.LastUpdatedTime || new Date();
        const paidDate = formatDate(paidDateStr);
        doc.font(boldTextFont).fontSize(8.5).fillColor("#137333").text("Date Paid", 335, metaY + 36);
        doc.font(bodyFont).fontSize(11).fillColor("#137333").text(paidDate, 335, metaY + 50);
        extraHeight = 40;
      }

      // 5. Lines table setup
      let y = metaY + 52 + extraHeight;
      
      // Draw Table Header
      doc.rect(40, y - 5, 515, 20).fill("#F3F4F6"); // Header background
      doc.fillColor("#4B5563");
      doc.font(boldTextFont).fontSize(8.5);
      doc.text("DESCRIPTION", 40, y);
      doc.text("QTY", 380, y, { width: 30, align: "right" });
      doc.text("RATE", 420, y, { width: 60, align: "right" });
      doc.text("AMOUNT", 490, y, { width: 65, align: "right" });

      y += 25; // Move past header

      // Filter or generate lines
      const rawLines = (qbBill?.Line || []).filter((line: any) =>
        line.DetailType === "AccountBasedExpenseLineDetail" ||
        line.DetailType === "ItemBasedExpenseLineDetail"
      );

      const lines = rawLines.length > 0 ? rawLines : [
        {
          Description: "Annual Preventive Health Checkup",
          Amount: 80.00,
          DetailType: "AccountBasedExpenseLineDetail",
          AccountBasedExpenseLineDetail: { AccountRef: { name: "Tristate Operating Expense" } }
        },
        {
          Description: "Cardiology Specialist Consultation",
          Amount: 10.00,
          DetailType: "AccountBasedExpenseLineDetail",
          AccountBasedExpenseLineDetail: { AccountRef: { name: "Tristate Operating Expense" } }
        },
        {
          Description: "Complete Blood Count Test",
          Amount: 20.00,
          DetailType: "AccountBasedExpenseLineDetail",
          AccountBasedExpenseLineDetail: { AccountRef: { name: "Tristate Operating Expense" } }
        },
        {
          Description: "General Health Consultation",
          Amount: 0.00,
          DetailType: "AccountBasedExpenseLineDetail",
          AccountBasedExpenseLineDetail: { AccountRef: { name: "Tristate Operating Expense" } }
        },
        {
          Description: "General Health Consultation",
          Amount: 90.00,
          DetailType: "AccountBasedExpenseLineDetail",
          AccountBasedExpenseLineDetail: { AccountRef: { name: "Tristate Operating Expense" } }
        }
      ];

      doc.font(bodyFont).fontSize(9).fillColor("#1F2937");

      for (const line of lines) {
        const description = line.Description || "";
        
        let qty = 1;
        let rate = Number(line.Amount || 0);

        if (line.DetailType === "ItemBasedExpenseLineDetail" && line.ItemBasedExpenseLineDetail) {
          qty = Number(line.ItemBasedExpenseLineDetail.Qty || 1);
          rate = Number(line.ItemBasedExpenseLineDetail.UnitPrice || line.Amount || 0);
        }

        const amount = Number(line.Amount || 0);

        // Height calculations to adjust dynamic row spacing
        const descHeight = doc.heightOfString(description, { width: 330 });
        const rowHeight = Math.max(descHeight, 15) + 12;

        // Draw horizontal grid line
        doc.moveTo(40, y + rowHeight - 6)
           .lineTo(555, y + rowHeight - 6)
           .strokeColor("#E5E7EB")
           .lineWidth(0.5)
           .stroke();

        // Print column values
        doc.text(description, 40, y, { width: 330 });
        doc.text(String(qty), 380, y, { width: 30, align: "right" });
        doc.text(rate.toFixed(2), 420, y, { width: 60, align: "right" });
        doc.text(amount.toFixed(2), 490, y, { width: 65, align: "right" });

        y += rowHeight;
      }


      // Summary / Footer calculation
      y += 20;

      // Note: Removed the "Local vendor payable UUID" note block from the left as requested.

      // Summary Card on right
      const totalAmount = Number(qbBill?.TotalAmt || payable.totalAmount || 200.00);
      const paidAmount = isPaid ? totalAmount : 0.00;
      const balanceDue = totalAmount - paidAmount;

      const summaryX = 350;
      const valueX = 490;
      const valueWidth = 65;

      doc.font(boldTextFont).fontSize(9.5).fillColor("#374151");
      
      doc.text("TOTAL", summaryX, y);
      doc.text(totalAmount.toFixed(2), valueX, y, { width: valueWidth, align: "right" });

      y += 18;
      doc.text("PAYMENT PAID", summaryX, y);
      doc.text(paidAmount.toFixed(2), valueX, y, { width: valueWidth, align: "right" });

      y += 18;
      doc.font(boldTextFont).fontSize(11).fillColor("#111827");
      doc.text("BALANCE DUE", summaryX, y);
      doc.text(`$${balanceDue.toFixed(2)}`, valueX, y, { width: valueWidth, align: "right" });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
