type BillingRunComponentLike = {
  description?: string | null;
  metadata?: unknown;
};

type BillingRunItemLike = {
  description?: string | null;
  service?: {
    code?: string | null;
    name?: string | null;
  } | null;
  components?: BillingRunComponentLike[] | null;
  updatedAt?: Date | string | null;
};

function normalizeText(value?: string | null) {
  return value?.trim() || "";
}

function formatReadableDate(value?: Date | string | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatRequestTypeLabel(value?: string | null) {
  const normalized = normalizeText(value).toUpperCase();
  switch (normalized) {
    case "NEW_CREDENTIALING":
      return "New Credentialing";
    case "RE_CREDENTIALING":
      return "Re-credentialing";
    case "DEMOGRAPHIC_UPDATE":
      return "Demographic Update";
    case "ADD_LOCATION":
      return "Add Location";
    default:
      return normalizeText(value) || "-";
  }
}

function formatStatusLabel(value?: string | null) {
  const normalized = normalizeText(value).toUpperCase();
  switch (normalized) {
    case "CONTRACTED_DIRECT":
    case "CONTRACTED - DIRECT":
      return "Contracted - Direct";
    case "CONTRACTED_IPA_DELEGATED":
    case "CONTRACTED - IPA/DELEGATED":
      return "Contracted - IPA/Delegated";
    default:
      return normalizeText(value) || "-";
  }
}

function parseMetadata(metadata: unknown) {
  if (!metadata) return null;
  if (typeof metadata === "string") {
    try {
      return JSON.parse(metadata) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (typeof metadata === "object") {
    return metadata as Record<string, unknown>;
  }
  return null;
}

export function formatBillingLineItemDescription(item: BillingRunItemLike) {
  const baseDescription =
    normalizeText(item.description) || normalizeText(item.service?.name) || "Service";
  const serviceCode = normalizeText(item.service?.code).toUpperCase();
  const isCredentialing =
    serviceCode === "CREDENTIALING_CHARGE" ||
    /^credentialing\b/i.test(baseDescription);

  if (!isCredentialing) {
    return baseDescription;
  }

  if (/\|\s*credentialing type:/i.test(baseDescription)) {
    return baseDescription;
  }

  const component = item.components?.[0];
  const metadata = parseMetadata(component?.metadata);
  const credentialingId = normalizeText(
    typeof metadata?.credentialingId === "string"
      ? metadata.credentialingId
      : undefined,
  );

  if (!credentialingId) {
    return baseDescription;
  }

  const requestType = formatRequestTypeLabel(
    typeof metadata?.requestType === "string" ? metadata.requestType : undefined,
  );
  const status = formatStatusLabel(
    typeof metadata?.status === "string" ? metadata.status : undefined,
  );
  const updatedAt = formatReadableDate(
    typeof metadata?.updatedAt === "string" || metadata?.updatedAt instanceof Date
      ? metadata.updatedAt
      : item.updatedAt,
  );

  const parts = [
    `Credentialing: ${credentialingId}`,
    `Type: ${requestType}`,
    `Status: ${status}`,
  ];

  if (updatedAt) {
    parts.push(`Date: ${updatedAt}`);
  }

  return parts.join(", ");
}

export function formatGroupedBillingLineItemDescription(
  items: BillingRunItemLike[],
) {
  const descriptions = items
    .map((item, index) => {
      const description = formatBillingLineItemDescription(item);
      if (!description) {
        return "";
      }
      return description;
    })
    .filter((description) => Boolean(description.trim()));

  if (descriptions.length === 0) {
    return "";
  }

  return descriptions.join("\n");
}

function isCredentialingLineItem(item: BillingRunItemLike) {
  const baseDescription =
    normalizeText(item.description) || normalizeText(item.service?.name);
  const serviceCode = normalizeText(item.service?.code).toUpperCase();
  return (
    serviceCode === "CREDENTIALING_CHARGE" ||
    /^credentialing\b/i.test(baseDescription)
  );
}

function isProcessingFeeLineItem(item: BillingRunItemLike) {
  return /processing fee/i.test(normalizeText(item.description));
}

export function orderBillingLineItemsForDisplay<
  T extends {
    description?: string | null;
    service?: {
      code?: string | null;
      name?: string | null;
    } | null;
  },
>(items: T[]) {
  return [...items].sort((a, b) => {
    const rank = (item: BillingRunItemLike) => {
      if (isProcessingFeeLineItem(item)) return 2;
      if (isCredentialingLineItem(item)) return 1;
      return 0;
    };

    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) {
      return rankDiff;
    }

    return 0;
  });
}
