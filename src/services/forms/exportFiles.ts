import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { displayValue, spreadsheetSafe, type QuestionShape, type StoredAnswer } from "./answers";
import type { FormSnapshot } from "./snapshot";

function xml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function columnName(index: number) {
  let name = "";
  let current = index + 1;
  while (current > 0) {
    const rem = (current - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function sheetXml(rows: string[][]) {
  const body = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
          return `<c r="${ref}" t="inlineStr"><is><t>${xml(spreadsheetSafe(value ?? ""))}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function crc32(buffer: Buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return ~crc >>> 0;
}

function zipStore(files: Array<{ name: string; data: Buffer }>) {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const crc = crc32(file.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(file.data.length, 20);
    centralHeader.writeUInt32LE(file.data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    parts.push(local, name, file.data);
    central.push(centralHeader, name);
    offset += 30 + name.length + file.data.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, centralBuf, end]);
}

export function buildXlsx(sheets: Array<{ name: string; rows: string[][] }>) {
  const files: Array<{ name: string; data: Buffer }> = [
    {
      name: "[Content_Types].xml",
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheets.map((_sheet, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
</Types>`),
    },
    {
      name: "_rels/.rels",
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    },
    {
      name: "xl/workbook.xml",
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
${sheets.map((sheet, index) => `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}
</sheets></workbook>`),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_sheet, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}
</Relationships>`),
    },
  ];
  sheets.forEach((sheet, index) => {
    files.push({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: Buffer.from(sheetXml(sheet.rows)),
    });
  });
  return zipStore(files);
}

export function buildCsv(rows: string[][]) {
  const lines = rows.map((row) =>
    row
      .map((cell) => {
        const safe = spreadsheetSafe(cell ?? "");
        if (/[",\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
        return safe;
      })
      .join(","),
  );
  return Buffer.from(`\uFEFF${lines.join("\n")}`, "utf8");
}

export function questionsFromSnapshot(snapshot: FormSnapshot): QuestionShape[] {
  return snapshot.questions
    .filter((question) => question.type !== "CONTENT")
    .map((question) => ({
      id: question.id,
      key: question.key,
      type: question.type,
      label: question.label,
      isRequired: question.isRequired,
      sectionId: question.sectionId,
      config: (question.config || {}) as Record<string, unknown>,
      options: question.options.map((option) => ({
        id: option.id,
        label: option.label,
        value: option.value,
        isOther: option.isOther,
      })),
    }));
}

export function responseRows(params: {
  questions: QuestionShape[];
  responses: Array<{
    id: string;
    submittedAt: Date | null;
    practiceId: string | null;
    recipient: { displayName: string | null; email: string; practiceName: string | null } | null;
    answers: Array<{
      questionId: string;
      valueText: string | null;
      valueNumber: unknown;
      valueDate: Date | null;
      valueJson: unknown;
      fileRefs: unknown;
    }>;
  }>;
  anonymous: boolean;
  revealPractice: boolean;
}) {
  const headers = [
    ...(params.anonymous ? [] : ["Respondent", "Email"]),
    ...(params.revealPractice ? ["Practice"] : []),
    "Submitted",
    ...params.questions.map((question) => question.label),
  ];
  const rows = params.responses.map((response) => {
    const identity = params.anonymous
      ? []
      : [response.recipient?.displayName || "", response.recipient?.email || ""];
    const practice = params.revealPractice ? [response.recipient?.practiceName || ""] : [];
    const values = params.questions.map((question) => {
      const answer = response.answers.find((item) => item.questionId === question.id);
      if (!answer) return "";
      const stored: StoredAnswer = {
        valueText: answer.valueText,
        valueNumber: answer.valueNumber === null || answer.valueNumber === undefined ? null : Number(answer.valueNumber),
        valueDate: answer.valueDate,
        valueJson: answer.valueJson,
        fileRefs: answer.fileRefs,
      };
      return displayValue(question, stored);
    });
    return [...identity, ...practice, response.submittedAt ? response.submittedAt.toISOString() : "", ...values];
  });
  return [headers, ...rows];
}

export function pdfReport(params: {
  title: string;
  filters: string;
  kpis: Record<string, string | number>;
  questions: Array<{ label: string; lines: string[] }>;
}) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(18).text(params.title);
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor("#444").text(`Filters: ${params.filters || "None"}`);
    doc.moveDown();
    doc.fillColor("#000").fontSize(12).text("Summary");
    for (const [key, value] of Object.entries(params.kpis)) {
      doc.fontSize(10).text(`${key}: ${value}`);
    }
    doc.moveDown();
    for (const question of params.questions) {
      doc.fontSize(12).text(question.label);
      for (const line of question.lines) doc.fontSize(10).text(line);
      doc.moveDown(0.5);
    }
    doc.end();
  });
}

export function exportDir() {
  const dir = path.join(process.cwd(), "storage", "form-exports");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
