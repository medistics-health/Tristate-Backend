type PdfPage = {
  ops: string[];
};

const pageWidth = 595;
const pageHeight = 842;
const marginX = 42;

const colors = {
  navy: "0.06 0.18 0.27",
  slate: "0.38 0.49 0.60",
  lightGray: "0.98 0.98 0.97",
  border: "0.92 0.91 0.88",
  emerald: "0.02 0.44 0.29",
  emeraldBg: "0.96 0.98 0.96",
};

function escapePdfText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function drawText(
  page: PdfPage,
  text: string,
  x: number,
  y: number,
  options: { size?: number; bold?: boolean; color?: string } = {},
) {
  const size = options.size || 10;
  const font = options.bold ? "/F2" : "/F1";
  const color = options.color || colors.navy;

  page.ops.push("BT");
  page.ops.push(`${color} rg`);
  page.ops.push(`${font} ${size} Tf`);
  page.ops.push(`${x} ${pageHeight - y} Td`);
  page.ops.push(`(${escapePdfText(text)}) Tj`);
  page.ops.push("ET");
}

function drawRect(
  page: PdfPage,
  x: number,
  y: number,
  width: number,
  height: number,
  fillColor: string,
  strokeColor?: string,
) {
  page.ops.push("q");
  page.ops.push(`${fillColor} rg`);
  if (strokeColor) {
    page.ops.push(`${strokeColor} RG`);
    page.ops.push("0.5 w");
  }
  page.ops.push(`${x} ${pageHeight - y - height} ${width} ${height} re`);
  if (strokeColor) {
    page.ops.push("B");
  } else {
    page.ops.push("f");
  }
  page.ops.push("Q");
}

function drawLine(
  page: PdfPage,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color = colors.border,
) {
  page.ops.push("q");
  page.ops.push(`${color} RG`);
  page.ops.push("0.5 w");
  page.ops.push(`${x1} ${pageHeight - y1} m`);
  page.ops.push(`${x2} ${pageHeight - y2} l`);
  page.ops.push("S");
  page.ops.push("Q");
}

function buildPdf(pages: PdfPage[]) {
  const objects: string[] = [];
  const pageObjects: number[] = [];
  const fontObjectNumber = 3;

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("PAGES_PLACEHOLDER");
  objects.push(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  );

  pages.forEach((page) => {
    const pageObjectNumber = objects.length + 1;
    const contentObjectNumber = pageObjectNumber + 1;
    pageObjects.push(pageObjectNumber);

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjectNumber} 0 R /F2 ${
        fontObjectNumber + 1
      } 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`,
    );

    const content = page.ops.join("\n");
    objects.push(
      `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`,
    );
  });

  objects[1] = `<< /Type /Pages /Kids [${pageObjects
    .map((objectNumber) => `${objectNumber} 0 R`)
    .join(" ")}] /Count ${pages.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

export function generateBillPdfBuffer(payable: any): Buffer {
  const page: PdfPage = { ops: [] };

  // Draw Header Card
  drawRect(page, marginX, 34, pageWidth - marginX * 2, 92, colors.navy);
  drawRect(page, marginX + 16, 52, 8, 54, "0.40 0.69 0.93");
  drawText(page, "VENDOR PAYABLE BILL", marginX + 36, 55, {
    size: 18,
    bold: true,
    color: "1 1 1",
  });
  drawText(page, `Payable Number: ${payable.payableNumber || "N/A"}`, marginX + 36, 82, {
    size: 10,
    color: "0.84 0.90 0.98",
  });

  // Billing Details
  let y = 160;
  drawText(page, "REMIT TO (VENDOR)", marginX, y, { size: 10, bold: true, color: colors.slate });
  drawText(page, "BILLED TO (PRACTICE)", marginX + 260, y, { size: 10, bold: true, color: colors.slate });

  y += 20;
  drawText(page, payable.vendor?.name || "N/A", marginX, y, { size: 12, bold: true });
  drawText(page, payable.practice?.name || "N/A", marginX + 260, y, { size: 12, bold: true });

  y += 18;
  drawText(page, payable.vendor?.remitEmail || "N/A", marginX, y, { size: 10 });
  drawText(page, `Practice ID: ${payable.practiceId?.slice(0, 8) || "N/A"}`, marginX + 260, y, { size: 10 });

  y += 35;
  drawLine(page, marginX, y, pageWidth - marginX, y);

  // Bill Information Table
  y += 25;
  drawText(page, "BILL INFORMATION", marginX, y, { size: 12, bold: true, color: colors.navy });

  y += 25;
  drawRect(page, marginX, y, pageWidth - marginX * 2, 36, colors.lightGray, colors.border);
  drawText(page, "Description", marginX + 12, y + 12, { size: 10, bold: true, color: colors.slate });
  drawText(page, "Amount", marginX + 360, y + 12, { size: 10, bold: true, color: colors.slate });

  y += 36;
  drawRect(page, marginX, y, pageWidth - marginX * 2, 40, "1 1 1", colors.border);
  drawText(page, payable.description || "Vendor Payable Statement", marginX + 12, y + 15, { size: 10 });
  drawText(page, `$${Number(payable.totalAmount || 0).toFixed(2)}`, marginX + 360, y + 15, { size: 10, bold: true });

  // Summary Card
  y += 80;
  drawRect(page, pageWidth - marginX - 220, y, 220, 110, colors.lightGray, colors.border);
  drawText(page, "Payment Summary", pageWidth - marginX - 200, y + 20, { size: 11, bold: true, color: colors.navy });
  drawText(page, "Total Cost:", pageWidth - marginX - 200, y + 50, { size: 10, color: colors.slate });
  drawText(page, `$${Number(payable.totalAmount || 0).toFixed(2)}`, pageWidth - marginX - 80, y + 50, { size: 10, bold: true });

  drawText(page, "Status:", pageWidth - marginX - 200, y + 75, { size: 10, color: colors.slate });
  drawText(page, "PAID", pageWidth - marginX - 80, y + 75, { size: 10, bold: true, color: colors.emerald });

  return buildPdf([page]);
}
