type PdfFieldValue =
  | string
  | number
  | boolean
  | Date
  | string[]
  | null
  | undefined;

type Field = {
  label: string;
  value: PdfFieldValue;
  span?: 1 | 2;
};

type PdfPage = {
  ops: string[];
};

const pageWidth = 612;
const pageHeight = 792;
const marginX = 42;
const marginBottom = 42;
const cardGap = 10;
const fieldGap = 10;

const colors = {
  ink: "0.06 0.09 0.16",
  navy: "0.03 0.05 0.13",
  muted: "0.35 0.43 0.55",
  faint: "0.91 0.94 0.97",
  border: "0.82 0.87 0.92",
  paper: "1 1 1",
  panel: "0.97 0.99 1",
  warm: "0.98 0.94 0.88",
  sky: "0.88 0.95 1",
  green: "0.91 0.98 0.94",
};

function escapePdfText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r?\n/g, " ");
}

const careProgramServiceValues = [
  "CARE_MANAGEMENT",
  "APCM",
  "CCM",
  "RPM",
  "PCM",
  "RTM",
  "BHI",
  "TCM",
];

const marketingServiceValues = [
  "PATIENT_ACQUISITION",
  "BRAND_GROWTH",
  "PATIENT_ACQUISITION_BRAND_GROWTH",
  "AI_VISIBILITY",
];

const independentBillingProviderTypes = [
  "PHYSICIAN",
  "NURSE_PRACTITIONER",
  "PHYSICIAN_ASSISTANT",
];

function humanize(value: string) {
  if (!value) return "";
  return value
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bNpi\b/g, "NPI")
    .replace(/\bEin\b/g, "EIN")
    .replace(/\bPli\b/g, "PLI")
    .replace(/\bCaqh\b/g, "CAQH")
    .replace(/\bHipaa\b/g, "HIPAA")
    .replace(/\bBaa\b/g, "BAA")
    .replace(/\bEft\b/g, "EFT")
    .replace(/\bEra\b/g, "ERA")
    .replace(/\bRcm\b/g, "RCM");
}

function cleanValue(value: PdfFieldValue) {
  if (value === undefined || value === null || value === "")
    return "Not provided";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    const values = value.filter(Boolean).map((item) => humanize(String(item)));
    return values.length ? values.join(", ") : "Not provided";
  }

  const stringValue = String(value).trim();
  if (!stringValue) return "Not provided";
  return /^[A-Z0-9_]+$/.test(stringValue) && stringValue.includes("_")
    ? humanize(stringValue)
    : stringValue;
}

function formatDate(value: PdfFieldValue) {
  if (!value || value === "Not provided") return value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
}

function joinAddress(parts: Array<PdfFieldValue>) {
  const address = parts
    .map((part) => (part ? cleanValue(part) : ""))
    .filter((part) => part && part !== "Not provided")
    .join(", ");
  return address || undefined;
}

function textWidth(text: string, fontSize: number) {
  return text.length * fontSize * 0.52;
}

function wrapText(text: string, maxWidth: number, fontSize: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  const splitLongWord = (word: string) => {
    const chunks: string[] = [];
    let chunk = "";

    for (const char of word) {
      if (chunk && textWidth(`${chunk}${char}`, fontSize) > maxWidth) {
        chunks.push(chunk);
        chunk = char;
      } else {
        chunk += char;
      }
    }

    if (chunk) chunks.push(chunk);
    return chunks;
  };

  for (const word of words) {
    if (textWidth(word, fontSize) > maxWidth) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = "";
      }
      lines.push(...splitLongWord(word));
      continue;
    }

    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (textWidth(nextLine, fontSize) > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = nextLine;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines.length ? lines : ["Not provided"];
}

function drawRect(
  page: PdfPage,
  x: number,
  yTop: number,
  width: number,
  height: number,
  fillColor?: string,
  strokeColor?: string,
) {
  if (fillColor) page.ops.push(`${fillColor} rg`);
  if (strokeColor) page.ops.push(`${strokeColor} RG`);
  page.ops.push(`${x} ${pageHeight - yTop - height} ${width} ${height} re`);
  page.ops.push(fillColor && strokeColor ? "B" : fillColor ? "f" : "S");
}

function drawText(
  page: PdfPage,
  text: string,
  x: number,
  yTop: number,
  options?: {
    size?: number;
    bold?: boolean;
    color?: string;
  },
) {
  const size = options?.size ?? 10;
  const font = options?.bold ? "F2" : "F1";
  const color = options?.color ?? colors.ink;
  page.ops.push("BT");
  page.ops.push(`${color} rg`);
  page.ops.push(`/${font} ${size} Tf`);
  page.ops.push(`${x} ${pageHeight - yTop - size} Td`);
  page.ops.push(`(${escapePdfText(text)}) Tj`);
  page.ops.push("ET");
}

class OnboardingPdf {
  private pages: PdfPage[] = [];
  private page: PdfPage;
  private y = 42;

  constructor(private readonly practiceName?: string) {
    this.page = this.createPage();
    this.drawCoverHeader();
  }

  addSection(
    title: string,
    subtitle: string | undefined,
    fields: Field[],
    columns = 2,
  ) {
    const normalizedFields = fields.length
      ? fields
      : [{ label: "Status", value: "No information was provided." }];

    this.ensureSpace(78);
    drawText(this.page, title, marginX, this.y, {
      size: 15,
      bold: true,
      color: colors.navy,
    });
    this.y += 18;

    if (subtitle) {
      wrapText(subtitle, pageWidth - marginX * 2, 9).forEach((line) => {
        drawText(this.page, line, marginX, this.y, {
          size: 9,
          color: colors.muted,
        });
        this.y += 12;
      });
    }

    this.y += 8;

    const contentWidth = pageWidth - marginX * 2;
    const columnWidth =
      columns === 1 ? contentWidth : (contentWidth - fieldGap) / columns;
    let index = 0;

    while (index < normalizedFields.length) {
      const firstField = normalizedFields[index];
      const secondField = normalizedFields[index + 1];
      const rowFields =
        columns === 1 || firstField.span === 2 || secondField?.span === 2
          ? [firstField]
          : normalizedFields.slice(index, index + 2);
      const rowHeights = rowFields.map((field) =>
        this.getFieldHeight(
          field,
          rowFields.length === 1 ? contentWidth : columnWidth,
        ),
      );
      const rowHeight = Math.max(...rowHeights);

      this.ensureSpace(rowHeight + cardGap);

      rowFields.forEach((field, rowIndex) => {
        const width =
          rowFields.length === 1 || field.span === 2
            ? contentWidth
            : columnWidth;
        const x = marginX + rowIndex * (columnWidth + fieldGap);
        this.drawFieldCard(field, x, this.y, width, rowHeight);
      });

      this.y += rowHeight + cardGap;
      index += rowFields.length;
    }

    this.y += 10;
  }

  addGroup(
    title: string,
    subtitle: string | undefined,
    groups: Array<{
      title: string;
      fields: Field[];
    }>,
  ) {
    this.ensureSpace(72);
    drawText(this.page, title, marginX, this.y, {
      size: 15,
      bold: true,
      color: colors.navy,
    });
    this.y += 18;
    if (subtitle) {
      drawText(this.page, subtitle, marginX, this.y, {
        size: 9,
        color: colors.muted,
      });
      this.y += 18;
    }

    groups.forEach((group) => {
      this.ensureSpace(54);
      drawRect(
        this.page,
        marginX,
        this.y,
        pageWidth - marginX * 2,
        30,
        colors.sky,
        colors.border,
      );
      drawText(this.page, group.title, marginX + 14, this.y + 9, {
        size: 11,
        bold: true,
        color: colors.navy,
      });
      this.y += 40;
      this.addSection("", undefined, group.fields, 2);
      this.y -= 10;
    });
  }

  finish() {
    this.drawFooters();
    return buildPdf(this.pages);
  }

  private createPage() {
    const page: PdfPage = { ops: [] };
    this.pages.push(page);
    drawRect(page, 0, 0, pageWidth, pageHeight, colors.panel);
    drawRect(page, 0, 0, pageWidth, 118, colors.faint);
    return page;
  }

  private newPage() {
    this.page = this.createPage();
    this.y = 42;
  }

  private ensureSpace(height: number) {
    if (this.y + height > pageHeight - marginBottom) {
      this.newPage();
    }
  }

  private drawCoverHeader() {
    drawRect(
      this.page,
      marginX,
      34,
      pageWidth - marginX * 2,
      92,
      colors.navy,
      colors.navy,
    );
    drawRect(this.page, marginX + 16, 52, 8, 54, "0.40 0.69 0.93");
    drawText(this.page, "Onboarding Form", marginX + 36, 55, {
      size: 18,
      bold: true,
      color: "1 1 1",
    });
    const subtitle = "Generated copy of the submitted client onboarding form";
    wrapText(subtitle, pageWidth - marginX * 2 - 72, 10).forEach(
      (line, index) => {
        drawText(this.page, line, marginX + 36, 82 + index * 13, {
          size: 10,
          color: "0.84 0.90 0.98",
        });
      },
    );

    if (this.practiceName) {
      wrapText(
        `Practice: ${this.practiceName}`,
        pageWidth - marginX * 2 - 72,
        11,
      ).forEach((line, index) => {
        drawText(this.page, line, marginX + 36, 98 + index * 13, {
          size: 11,
          bold: true,
          color: "1 1 1",
        });
      });
    }

    this.y = 148;
  }

  private getFieldHeight(field: Field, width: number) {
    const labelLines = wrapText(field.label, width - 24, 8.5);
    const valueLines = wrapText(cleanValue(field.value), width - 24, 9.5);
    return Math.max(58, 26 + labelLines.length * 10 + valueLines.length * 12);
  }

  private drawFieldCard(
    field: Field,
    x: number,
    yTop: number,
    width: number,
    height: number,
  ) {
    drawRect(this.page, x, yTop, width, height, colors.paper, colors.border);

    let textY = yTop + 12;
    wrapText(field.label, width - 24, 8.5).forEach((line) => {
      drawText(this.page, line, x + 12, textY, {
        size: 8.5,
        bold: true,
        color: colors.muted,
      });
      textY += 10;
    });

    textY += 4;
    const value = cleanValue(field.value);
    const valueColor = value === "Not provided" ? colors.muted : colors.ink;
    wrapText(value, width - 24, 9.5).forEach((line) => {
      drawText(this.page, line, x + 12, textY, {
        size: 9.5,
        color: valueColor,
      });
      textY += 12;
    });
  }

  private drawFooters() {
    this.pages.forEach((page, index) => {
      drawText(
        page,
        `Page ${index + 1} of ${this.pages.length}`,
        pageWidth - 96,
        760,
        {
          size: 8,
          color: colors.muted,
        },
      );
      drawText(
        page,
        "Tristate Revenue Cycle Management Onboarding",
        marginX,
        760,
        {
          size: 8,
          color: colors.muted,
        },
      );
    });
  }
}

function addIfPresent(
  fields: Field[],
  label: string,
  value: PdfFieldValue,
  span?: 1 | 2,
) {
  fields.push({ label, value, span });
}

function getDocumentReference(value: PdfFieldValue) {
  const cleaned = cleanValue(value);
  if (cleaned === "Not provided") return "Not uploaded";

  try {
    const url = new URL(cleaned);
    const fileName = decodeURIComponent(
      url.pathname.split("/").filter(Boolean).pop() ?? "",
    );
    return fileName ? `Uploaded - ${fileName}` : "Uploaded";
  } catch {
    return cleaned.length > 96 ? "Uploaded" : `Uploaded - ${cleaned}`;
  }
}

function documentValue(value: PdfFieldValue) {
  return getDocumentReference(value);
}

function getOnboardingPracticeName(onboarding: any) {
  return (
    onboarding.practice?.name ||
    onboarding.practices?.[0]?.practiceName ||
    onboarding.legalCompanyName ||
    onboarding.dbaName ||
    undefined
  );
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

export function generateOnboardingPdfBuffer(
  onboarding: any,
  practiceName?: string,
) {
  const pdf = new OnboardingPdf(
    practiceName || getOnboardingPracticeName(onboarding),
  );
  const practices = onboarding.practices ?? [];
  const contacts = onboarding.contacts ?? [];
  const marketing = onboarding.marketing ?? onboarding.OnboardingMarketing;
  const requestedServices = onboarding.requestedServices ?? [];

  pdf.addSection(
    "Step 1 - Structure",
    "Client structure, authorization, and operating model.",
    [
      { label: "Onboarding Type", value: onboarding.onboardingType },
      ...(onboarding.onboardingType === "MULTI_PRACTICE_ORGANIZATION"
        ? [{ label: "Number of Practices", value: onboarding.numberOfPractices } as Field]
        : []),
      ...(onboarding.onboardingType && onboarding.onboardingType !== "SINGLE_PRACTICE_ORGANIZATION"
        ? [{ label: "Number of Locations", value: onboarding.numberOfLocations } as Field]
        : []),
      ...(!onboarding.isIndividualPractice &&
      onboarding.onboardingType &&
      onboarding.onboardingType !== "SINGLE_PRACTICE_ORGANIZATION"
        ? ([
            { label: "Billing Managed Centrally", value: onboarding.billingManagedCentrally },
            { label: "Credentialing Managed Centrally", value: onboarding.credentialingManagedCentrally },
            { label: "Contracting Managed Centrally", value: onboarding.contractingManagedCentrally },
            { label: "One Main Contact", value: onboarding.oneMainContact },
          ] as Field[])
        : []),
    ],
  );

  if (!onboarding.isIndividualPractice) {
    pdf.addSection("Step 2 - Company", "Company or organization details.", [
      { label: "Practice Legal Name", value: onboarding.legalCompanyName },
      { label: "Practice DBA Name", value: onboarding.dbaName },
      { label: "Tax ID (EIN)", value: onboarding.taxIdEin },
      { label: "Organization Type", value: onboarding.organizationType },
      { label: "Ownership Type", value: onboarding.ownershipType },
      { label: "Main Company Phone", value: onboarding.mainCompanyPhone },
      { label: "Main Company Fax", value: onboarding.mainCompanyFax },
      { label: "Main Company Email", value: onboarding.mainCompanyEmail },
      { label: "Company Website", value: onboarding.companyWebsite },
      {
        label: "Company Address",
        value: joinAddress([
          onboarding.companyAddressLine1,
          onboarding.companyAddressLine2,
          onboarding.companyCity,
          onboarding.companyState,
          onboarding.companyZip,
        ]),
        span: 2,
      },
      { label: "States of Operation", value: onboarding.statesOfOperation },
      {
        label: "Legal Contracting Entity",
        value: onboarding.isLegalContractingEntity,
      },
      { label: "Billing Entity", value: onboarding.isBillingEntity },
      { label: "Credentialing Entity", value: onboarding.isCredentialingEntity },
      { label: "Primary Specialty", value: onboarding.primarySpecialty },
      {
        label: "Additional Specialties",
        value: onboarding.additionalSpecialties,
      },
    ]);
  }

  pdf.addGroup(
    "Step 3 - Contacts",
    "Primary contacts, signers, and responsibilities.",
    contacts.length
      ? contacts.map((contact: any, index: number) => ({
          title: `Contact ${index + 1}`,
          fields: [
            { label: "Full Name", value: contact.fullName },
            { label: "Job Title", value: contact.jobTitle },
            { label: "Role", value: contact.contactRole },
            { label: "Email", value: contact.email },
            { label: "Phone", value: contact.phone },
            { label: "Extension", value: contact.extension },
            {
              label: "Preferred Contact Method",
              value: contact.preferredContactMethod,
            },
            { label: "Best Time to Reach", value: contact.bestTimeToReach },
            {
              label: "Primary Decision Maker",
              value: contact.isPrimaryDecisionMaker,
            },
            { label: "Can Sign Agreements", value: contact.canSignAgreements },
            {
              label: "Additional Responsibilities",
              value: contact.additionalResponsibilities,
            },
          ],
        }))
      : [
          {
            title: "Contact 1",
            fields: [{ label: "Contact Details", value: undefined }],
          },
        ],
  );

  practices.forEach((practice: any, practiceIndex: number) => {
    pdf.addSection(
      `Step 4 - Practice ${practiceIndex + 1}`,
      "Practice information.",
      [
        { label: "Practice Name", value: practice.practiceName },
        { label: "Practice DBA Name", value: practice.practiceDbaName },
        {
          label: "Part of Parent Company",
          value: practice.isPartOfParentCompany,
        },
        { label: "Practice Type", value: practice.practiceType },
        {
          label: "Additional Specialty Areas",
          value: practice.additionalSpecialtyAreas,
        },
        { label: "Group NPI", value: practice.groupNpi },
        { label: "Tax ID (EIN)", value: practice.taxIdEin },
        { label: "Medicaid ID Number", value: practice.medicaidIdNumber },
        { label: "Group Medicaid NPI", value: practice.groupMedicaidNpi },
        { label: "Group Medicare PTAN", value: practice.groupMedicarePtan },
        { label: "Group Taxonomy", value: practice.groupTaxonomy },
        { label: "IPA Affiliations", value: practice.ipaAffiliations },
        { label: "Practice Manager Name", value: practice.practiceManagerName },
        {
          label: "Practice Manager Email",
          value: practice.practiceManagerEmail,
        },
        {
          label: "Practice Manager Phone",
          value: practice.practiceManagerPhone,
        },
        { label: "Billing Address", value: practice.billingAddress, span: 2 },
        { label: "Mailing Address", value: practice.mailingAddress, span: 2 },
        {
          label: "Practice Work Start Date",
          value: formatDate(practice.practiceWorkStartDate),
        },
        {
          label: "Railroad Medicare (Group)",
          value: practice.railroadMedicareGroup,
        },
        {
          label: "Number of Providers",
          value: practice.approximateNumberOfProviders,
        },
        {
          label: "Number of Locations",
          value: practice.approximateNumberOfLocations,
        },
        {
          label: "Monthly Patient Volume",
          value: practice.approximateMonthlyPatientVolume,
        },
        {
          label: "Medicare Patient Volume",
          value: practice.approximateMedicarePatientVolume,
        },
        {
          label: "Medicaid Patient Volume",
          value: practice.approximateMedicaidPatientVolume,
        },
        {
          label: "Commercial Patient Volume",
          value: practice.approximateCommercialPatientVolume,
        },
        {
          label: "Offers Care Management Services",
          value: practice.offersCareManagementServices,
        },
        ...(practice.offersCareManagementServices
          ? [{ label: "Current Services Offered", value: practice.currentServicesOffered } as Field]
          : []),
        {
          label: "Operational Pain Points",
          value: practice.operationalPainPoints,
        },
        { label: "Notes", value: practice.additionalNotes, span: 2 },
      ],
    );

    (practice.locations ?? []).forEach(
      (location: any, locationIndex: number) => {
        pdf.addSection(
          `Practice ${practiceIndex + 1} - Location ${locationIndex + 1}`,
          "Service location address and office contact details.",
          [
            { label: "Location Name", value: location.locationName },
            { label: "Primary Location", value: location.isPrimaryLocation },
            {
              label: "Service Location Address",
              value: joinAddress([
                location.addressLine1,
                location.addressLine2,
                location.city,
                location.state,
                location.zipCode,
              ]),
              span: 2,
            },
            { label: "Office Phone", value: location.mainPhoneNumber },
            { label: "Office Fax", value: location.mainFaxNumber },
            { label: "Office Email", value: location.officeEmail },
            { label: "Hours of Operation", value: location.hoursOfOperation },
            { label: "Office Manager Name", value: location.officeManagerName },
            {
              label: "Patient Outreach Managed",
              value: location.patientOutreachManaged,
            },
            { label: "Billing Managed", value: location.billingManaged },
            { label: "Notes", value: location.notes, span: 2 },
          ],
        );
      },
    );

    (practice.providers ?? []).forEach(
      (provider: any, providerIndex: number) => {
        const providerName =
          provider.fullName ||
          [provider.firstName, provider.lastName].filter(Boolean).join(" ");

        pdf.addSection(
          `Practice ${practiceIndex + 1} - Provider ${providerIndex + 1}`,
          "Provider personal information.",
          [
            { label: "Full Name", value: providerName },
            { label: "First Name", value: provider.firstName },
            { label: "Last Name", value: provider.lastName },
            { label: "Date of Birth", value: formatDate(provider.dateOfBirth) },
            { label: "Gender", value: provider.gender },
            { label: "Credentials", value: provider.credentials },
            { label: "Provider Type", value: provider.providerType },
            { label: "Specialty", value: provider.specialty },
            { label: "NPI (Individual)", value: provider.npi },
            ...(independentBillingProviderTypes.includes(provider.providerType ?? "")
              ? [{ label: "DEA Number", value: provider.deaNumber } as Field]
              : []),
            { label: "SSN (Full Digits)", value: provider.ssnFullDigits },
            { label: "CLIA Number", value: provider.cliaNumber },
            {
              label: "State License Number",
              value: provider.stateLicenseNumber,
            },
            {
              label: "License Expiry Date",
              value: formatDate(provider.licenseExpiryDate),
            },
            { label: "State of License", value: provider.stateOfLicense },
            { label: "License Type", value: provider.licenseType },
            { label: "Taxonomy", value: provider.taxonomy },
            {
              label: "Secondary Specialty",
              value: provider.secondarySpecialty,
            },
            ...(independentBillingProviderTypes.includes(provider.providerType ?? "")
              ? ([
                  { label: "Board Certifications", value: provider.boardCertifications },
                  { label: "Board Certified", value: provider.boardCertified },
                ] as Field[])
              : []),
            { label: "Employment Status", value: provider.employmentStatus },
            {
              label: "Participating Locations",
              value: provider.participatingLocations,
            },
            { label: "Provider Notes", value: provider.notes, span: 2 },
          ],
        );

        pdf.addSection(
          `Provider ${providerIndex + 1} - Credentialing and CAQH`,
          "Credentialing identifiers, portal access, and payer identifiers.",
          [
            ...(requestedServices.includes("CREDENTIALING")
              ? ([
                  { label: "CAQH ID", value: provider.caqhId },
                  { label: "CAQH Username", value: provider.caqhUsername },
                  { label: "CAQH Password", value: provider.caqhPassword },
                  {
                    label: "CAQH Last Attestation Date",
                    value: formatDate(provider.caqhLastAttestationDate),
                  },
                ] as Field[])
              : []),
            {
              label: "Credentialing Needed",
              value: provider.credentialingNeeded,
            },
            {
              label: "Recredentialing Needed",
              value: provider.recredentialingNeeded,
            },
            { label: "Languages Spoken", value: provider.languagesSpoken },
            {
              label: "Telehealth Available",
              value: provider.telehealthAvailable,
            },
            ...(independentBillingProviderTypes.includes(provider.providerType ?? "")
              ? ([
                  {
                    label: "Medicare PTAN (Individual)",
                    value: provider.medicarePtanIndividual,
                  },
                  {
                    label: "Medicaid ID (Individual)",
                    value: provider.medicaidIdIndividual,
                  },
                  {
                    label: "Railroad Medicare (Individual)",
                    value: provider.railroadMedicareIndividual,
                  },
                ] as Field[])
              : []),
            {
              label: "IPA Affiliations (Provider Level)",
              value: provider.ipaAffiliationsProviderLevel,
            },
            { label: "NPPES Username", value: provider.nppesUsername },
            { label: "NPPES Password", value: provider.nppesPassword },
          ],
        );

        pdf.addSection(
          `Provider ${providerIndex + 1} - Malpractice and Contact Details`,
          "Malpractice, affiliations, and provider contact information.",
          [
            {
              label: "Malpractice Carrier",
              value: provider.malpracticeCarrier,
            },
            {
              label: "Malpractice Policy #",
              value: provider.malpracticePolicyNumber,
            },
            {
              label: "Malpractice Effective Date",
              value: formatDate(provider.malpracticeEffectiveDate),
            },
            {
              label: "Malpractice Expiry Date",
              value: formatDate(provider.malpracticeExpiryDate),
            },
            {
              label: "Hospital Affiliations",
              value: provider.hospitalAffiliations,
            },
            {
              label: "Personal Cell Number",
              value: provider.personalCellNumber,
            },
            { label: "Personal Email", value: provider.personalEmail },
            { label: "Practice Email", value: provider.practiceEmail },
          ],
        );

        pdf.addSection(
          `Provider ${providerIndex + 1} - Credentialing Documents`,
          "Uploaded provider credentialing documents.",
          [
            ...(independentBillingProviderTypes.includes(provider.providerType ?? "") && provider.boardCertified
              ? [
                  {
                    label: "Copy of Board Certification",
                    value: documentValue(provider.copyOfBoardCertification),
                  } as Field,
                ]
              : []),
          ],
        );
      },
    );
  });

  if (!practices.length) {
    pdf.addSection(
      "Step 4 - Practices",
      "Practice, location, and provider details.",
      [{ label: "Practice Details", value: undefined }],
    );
  }

  pdf.addSection("Step 5 - Scope", "Requested services and launch timing.", [
    { label: "Requested Services", value: onboarding.requestedServices },
    {
      label: "Primary Service to Launch",
      value: onboarding.primaryServiceToLaunch,
    },
    {
      label: "Requested Go-Live Date",
      value: formatDate(onboarding.requestedGoLiveDate),
    },
    { label: "Priority Level", value: onboarding.priorityLevel },
    {
      label: "Services for All Practices",
      value: onboarding.servicesForAllPractices,
    },
    { label: "Selected Practices", value: onboarding.selectedPractices },
    {
      label: "Replacing Existing Vendor",
      value: onboarding.replacingExistingVendor,
    },
    { label: "Current Vendor Name", value: onboarding.currentVendorName },
    {
      label: "Current Vendor End Date",
      value: formatDate(onboarding.currentVendorEndDate),
    },
    { label: "Engagement Goals", value: onboarding.engagementGoals, span: 2 },
  ]);

  addOperationsSections(pdf, onboarding, requestedServices);
  addOutreachSections(pdf, onboarding, marketing, requestedServices);

  pdf.addSection(
    "Step 8 - Additional Documents",
    "Uploaded or tracked documents that are part of this onboarding record.",
    (onboarding.documents ?? []).length
      ? (onboarding.documents ?? []).flatMap((document: any, index: number) => [
          { label: `Document ${index + 1} Type`, value: document.documentType },
          {
            label: `Document ${index + 1} File Name`,
            value: document.fileName,
          },
          {
            label: `Document ${index + 1} File URL`,
            value: document.fileUrl,
            span: 2,
          },
          { label: `Document ${index + 1} Required`, value: document.required },
          { label: `Document ${index + 1} Status`, value: document.status },
          {
            label: `Document ${index + 1} Date Requested`,
            value: formatDate(document.dateRequested),
          },
          {
            label: `Document ${index + 1} Date Received`,
            value: formatDate(document.dateReceived),
          },
          {
            label: `Document ${index + 1} Notes`,
            value: document.notes,
            span: 2,
          },
        ])
      : [
          {
            label: "Documents",
            value: "No additional documents were tracked.",
          },
        ],
  );

  pdf.addSection(
    "Final Confirmation",
    "Submission confirmation and signer details.",
    [
      { label: "Information Accurate", value: onboarding.informationAccurate },
      { label: "Authorize Use", value: onboarding.authorizeUse },
      { label: "Submitted By Name", value: onboarding.submittedByName },
      { label: "Submitted By Title", value: onboarding.submittedByTitle },
      {
        label: "Submission Date",
        value: formatDate(onboarding.submissionDate),
      },
      { label: "Status", value: onboarding.status },
    ],
  );

  return pdf.finish();
}

function addOperationsSections(
  pdf: OnboardingPdf,
  onboarding: any,
  requestedServices: string[],
) {
  const billing = onboarding.billing ?? {};
  const credentialing = onboarding.credentialing ?? {};
  const technology = onboarding.technology ?? {};

  pdf.addSection(
    "Step 6 - Technology",
    "EHR, billing software, and access details.",
    [
      { label: "EMR/EHR Name", value: technology.ehrSystem },
      {
        label: "Billing Software Name",
        value: technology.practiceManagementSystem,
      },
      {
        label: "Patient Portal Available",
        value: technology.patientPortalAvailable,
      },
      {
        label: "Patient List Exportable",
        value: technology.patientListExportable,
      },
      {
        label: "Appointment List Exportable",
        value: technology.appointmentListExportable,
      },
      { label: "API Access Available", value: technology.apiAccessAvailable },
      { label: "Clearing House", value: technology.clearinghouse },
      { label: "Fax Platform", value: technology.faxPlatform },
      { label: "Phone Platform", value: technology.phonePlatform },
      {
        label: "Current Care Management Platform",
        value: technology.currentCareManagementPlatform,
      },
      { label: "IT Contact Name", value: technology.itContactName },
      { label: "IT Contact Email", value: technology.itContactEmail },
      {
        label: "Additional Technical Notes",
        value: technology.additionalTechnicalNotes,
        span: 2,
      },
    ],
  );

  if (requestedServices.includes("BILLING_RCM")) {
    pdf.addSection(
      "Step 6 - Billing and Documentation",
      "Billing setup and banking documents.",
      [
        { label: "Current Billing Model", value: billing.currentBillingModel },
        ...(billing.currentBillingModel === "OUTSOURCED" || billing.currentBillingModel === "HYBRID"
          ? [{ label: "Billing Company Name", value: billing.billingCompanyName } as Field]
          : []),
        {
          label: "Main Billing Contact Name",
          value: billing.mainBillingContactName,
        },
        {
          label: "Main Billing Contact Email",
          value: billing.mainBillingContactEmail,
        },
        {
          label: "Main Billing Contact Phone",
          value: billing.mainBillingContactPhone,
        },
        { label: "Recent W9 Form", value: documentValue(billing.recentW9Form) },
        { label: "Void Check", value: documentValue(billing.voidCheck) },
        {
          label: "Formal Letter from Bank Stating the Client Holds an Account",
          value: documentValue(billing.formalLetterFromBank),
        },
        {
          label: "Currently Billed Services",
          value: billing.currentlyBilledServices,
        },
        { label: "Active Payers", value: billing.activePayers },
        { label: "EFT / ERA Setup", value: billing.eftEraSetup },
        { label: "Invoice Recipient", value: billing.invoiceRecipient },
        { label: "Invoice Email", value: billing.invoiceEmail },
        {
          label: "Preferred Reporting Cadence",
          value: billing.preferredReportingCadence,
        },
        { label: "Billing Pain Points", value: billing.billingPainPoints },
        { label: "Billing Notes", value: billing.additionalNotes, span: 2 },
      ],
    );
  }

  if (requestedServices.includes("CREDENTIALING")) {
    pdf.addSection(
      "Step 6 - Credentialing",
      "Insurance network, portal management, and credentialing requirements.",
      [
        {
          label: "Credentialing Needed",
          value: credentialing.credentialingNeeded,
        },
        { label: "Credentialing For", value: credentialing.credentialingFor },
        {
          label: "Payers to Enroll / Update",
          value: credentialing.payersToEnroll,
        },
        {
          label:
            "Excel spreadsheet or tracker listing approved and in-network insurances",
          value: documentValue(credentialing.approvedInsurancesTracker),
          span: 2,
        },
        {
          label: "Portal Designated Contact Name",
          value: credentialing.designatedPortalContactName,
        },
        {
          label: "Portal Designated Contact Email",
          value: credentialing.designatedPortalContactEmail,
        },
        {
          label: "Portal Designated Contact Phone",
          value: credentialing.designatedPortalContactPhone,
        },
        {
          label: "IRS Document - Letter 147C",
          value: documentValue(credentialing.irsDocument147c),
        },
        {
          label: "Desired Insurance Plans",
          value: credentialing.desiredInsurancePlans,
          span: 2,
        },
        {
          label: "Payer Portal Logins",
          value: Array.isArray(credentialing.payerPortalLogins)
            ? credentialing.payerPortalLogins
                .filter(
                  (login: any) =>
                    login?.payerName ||
                    login?.portalUrl ||
                    login?.username ||
                    login?.designatedContactName,
                )
                .map((login: any, index: number) => {
                  const parts = [
                    login?.payerName,
                    login?.portalUrl,
                    login?.username ? `user: ${login.username}` : "",
                    login?.designatedContactName
                      ? `contact: ${login.designatedContactName}`
                      : "",
                    login?.status,
                  ].filter(Boolean);
                  return `${index + 1}. ${parts.join(" | ")}`;
                })
                .join("\n")
            : "",
          span: 2,
        },
        { label: "CAQH Maintained", value: credentialing.caqhMaintained },
        {
          label: "Current Credentialing Issues",
          value: credentialing.currentCredentialingIssues,
        },
        {
          label: "Medicare PTAN Available",
          value: credentialing.medicarePtanAvailable,
        },
        {
          label: "Medicaid Enrollment Active",
          value: credentialing.medicaidEnrollmentActive,
        },
        {
          label: "Credentialing Notes",
          value: credentialing.additionalNotes,
          span: 2,
        },
      ],
    );
  }
}

function addOutreachSections(
  pdf: OnboardingPdf,
  onboarding: any,
  marketing: any,
  requestedServices: string[],
) {
  const outreach = onboarding.outreach ?? {};
  const labPharmacy = onboarding.labPharmacy ?? {};
  const compliance = onboarding.compliance ?? {};
  const hasMarketingSelected = requestedServices.some((service) =>
    marketingServiceValues.includes(service),
  );
  const hasLabPharmacySelected = requestedServices.some((service) =>
    ["LAB_RELATIONSHIP_SUPPORT", "PHARMACY_PROGRAM_SUPPORT"].includes(service),
  );

  pdf.addSection("Step 7 - Outreach", "Patient communication preferences.", [
    { label: "Preferred Channels", value: outreach.preferredChannels },
    { label: "Patient Text Consent", value: outreach.patientTextConsent },
    { label: "Preferred Languages", value: outreach.preferredLanguages },
    { label: "Interpreter Services", value: outreach.interpreterServices },
    { label: "Outreach From Practice", value: outreach.outreachFromPractice },
    { label: "Approved Outreach Hours", value: outreach.approvedOutreachHours },
    {
      label: "Messaging Requirements",
      value: outreach.messagingRequirements,
      span: 2,
    },
  ]);

  if (hasLabPharmacySelected) {
    pdf.addSection(
      "Step 7 - Lab and Pharmacy",
      "Lab and pharmacy relationship details.",
      [
        { label: "Preferred Lab", value: labPharmacy.preferredLab },
        {
          label: "Existing Lab Relationship",
          value: labPharmacy.existingLabRelationship,
        },
        { label: "Lab Interface Status", value: labPharmacy.labInterfaceStatus },
        { label: "Lab Contact Name", value: labPharmacy.labContactName },
        { label: "Lab Contact Email", value: labPharmacy.labContactEmail },
        {
          label: "Pharmacy Partner Name",
          value: labPharmacy.pharmacyPartnerName,
        },
        {
          label: "Pharmacy Partner Involved",
          value: labPharmacy.pharmacyPartnerInvolved,
        },
        {
          label: "Lab / Pharmacy Notes",
          value: labPharmacy.additionalNotes,
          span: 2,
        },
      ],
    );
  }

  pdf.addSection(
    "Step 7 - Compliance",
    "HIPAA, BAA, and security information.",
    [
      { label: "HIPAA Contact Name", value: compliance.hipaaContactName },
      { label: "HIPAA Contact Email", value: compliance.hipaaContactEmail },
      { label: "BAA Required", value: compliance.baaRequired },
      {
        label: "Security Questionnaire",
        value: compliance.securityQuestionnaire,
      },
      { label: "Current Concerns", value: compliance.currentConcerns },
      { label: "Compliance Notes", value: compliance.additionalNotes, span: 2 },
    ],
  );

  if (hasMarketingSelected) {
    pdf.addSection(
      "Step 7 - Marketing",
      "Marketing and patient acquisition details.",
      [
        { label: "Website URL", value: marketing?.websiteUrl },
        { label: "Social Media Channels", value: marketing?.socialMediaChannels },
        {
          label: "Current Marketing Channels",
          value: marketing?.currentMarketingChannels,
        },
        {
          label: "Target Patient Demographics",
          value: marketing?.targetPatientDemographics,
          span: 2,
        },
        {
          label: "Monthly Marketing Budget",
          value: marketing?.monthlyMarketingBudget,
        },
        { label: "Existing Brand Assets", value: marketing?.existingBrandAssets },
        {
          label: "Google Business Profile Claimed",
          value: marketing?.googleBusinessProfileClaimed,
        },
        {
          label: "Patient Acquisition Goals",
          value: marketing?.patientAcquisitionGoals,
          span: 2,
        },
        { label: "AI Tools Used", value: marketing?.aiToolsUsed },
        {
          label: "Additional Marketing Notes",
          value: marketing?.additionalMarketingNotes,
          span: 2,
        },
      ],
    );
  }
}
