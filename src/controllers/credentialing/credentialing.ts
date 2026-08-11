import { Response } from "express";
import {
  CredentialingActivityType,
  CredentialingCommunicationChannel,
  CredentialingContractType,
  CredentialingDirection,
  CredentialingDocumentType,
  CredentialingPriority,
  CredentialingRequestStatus,
  CredentialingRequestType,
  CredentialingVerificationStatus,
  Prisma,
} from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import {
  createCredentialingDocumentsSasUrlFromBlobUrl,
  uploadBufferToCredentialingDocumentsBlob,
} from "../../utils/credentialingDocumentsBlob";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

type CredentialingDocumentInput = {
  id?: string;
  documentType?: string;
  fileName?: string;
  fileUrl?: string;
  fileBase64?: string;
  fileSize?: number;
  mimeType?: string;
  expiryDate?: string | null;
  uploadedByName?: string | null;
};

type CredentialingFollowUpInput = {
  id?: string;
  dateTime?: string;
  channel?: string;
  direction?: string;
  referenceNumber?: string | null;
  summary?: string;
  nextAction?: string | null;
  loggedByName?: string | null;
};

type CredentialingBody = {
  credentialingId?: string;
  practiceId?: string;
  practiceName?: string;
  providerId?: string;
  providerName?: string;
  insurancePayerName?: string;
  requestType?: string;
  contractType?: string;
  ipaDelegatedEntityName?: string | null;
  status?: string;
  payerProviderId?: string | null;
  startDate?: string | null;
  submissionDate?: string | null;
  effectiveDate?: string | null;
  expirationDate?: string | null;
  nextFollowUpDate?: string | null;
  reCredentialingDueDate?: string | null;
  lastActivityDate?: string | null;
  tinVerified?: string;
  addressVerified?: string;
  lineOfBusiness?: string[];
  priority?: string;
  internalNotes?: string | null;
  notes?: string | null;
  enrollmentId?: string | null;
  assignedToUserId?: string | null;
  assignedToUserName?: string | null;
  documents?: CredentialingDocumentInput[];
  followUpLogs?: CredentialingFollowUpInput[];
};

type QueryParams = {
  page?: string;
  limit?: string;
  search?: string;
  practice?: string;
  provider?: string;
  insuranceCompany?: string;
  status?: string;
  credentialingType?: string;
  contractType?: string;
  assignedUser?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: string;
};

const STATUS_ALIASES: Record<string, CredentialingRequestStatus> = {
  NOT_STARTED: CredentialingRequestStatus.NOT_STARTED,
  APPLICATION_SUBMITTED: CredentialingRequestStatus.APPLICATION_SUBMITTED,
  IN_PROCESS_PAYER_REVIEW: CredentialingRequestStatus.IN_PROCESS_PAYER_REVIEW,
  PENDING_ADDITIONAL_INFO: CredentialingRequestStatus.PENDING_ADDITIONAL_INFO,
  CONTRACTED_DIRECT: CredentialingRequestStatus.CONTRACTED_DIRECT,
  CONTRACTED_IPA_DELEGATED: CredentialingRequestStatus.CONTRACTED_IPA_DELEGATED,
  OUT_OF_NETWORK: CredentialingRequestStatus.OUT_OF_NETWORK,
  OUT_OF_NETWORK_OON: CredentialingRequestStatus.OUT_OF_NETWORK,
  DECLINED_APPLICATION_REJECTED:
    CredentialingRequestStatus.DECLINED_APPLICATION_REJECTED,
  RE_CREDENTIALING_DUE: CredentialingRequestStatus.RE_CREDENTIALING_DUE,
  TERMINATED: CredentialingRequestStatus.TERMINATED,
};

const REQUEST_TYPE_ALIASES: Record<string, CredentialingRequestType> = {
  NEW_CREDENTIALING: CredentialingRequestType.NEW_CREDENTIALING,
  RE_CREDENTIALING: CredentialingRequestType.RE_CREDENTIALING,
  DEMOGRAPHIC_UPDATE: CredentialingRequestType.DEMOGRAPHIC_UPDATE,
  ADD_LOCATION: CredentialingRequestType.ADD_LOCATION,
};

const CONTRACT_TYPE_ALIASES: Record<string, CredentialingContractType> = {
  DIRECT_CONTRACT: CredentialingContractType.DIRECT_CONTRACT,
  IPA_DELEGATED: CredentialingContractType.IPA_DELEGATED,
  UNKNOWN_PENDING_CONFIRMATION:
    CredentialingContractType.UNKNOWN_PENDING_CONFIRMATION,
};

const VERIFICATION_ALIASES: Record<string, CredentialingVerificationStatus> = {
  YES: CredentialingVerificationStatus.YES,
  NO: CredentialingVerificationStatus.NO,
  PENDING: CredentialingVerificationStatus.PENDING,
};

const PRIORITY_ALIASES: Record<string, CredentialingPriority> = {
  HIGH: CredentialingPriority.HIGH,
  MEDIUM: CredentialingPriority.MEDIUM,
  LOW: CredentialingPriority.LOW,
};

const CHANNEL_ALIASES: Record<string, CredentialingCommunicationChannel> = {
  PHONE: CredentialingCommunicationChannel.PHONE,
  EMAIL: CredentialingCommunicationChannel.EMAIL,
  PAYER_PORTAL: CredentialingCommunicationChannel.PAYER_PORTAL,
  FAX: CredentialingCommunicationChannel.FAX,
  MAIL: CredentialingCommunicationChannel.MAIL,
};

const DIRECTION_ALIASES: Record<string, CredentialingDirection> = {
  OUTBOUND: CredentialingDirection.OUTBOUND,
  INBOUND: CredentialingDirection.INBOUND,
};

const DOCUMENT_TYPE_ALIASES: Record<string, CredentialingDocumentType> = {
  MEDICAL_LICENSE: CredentialingDocumentType.MEDICAL_LICENSE,
  DEA: CredentialingDocumentType.DEA,
  BOARD_CERTIFICATE: CredentialingDocumentType.BOARD_CERTIFICATE,
  CV: CredentialingDocumentType.CV,
  W9: CredentialingDocumentType.W9,
  INSURANCE_CERTIFICATE: CredentialingDocumentType.INSURANCE_CERTIFICATE,
  OTHER_DOCUMENTS: CredentialingDocumentType.OTHER_DOCUMENTS,
};

function normalizeKey(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function parseEnumValue<T extends string>(
  value: string | undefined | null,
  aliases: Record<string, T>,
  fallback?: T,
): T | undefined {
  if (!value) return fallback;
  const normalized = normalizeKey(value);
  return aliases[normalized] ?? fallback;
}

function formatDate(value?: Date | string | null) {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function formatFriendlyDate(value?: Date | string | null) {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function formatActivityDateOnly(value?: Date | string | null) {
  if (!value) return "";
  if (typeof value === "string") {
    const dateMatch = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) return dateMatch[1];
  }

  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";

  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getActorName(req: AuthenticatedRequest) {
  if (!req.user) return "System";
  return req.user.userName || req.user.email || "System";
}

function getStatusLabel(status?: CredentialingRequestStatus | string | null) {
  if (!status) return "Not Started";
  switch (status) {
    case CredentialingRequestStatus.NOT_STARTED:
      return "Not Started";
    case CredentialingRequestStatus.APPLICATION_SUBMITTED:
      return "Application Submitted";
    case CredentialingRequestStatus.IN_PROCESS_PAYER_REVIEW:
      return "In Process - Payer Review";
    case CredentialingRequestStatus.PENDING_ADDITIONAL_INFO:
      return "Pending Additional Info";
    case CredentialingRequestStatus.CONTRACTED_DIRECT:
      return "Contracted - Direct";
    case CredentialingRequestStatus.CONTRACTED_IPA_DELEGATED:
      return "Contracted - IPA/Delegated";
    case CredentialingRequestStatus.OUT_OF_NETWORK:
      return "Out-of-Network (OON)";
    case CredentialingRequestStatus.DECLINED_APPLICATION_REJECTED:
      return "Declined / Application Rejected";
    case CredentialingRequestStatus.RE_CREDENTIALING_DUE:
      return "Re-credentialing Due";
    case CredentialingRequestStatus.TERMINATED:
      return "Terminated";
    default:
      return String(status);
  }
}

function getRequestTypeLabel(type: CredentialingRequestType) {
  switch (type) {
    case CredentialingRequestType.NEW_CREDENTIALING:
      return "New Credentialing";
    case CredentialingRequestType.RE_CREDENTIALING:
      return "Re-credentialing";
    case CredentialingRequestType.DEMOGRAPHIC_UPDATE:
      return "Demographic Update";
    case CredentialingRequestType.ADD_LOCATION:
      return "Add Location";
  }
}

function getContractTypeLabel(type: CredentialingContractType) {
  switch (type) {
    case CredentialingContractType.DIRECT_CONTRACT:
      return "Direct Contract";
    case CredentialingContractType.IPA_DELEGATED:
      return "IPA-Delegated";
    case CredentialingContractType.UNKNOWN_PENDING_CONFIRMATION:
      return "Unknown - Pending Confirmation";
  }
}

function getVerificationLabel(
  value: CredentialingVerificationStatus,
): "Yes" | "No" | "Pending" {
  switch (value) {
    case CredentialingVerificationStatus.YES:
      return "Yes";
    case CredentialingVerificationStatus.NO:
      return "No";
    case CredentialingVerificationStatus.PENDING:
      return "Pending";
  }
}

function getPriorityLabel(value: CredentialingPriority) {
  switch (value) {
    case CredentialingPriority.HIGH:
      return "High";
    case CredentialingPriority.MEDIUM:
      return "Medium";
    case CredentialingPriority.LOW:
      return "Low";
  }
}

function getChannelLabel(value?: CredentialingCommunicationChannel | string) {
  switch (value) {
    case CredentialingCommunicationChannel.PHONE:
      return "Phone";
    case CredentialingCommunicationChannel.EMAIL:
      return "Email";
    case CredentialingCommunicationChannel.PAYER_PORTAL:
      return "Payer Portal";
    case CredentialingCommunicationChannel.FAX:
      return "Fax";
    case CredentialingCommunicationChannel.MAIL:
      return "Mail";
    default:
      return String(value || "");
  }
}

function getDirectionLabel(value?: CredentialingDirection | string) {
  return value === CredentialingDirection.INBOUND ? "Inbound" : "Outbound";
}

function getDocumentTypeLabel(value: CredentialingDocumentType | string) {
  switch (value) {
    case CredentialingDocumentType.MEDICAL_LICENSE:
      return "Medical License";
    case CredentialingDocumentType.DEA:
      return "DEA";
    case CredentialingDocumentType.BOARD_CERTIFICATE:
      return "Board Certificate";
    case CredentialingDocumentType.CV:
      return "CV";
    case CredentialingDocumentType.W9:
      return "W9";
    case CredentialingDocumentType.INSURANCE_CERTIFICATE:
      return "Insurance Certificate";
    case CredentialingDocumentType.OTHER_DOCUMENTS:
      return "Other Documents";
    default:
      return String(value || "Other Documents");
  }
}

function mapDocument(document: {
  id: string;
  documentType: CredentialingDocumentType;
  fileName: string;
  fileUrl: string | null;
  fileSize: number | null;
  mimeType: string | null;
  expiryDate: Date | null;
  uploadedByName: string | null;
  createdAt: Date;
}) {
  return {
    id: document.id,
    name: document.fileName,
    type: getDocumentTypeLabel(document.documentType),
    uploadedAt: formatFriendlyDate(document.createdAt),
    uploadedBy: document.uploadedByName || "Admin",
    expiryDate: formatFriendlyDate(document.expiryDate),
    fileUrl: document.fileUrl
      ? document.fileUrl.includes("?")
        ? document.fileUrl
        : createCredentialingDocumentsSasUrlFromBlobUrl(document.fileUrl)
      : null,
    fileSize: document.fileSize ?? undefined,
    mimeType: document.mimeType || undefined,
  };
}

function mapFollowUp(log: {
  id: string;
  dateTime: Date;
  channel: CredentialingCommunicationChannel;
  direction: CredentialingDirection;
  referenceNumber: string | null;
  summary: string;
  nextAction: string | null;
  loggedByName: string | null;
  createdAt: Date;
}) {
  return {
    id: log.id,
    dateTime: formatFriendlyDate(log.dateTime),
    channel: getChannelLabel(log.channel),
    direction: getDirectionLabel(log.direction),
    referenceNumber: log.referenceNumber || "",
    summary: log.summary,
    nextAction: log.nextAction || "",
    loggedBy: log.loggedByName || "Admin",
  };
}

function mapActivity(activity: {
  id: string;
  activityType: CredentialingActivityType;
  action: string;
  details: string | null;
  actorName: string | null;
  createdAt: Date;
}) {
  return {
    id: activity.id,
    action: activity.action,
    details: (activity.details || "").replace(/\[reminderKey:[^\]]+\]\s*/g, "").trim(),
    actor: activity.actorName || "Admin",
    createdAt: formatFriendlyDate(activity.createdAt),
  };
}

function mapRequest(request: any) {
  const practiceName = request.practice?.name || "";
  const providerName = request.provider
    ? [request.provider.firstName, request.provider.lastName].filter(Boolean).join(" ")
    : request.providerName || "";
  const assignedToUserName = request.assignedToUser
    ? [
        [request.assignedToUser.firstName, request.assignedToUser.lastName]
          .filter(Boolean)
          .join(" ")
          .trim(),
        request.assignedToUser.userName,
        request.assignedToUser.email,
      ].find((entry) => Boolean(entry && String(entry).trim())) || ""
    : "";

  return {
    id: request.id,
    credentialingId: request.credentialingId,
    practiceId: request.practiceId,
    practice: practiceName,
    providerId: request.providerId || "",
    provider: providerName,
    insuranceCompany: request.insurancePayerName,
    insurancePayerName: request.insurancePayerName,
    credentialingType: getRequestTypeLabel(request.requestType),
    contractType: getContractTypeLabel(request.contractType),
    ipaDelegatedEntityName: request.ipaDelegatedEntityName || "",
    status: getStatusLabel(request.status),
    payerProviderId: request.payerProviderId || "",
    startDate: formatFriendlyDate(request.startDate),
    submissionDate: formatFriendlyDate(request.submissionDate),
    effectiveDate: formatFriendlyDate(request.effectiveDate),
    expirationDate: formatFriendlyDate(request.expirationDate),
    nextFollowUpDate: formatFriendlyDate(request.nextFollowUpDate),
    reCredentialingDueDate: formatFriendlyDate(request.reCredentialingDueDate),
    lastActivityDate: formatFriendlyDate(request.lastActivityDate || request.updatedAt),
    tinVerified: getVerificationLabel(request.tinVerified),
    addressVerified: getVerificationLabel(request.addressVerified),
    lineOfBusiness: Array.isArray(request.lineOfBusiness)
      ? request.lineOfBusiness
      : [],
    priority: getPriorityLabel(request.priority),
    internalNotes: request.internalNotes || "",
    notes: request.notes || "",
    enrollmentId: request.enrollmentId || "",
    assignedToUserId: request.assignedToUserId || "",
    assignedUserId: request.assignedToUserId || "",
    assignedUser: assignedToUserName,
    createdByUserId: request.createdByUserId || "",
    updatedByUserId: request.updatedByUserId || "",
    documents: Array.isArray(request.documents)
      ? request.documents.map(mapDocument)
      : [],
    followUpLogs: Array.isArray(request.followUpLogs)
      ? request.followUpLogs.map(mapFollowUp)
      : [],
    activity: Array.isArray(request.activityLogs)
      ? request.activityLogs.map(mapActivity)
      : [],
    credentialingChargeBilledAt: request.credentialingChargeBilledAt
      ? request.credentialingChargeBilledAt.toISOString()
      : null,
    credentialingChargeInvoiceLineItemId:
      request.credentialingChargeInvoiceLineItemId || null,
    createdAt: formatFriendlyDate(request.createdAt),
    updatedAt: formatFriendlyDate(request.updatedAt),
  };
}

function buildCredentialingWhere(query: QueryParams): Prisma.CredentialingRequestWhereInput {
  const where: Prisma.CredentialingRequestWhereInput = {};
  const clauses: Prisma.CredentialingRequestWhereInput[] = [];
  const search = query.search?.trim();

  if (search) {
    clauses.push({
      OR: [
      { credentialingId: { contains: search, mode: "insensitive" } },
      { insurancePayerName: { contains: search, mode: "insensitive" } },
      { providerName: { contains: search, mode: "insensitive" } },
      { internalNotes: { contains: search, mode: "insensitive" } },
      { notes: { contains: search, mode: "insensitive" } },
      { enrollmentId: { contains: search, mode: "insensitive" } },
      {
        practice: {
          name: { contains: search, mode: "insensitive" },
        },
      },
      {
        assignedToUser: {
          OR: [
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
            { userName: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        },
      },
      ],
    });
  }

  const practiceTerm = query.practice?.trim();
  if (practiceTerm) {
    where.practice = {
      name: { contains: practiceTerm, mode: "insensitive" },
    };
  }

  const providerTerm = query.provider?.trim();
  if (providerTerm) {
    clauses.push({
      OR: [
      { providerName: { contains: providerTerm, mode: "insensitive" } },
      {
        provider: {
          OR: [
            { firstName: { contains: providerTerm, mode: "insensitive" } },
            { lastName: { contains: providerTerm, mode: "insensitive" } },
          ],
        },
      },
      ],
    });
  }

  const payerTerm = query.insuranceCompany?.trim();
  if (payerTerm) {
    where.insurancePayerName = { contains: payerTerm, mode: "insensitive" };
  }

  const status = parseEnumValue(query.status, STATUS_ALIASES);
  if (status) {
    where.status = status;
  }

  const requestType = parseEnumValue(query.credentialingType, REQUEST_TYPE_ALIASES);
  if (requestType) {
    where.requestType = requestType;
  }

  const contractType = parseEnumValue(query.contractType, CONTRACT_TYPE_ALIASES);
  if (contractType) {
    where.contractType = contractType;
  }

  const assignedTerm = query.assignedUser?.trim();
  if (assignedTerm) {
    clauses.push({
      OR: [
      { assignedToUserId: { equals: assignedTerm } },
      {
        assignedToUser: {
          OR: [
            { firstName: { contains: assignedTerm, mode: "insensitive" } },
            { lastName: { contains: assignedTerm, mode: "insensitive" } },
            { userName: { contains: assignedTerm, mode: "insensitive" } },
            { email: { contains: assignedTerm, mode: "insensitive" } },
          ],
        },
      },
      ],
    });
  }

  if (query.dateFrom || query.dateTo) {
    where.submissionDate = {};
    if (query.dateFrom) {
      where.submissionDate.gte = new Date(query.dateFrom);
    }
    if (query.dateTo) {
      const dateTo = new Date(query.dateTo);
      dateTo.setHours(23, 59, 59, 999);
      where.submissionDate.lte = dateTo;
    }
  }

  if (clauses.length) {
    where.AND = clauses;
  }

  return where;
}

function buildSortOrder(sortBy?: string, sortOrder?: string): Prisma.CredentialingRequestOrderByWithRelationInput[] {
  const direction = sortOrder?.toLowerCase() === "asc" ? "asc" : "desc";
  switch (sortBy) {
    case "credentialingId":
      return [{ credentialingId: direction }];
    case "practice":
      return [{ practice: { name: direction } }];
    case "provider":
      return [{ providerName: direction }];
    case "insuranceCompany":
      return [{ insurancePayerName: direction }];
    case "credentialingType":
      return [{ requestType: direction }];
    case "status":
      return [{ status: direction }];
    case "assignedUser":
      return [{ assignedToUser: { firstName: direction } }];
    case "submissionDate":
      return [{ submissionDate: direction }];
    case "effectiveDate":
      return [{ effectiveDate: direction }];
    case "expirationDate":
      return [{ expirationDate: direction }];
    case "updatedAt":
    default:
      return [{ updatedAt: direction }];
  }
}

async function resolvePracticeId(practiceId?: string, practiceName?: string) {
  if (practiceId) {
    const practice = await prisma.practice.findUnique({ where: { id: practiceId } });
    if (practice) {
      return practice.id;
    }
  }

  if (practiceName?.trim()) {
    const practice = await prisma.practice.findFirst({
      where: { name: { equals: practiceName.trim(), mode: "insensitive" } },
    });
    if (practice) {
      return practice.id;
    }
  }

  return null;
}

async function resolvePersonId(providerId?: string, providerName?: string) {
  if (providerId) {
    const person = await prisma.person.findUnique({ where: { id: providerId } });
    if (person) {
      return person.id;
    }
  }

  if (providerName?.trim()) {
    const normalized = providerName.trim();
    const person = await prisma.person.findFirst({
      where: {
        OR: [
          {
            AND: [
              { firstName: { equals: normalized, mode: "insensitive" } },
            ],
          },
          {
            AND: [
              { lastName: { equals: normalized, mode: "insensitive" } },
            ],
          },
          {
            AND: [
              {
                firstName: {
                  contains: normalized.split(" ")[0] ?? normalized,
                  mode: "insensitive",
                },
              },
              {
                lastName: {
                  contains: normalized.split(" ").slice(1).join(" "),
                  mode: "insensitive",
                },
              },
            ],
          },
        ],
      },
    });
    if (person) {
      return person.id;
    }
  }

  return null;
}

async function resolveUserId(userId?: string | null, userName?: string | null) {
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) return user.id;
  }

  const term = userName?.trim();
  if (!term) return null;

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { userName: { equals: term, mode: "insensitive" } },
        { email: { equals: term, mode: "insensitive" } },
        { firstName: { contains: term, mode: "insensitive" } },
        { lastName: { contains: term, mode: "insensitive" } },
        {
          AND: [
            { firstName: { contains: term.split(" ")[0] || term, mode: "insensitive" } },
            {
              lastName: {
                contains: term.split(" ").slice(1).join(" ") || term,
                mode: "insensitive",
              },
            },
          ],
        },
      ],
    },
  });

  return user?.id ?? null;
}

async function resolveBodyReferences(body: CredentialingBody) {
  const practiceResolvedId = await resolvePracticeId(body.practiceId, body.practiceName);
  if (!practiceResolvedId) {
    return { error: "Valid practice is required." as const };
  }

  const providerResolvedId = await resolvePersonId(body.providerId, body.providerName);
  const assignedResolvedId = await resolveUserId(
    body.assignedToUserId,
    body.assignedToUserName,
  );

  return {
    practiceResolvedId,
    providerResolvedId,
    assignedResolvedId,
  };
}

function normalizeComparableValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).map((entry) => String(entry).trim()).sort().join("|");
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function formatChangedField(label: string, previousValue: unknown, nextValue: unknown) {
  const prev = normalizeComparableValue(previousValue);
  const next = normalizeComparableValue(nextValue);
  if (prev === next) return null;
  return `${label}: ${prev || "-"} -> ${next || "-"}`;
}

const DUPLICATE_CREDENTIALING_MESSAGE =
  "A credentialing request already exists for this practice, provider, and insurance plan. Please update the existing request instead of creating a duplicate.";

async function findDuplicateCredentialingRequest(
  practiceId: string,
  providerId: string,
  insurancePayerName: string,
  requestType: CredentialingRequestType,
  excludeId?: string,
) {
  return prisma.credentialingRequest.findFirst({
    where: {
      practiceId,
      providerId,
      insurancePayerName: { equals: insurancePayerName, mode: "insensitive" },
      requestType,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true },
  });
}

function isUniqueCredentialingRequestConflict(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as any).code === "P2002");
}

async function buildActivityEntries(
  requestId: string,
  previous: any | null,
  nextPayload: CredentialingBody,
  actorName: string,
  documentDetails: string[] = [],
  followUpDetails: string[] = [],
) {
  const entries: Prisma.CredentialingActivityLogCreateManyInput[] = [];
  const now = new Date();

  function pushEntry(
    action: string,
    detailsParts: string[],
    activityType: CredentialingActivityType = CredentialingActivityType.EDITED,
  ) {
    if (!detailsParts.length) {
      return;
    }

    entries.push({
      credentialingRequestId: requestId,
      activityType,
      action,
      details: detailsParts.join("; "),
      actorName,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (!previous) {
    const detailsParts = [
      `Credentialing request created for ${nextPayload.providerName || nextPayload.practiceName || "practice"}.`,
      `Status: ${getStatusLabel(nextPayload.status) || nextPayload.status || "Not Started"}`,
    ];

    pushEntry("Created Credentialing", detailsParts, CredentialingActivityType.CREATED);
    if (documentDetails.length) {
      pushEntry("Document Uploaded", documentDetails, CredentialingActivityType.DOCUMENT_UPLOADED);
    }
    if (followUpDetails.length) {
      pushEntry("Follow-up Logged", followUpDetails, CredentialingActivityType.FOLLOW_UP_LOGGED);
    }
    return entries;
  }

  const changedFields = [
    formatChangedField("Practice", previous.practice?.name || previous.practiceId, nextPayload.practiceName || nextPayload.practiceId),
    formatChangedField("Provider", previous.providerName || previous.providerId, nextPayload.providerName || nextPayload.providerId),
    formatChangedField("Insurance Plan", previous.insurancePayerName, nextPayload.insurancePayerName),
    formatChangedField("Request Type", getRequestTypeLabel(previous.requestType), nextPayload.requestType),
    formatChangedField("Contract Type", getContractTypeLabel(previous.contractType), nextPayload.contractType),
    formatChangedField("IPA / Delegated Entity", previous.ipaDelegatedEntityName || "", nextPayload.ipaDelegatedEntityName || ""),
    formatChangedField("Assigned Specialist", previous.assignedToUser?.id || previous.assignedToUserId || "", nextPayload.assignedToUserId || ""),
    formatChangedField("Priority", getPriorityLabel(previous.priority), nextPayload.priority),
    formatChangedField("Status", getStatusLabel(previous.status), nextPayload.status),
    formatChangedField("Payer Provider ID", previous.payerProviderId || "", nextPayload.payerProviderId || ""),
    formatChangedField("Submission Date", formatActivityDateOnly(previous.submissionDate), formatActivityDateOnly(nextPayload.submissionDate)),
    formatChangedField("Effective Date", formatActivityDateOnly(previous.effectiveDate), formatActivityDateOnly(nextPayload.effectiveDate)),
    formatChangedField("Expiration Date", formatActivityDateOnly(previous.expirationDate), formatActivityDateOnly(nextPayload.expirationDate)),
    formatChangedField("Next Follow-up Date", formatActivityDateOnly(previous.nextFollowUpDate), formatActivityDateOnly(nextPayload.nextFollowUpDate)),
    formatChangedField("Re-credentialing Due Date", formatActivityDateOnly(previous.reCredentialingDueDate), formatActivityDateOnly(nextPayload.reCredentialingDueDate)),
    formatChangedField("TIN Verified", getVerificationLabel(previous.tinVerified), nextPayload.tinVerified),
    formatChangedField("Address Verified", getVerificationLabel(previous.addressVerified), nextPayload.addressVerified),
    formatChangedField("Lines of Business", previous.lineOfBusiness || [], nextPayload.lineOfBusiness || []),
    formatChangedField("Internal Notes", previous.internalNotes || "", nextPayload.internalNotes || ""),
    formatChangedField("Notes", previous.notes || "", nextPayload.notes || ""),
    formatChangedField("Enrollment ID", previous.enrollmentId || "", nextPayload.enrollmentId || ""),
  ].filter((entry): entry is string => Boolean(entry));

  if (changedFields.length) {
    pushEntry("Edited Record", changedFields, CredentialingActivityType.EDITED);
  }
  if (documentDetails.length) {
    pushEntry("Document Uploaded", documentDetails, CredentialingActivityType.DOCUMENT_UPLOADED);
  }
  if (followUpDetails.length) {
    pushEntry("Follow-up Logged", followUpDetails, CredentialingActivityType.FOLLOW_UP_LOGGED);
  }

  return entries;
}

function normalizeActivityText(value?: string | null) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function buildDocumentDetailLines(
  documents: Array<{
    documentType?: CredentialingDocumentType | string;
    fileName?: string;
    expiryDate?: Date | string | null;
  }>,
) {
  return documents.map((document) =>
    document.fileName ? `File: ${document.fileName}` : "Document Uploaded",
  );
}

function buildFollowUpDetailLines(
  followUps: Array<{
    dateTime?: Date | string;
    channel?: CredentialingCommunicationChannel | string;
    direction?: CredentialingDirection | string;
    referenceNumber?: string | null;
    summary?: string | null;
    nextAction?: string | null;
  }>,
) {
  return followUps.map((followUp) => {
    const parts = [
      followUp.summary ? `Summary: ${followUp.summary}` : null,
      followUp.referenceNumber ? `Reference: ${followUp.referenceNumber}` : null,
      followUp.nextAction ? `Next Action: ${followUp.nextAction}` : null,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join("; ") : "Follow-up Logged";
  });
}

function normalizeDocumentSignature(document: {
  documentType?: string | CredentialingDocumentType | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  expiryDate?: Date | string | null;
}) {
  return [
    normalizeKey(String(document.documentType || "")),
    normalizeActivityText(document.fileName),
    String(document.fileSize ?? ""),
    normalizeActivityText(document.mimeType),
    formatActivityDateOnly(document.expiryDate),
  ].join("|");
}

function normalizeFollowUpSignature(followUp: {
  dateTime?: Date | string | null;
  channel?: string | CredentialingCommunicationChannel | null;
  direction?: string | CredentialingDirection | null;
  referenceNumber?: string | null;
  summary?: string | null;
  nextAction?: string | null;
}) {
  return [
    formatActivityDateOnly(followUp.dateTime),
    normalizeKey(String(followUp.channel || "")),
    normalizeKey(String(followUp.direction || "")),
    normalizeActivityText(followUp.referenceNumber),
    normalizeActivityText(followUp.summary),
    normalizeActivityText(followUp.nextAction),
  ].join("|");
}

function getChangedDocumentEntries(
  existingDocuments: Array<{
    id: string;
    documentType: CredentialingDocumentType;
    fileName: string;
    fileUrl: string | null;
    fileSize: number | null;
    mimeType: string | null;
    expiryDate: Date | null;
  }>,
  incomingDocuments: Array<{
    id?: string;
    documentType?: string;
    fileName?: string;
    fileUrl?: string | null;
    fileBase64?: string;
    fileSize?: number | null;
    mimeType?: string | null;
    expiryDate?: string | null;
    uploadedByName?: string | null;
  }>,
) {
  const existingById = new Map(existingDocuments.map((document) => [document.id, document]));

  return incomingDocuments.filter((document) => {
    const incomingId = document.id?.trim();
    if (!incomingId) {
      return true;
    }

    const existing = existingById.get(incomingId);
    if (!existing) {
      return true;
    }

    return (
      normalizeDocumentSignature(existing) !==
      normalizeDocumentSignature({
        documentType: document.documentType || existing.documentType,
        fileName: document.fileName || existing.fileName,
        fileSize: document.fileSize ?? existing.fileSize,
        mimeType: document.mimeType ?? existing.mimeType,
        expiryDate: document.expiryDate || existing.expiryDate,
      })
    );
  });
}

function getChangedFollowUpEntries(
  existingFollowUps: Array<{
    id: string;
    dateTime: Date;
    channel: CredentialingCommunicationChannel;
    direction: CredentialingDirection;
    referenceNumber: string | null;
    summary: string;
    nextAction: string | null;
  }>,
  incomingFollowUps: Array<{
    id?: string;
    dateTime?: string;
    channel?: string;
    direction?: string;
    referenceNumber?: string | null;
    summary?: string;
    nextAction?: string | null;
    loggedByName?: string | null;
  }>,
) {
  const existingById = new Map(existingFollowUps.map((followUp) => [followUp.id, followUp]));

  return incomingFollowUps.filter((followUp) => {
    const incomingId = followUp.id?.trim();
    if (!incomingId) {
      return true;
    }

    const existing = existingById.get(incomingId);
    if (!existing) {
      return true;
    }

    return (
      normalizeFollowUpSignature(existing) !==
      normalizeFollowUpSignature({
        dateTime: followUp.dateTime || existing.dateTime,
        channel: followUp.channel || existing.channel,
        direction: followUp.direction || existing.direction,
        referenceNumber: followUp.referenceNumber ?? existing.referenceNumber,
        summary: followUp.summary ?? existing.summary,
        nextAction: followUp.nextAction ?? existing.nextAction,
      })
    );
  });
}

function buildCredentialingData(
  body: CredentialingBody,
  refs: {
    practiceResolvedId: string;
    providerResolvedId: string | null;
    assignedResolvedId: string | null;
  },
  currentUserId: string,
  fallbackCredentialingId?: string,
) {
  const requestType = parseEnumValue(body.requestType, REQUEST_TYPE_ALIASES);
  const contractType = parseEnumValue(body.contractType, CONTRACT_TYPE_ALIASES);
  const status = parseEnumValue(body.status, STATUS_ALIASES);
  const tinVerified = parseEnumValue(body.tinVerified, VERIFICATION_ALIASES);
  const addressVerified = parseEnumValue(body.addressVerified, VERIFICATION_ALIASES);
  const priority = parseEnumValue(body.priority, PRIORITY_ALIASES);

  if (!requestType || !contractType || !status || !tinVerified || !addressVerified || !priority) {
    return { error: "One or more credentialing values are invalid." as const };
  }

  if (!refs.providerResolvedId) {
    return { error: "Provider is required." as const };
  }

  if (!body.insurancePayerName?.trim()) {
    return { error: "Insurance Plan is required." as const };
  }

  if (!refs.assignedResolvedId) {
    return { error: "Assigned Specialist is required." as const };
  }

  return {
    credentialingId:
      body.credentialingId?.trim() ||
      fallbackCredentialingId ||
      `CRD${String(Date.now())}`,
    practiceId: refs.practiceResolvedId,
    providerId: refs.providerResolvedId,
    providerName: body.providerName?.trim() || undefined,
    insurancePayerName: body.insurancePayerName?.trim() || "",
    requestType,
    contractType,
    ipaDelegatedEntityName: body.ipaDelegatedEntityName?.trim() || null,
    status,
    payerProviderId: body.payerProviderId?.trim() || null,
    startDate: body.startDate ? new Date(body.startDate) : null,
    submissionDate: body.submissionDate ? new Date(body.submissionDate) : null,
    effectiveDate: body.effectiveDate ? new Date(body.effectiveDate) : null,
    expirationDate: body.expirationDate ? new Date(body.expirationDate) : null,
    nextFollowUpDate: body.nextFollowUpDate ? new Date(body.nextFollowUpDate) : null,
    reCredentialingDueDate: body.reCredentialingDueDate
      ? new Date(body.reCredentialingDueDate)
      : null,
    lastActivityDate: body.lastActivityDate ? new Date(body.lastActivityDate) : new Date(),
    tinVerified,
    addressVerified,
    lineOfBusiness: Array.isArray(body.lineOfBusiness)
      ? (body.lineOfBusiness.filter(Boolean) as string[])
      : [],
    priority,
    internalNotes: body.internalNotes?.trim() || null,
    notes: body.notes?.trim() || null,
    enrollmentId: body.enrollmentId?.trim() || null,
    assignedToUserId: refs.assignedResolvedId,
    createdByUserId: currentUserId,
    updatedByUserId: currentUserId,
  };
}

async function writeCredentialingChildren(
  tx: Prisma.TransactionClient,
  requestId: string,
  documentCreates: Prisma.CredentialingDocumentCreateManyInput[],
  followUpCreates: Prisma.CredentialingFollowUpLogCreateManyInput[],
  activityCreates: Prisma.CredentialingActivityLogCreateManyInput[] = [],
) {
  if (documentCreates.length) {
    await tx.credentialingDocument.createMany({ data: documentCreates });
  }

  if (followUpCreates.length) {
    await tx.credentialingFollowUpLog.createMany({ data: followUpCreates });
  }

  if (activityCreates.length) {
    await tx.credentialingActivityLog.createMany({ data: activityCreates });
  }
}

async function prepareCredentialingDocuments(
  requestDbId: string,
  credentialingId: string,
  body: CredentialingBody,
  actorName: string,
  actorUserId: string,
) {
  const documents = Array.isArray(body.documents) ? body.documents : [];
  const documentCreates: Prisma.CredentialingDocumentCreateManyInput[] = [];
  const folderName = credentialingId.replace(/[^a-zA-Z0-9._-]/g, "_");

  function formatBlobTimestamp(date = new Date()) {
    const yyyy = String(date.getFullYear());
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");
    return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
  }

  function getFileExtension(fileName: string) {
    const match = fileName.match(/(\.[^.]+)$/);
    return match?.[1] || "";
  }

  for (const document of documents) {
    if (!document.fileName && !document.documentType) {
      continue;
    }

    let fileUrl = document.fileUrl || null;
    let fileSize = typeof document.fileSize === "number" ? document.fileSize : null;
    let mimeType = document.mimeType || null;

    if (document.fileBase64 && document.fileName) {
      const documentLabel = getDocumentTypeLabel(
        parseEnumValue(document.documentType, DOCUMENT_TYPE_ALIASES) ||
          CredentialingDocumentType.OTHER_DOCUMENTS,
      ).replace(/[^a-zA-Z0-9._-]/g, "_");
      const originalExtension = getFileExtension(document.fileName);
      const upload = await uploadBufferToCredentialingDocumentsBlob({
        folder: `credentialing/${folderName}`,
        fileName: `${documentLabel}-${formatBlobTimestamp()}${originalExtension}`,
        buffer: Buffer.from(document.fileBase64, "base64"),
        contentType: document.mimeType || undefined,
      });
      fileUrl = upload.sasUrl;
      fileSize = typeof document.fileSize === "number" ? document.fileSize : null;
      mimeType = document.mimeType || mimeType;
    }

    documentCreates.push({
      credentialingRequestId: requestDbId,
      documentType:
        parseEnumValue(document.documentType, DOCUMENT_TYPE_ALIASES) ||
        CredentialingDocumentType.OTHER_DOCUMENTS,
      fileName: document.fileName || "Unnamed Document",
      fileUrl,
      fileSize,
      mimeType,
      expiryDate: document.expiryDate ? new Date(document.expiryDate) : null,
      uploadedByName: document.uploadedByName || actorName,
      uploadedByUserId: actorUserId,
    });
  }

  return documentCreates;
}

function prepareFollowUpCreates(
  requestId: string,
  body: CredentialingBody,
  actorName: string,
  defaultLoggedByName: string,
  actorUserId: string,
) {
  const followUps = Array.isArray(body.followUpLogs) ? body.followUpLogs : [];

  return followUps
    .filter((entry) => entry.summary || entry.nextAction || entry.referenceNumber)
    .map((entry) => ({
      credentialingRequestId: requestId,
      dateTime: entry.dateTime ? new Date(entry.dateTime) : new Date(),
      channel:
        parseEnumValue(entry.channel, CHANNEL_ALIASES) ||
        CredentialingCommunicationChannel.EMAIL,
      direction:
        parseEnumValue(entry.direction, DIRECTION_ALIASES) ||
        CredentialingDirection.OUTBOUND,
      referenceNumber: entry.referenceNumber?.trim() || null,
      summary: entry.summary || "",
      nextAction: entry.nextAction?.trim() || null,
      loggedByName: entry.loggedByName || defaultLoggedByName || actorName,
      loggedByUserId: actorUserId,
    }));
}

async function fetchCredentialingRequestWithDetails(requestId: string) {
  return prisma.credentialingRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: {
      practice: true,
      provider: true,
      assignedToUser: true,
      createdByUser: true,
      updatedByUser: true,
      documents: {
        orderBy: { createdAt: "desc" },
      },
      followUpLogs: {
        orderBy: { dateTime: "desc" },
      },
      activityLogs: {
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

export async function getCredentialingRequests(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit as string) || 10, 1);
    const skip = (page - 1) * limit;
    const where = buildCredentialingWhere(req.query as QueryParams);
    const orderBy = buildSortOrder(
      req.query.sortBy as string | undefined,
      req.query.sortOrder as string | undefined,
    );

    const [credentialingRequests, totalRecords] = await Promise.all([
      prisma.credentialingRequest.findMany({
        where,
        include: {
          practice: true,
          provider: true,
          assignedToUser: true,
          createdByUser: true,
          updatedByUser: true,
          documents: {
            orderBy: { createdAt: "desc" },
          },
          followUpLogs: {
            orderBy: { dateTime: "desc" },
          },
          activityLogs: {
            orderBy: { createdAt: "desc" },
          },
        },
        skip,
        take: limit,
        orderBy,
      }),
      prisma.credentialingRequest.count({ where }),
    ]);

    return res.status(200).json({
      message: "Credentialing requests fetched successfully.",
      credentialingRequests: credentialingRequests.map(mapRequest),
      pagination: {
        totalRecords,
        totalPages: Math.ceil(totalRecords / limit),
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch credentialing requests.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getCredentialingDashboard(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const where = buildCredentialingWhere(req.query as QueryParams);
    const credentialingRequests = await prisma.credentialingRequest.findMany({
      where,
      include: {
        practice: true,
        provider: true,
        assignedToUser: true,
        documents: {
          orderBy: { createdAt: "desc" },
        },
        followUpLogs: {
          orderBy: { dateTime: "desc" },
        },
        activityLogs: {
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [{ updatedAt: "desc" }],
    });

    const records = credentialingRequests.map(mapRequest);
    const now = new Date();
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;

    const totalCredentialing = records.length;
    const inProgress = records.filter((record) =>
      [
        "In Process - Payer Review",
        "Application Submitted",
        "Pending Additional Info",
      ].includes(record.status),
    ).length;
    const submitted = records.filter(
      (record) => record.status === "Application Submitted",
    ).length;
    const approved = records.filter((record) =>
      ["Contracted - Direct", "Contracted - IPA/Delegated"].includes(record.status),
    ).length;
    const rejected = records.filter(
      (record) => record.status === "Declined / Application Rejected",
    ).length;
    const expired = records.filter((record) => {
      if (!record.expirationDate) return false;
      const expiration = new Date(record.expirationDate).getTime();
      return Number.isFinite(expiration) && expiration < now.getTime();
    }).length;

    const statusBuckets = [
      "Not Started",
      "In Process - Payer Review",
      "Application Submitted",
      "Contracted - Direct",
      "Declined / Application Rejected",
      "Re-credentialing Due",
      "Terminated",
    ].map((status) => ({
      status,
      count: records.filter((record) => record.status === status).length,
    }));

    const recentCredentialing = [...records]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 6);

    const recentlyExpiring = [...records]
      .map((record) => {
        const upcomingDates = [
          record.expirationDate ? new Date(record.expirationDate) : null,
          record.nextFollowUpDate ? new Date(record.nextFollowUpDate) : null,
          record.reCredentialingDueDate ? new Date(record.reCredentialingDueDate) : null,
        ].filter((d): d is Date => Boolean(d));

        const daysLeftList = upcomingDates.map((d) =>
          Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
        );

        const daysLeft = daysLeftList.length > 0 ? Math.min(...daysLeftList) : null;
        return {
          ...record,
          daysLeft,
        };
      })
      .filter((record) => record.daysLeft !== null && record.daysLeft <= 90)
      .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999))
      .slice(0, 6);

    const recentActivity = [...records]
      .flatMap((record) =>
        record.activity.map((entry: any) => ({
          ...entry,
          practice: record.practice,
          provider: record.provider,
          payer: record.insuranceCompany,
        })),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10);

    return res.status(200).json({
      message: "Credentialing dashboard fetched successfully.",
      summary: {
        totalCredentialing,
        inProgress,
        submitted,
        approved,
        rejected,
        expired,
      },
      statusOverview: statusBuckets,
      recentCredentialing,
      recentlyExpiring,
      recentActivity,
      countsByStatus: statusBuckets,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch credentialing dashboard.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getCredentialingRequest(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const request = await prisma.credentialingRequest.findUnique({
      where: { id: String(req.params.id) },
      include: {
        practice: true,
        provider: true,
        assignedToUser: true,
        createdByUser: true,
        updatedByUser: true,
        documents: {
          orderBy: { createdAt: "desc" },
        },
        followUpLogs: {
          orderBy: { dateTime: "desc" },
        },
        activityLogs: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!request) {
      return res.status(404).json({ message: "Credentialing request not found." });
    }

    return res.status(200).json({
      message: "Credentialing request fetched successfully.",
      credentialingRequest: mapRequest(request),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch credentialing request.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function createCredentialingRequest(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const currentUserId = req.user.sub;

    const body = req.body as CredentialingBody;
    const refs = await resolveBodyReferences(body);
    if ("error" in refs) {
      return res.status(400).json({ message: refs.error });
    }

    const data = buildCredentialingData(
      body,
      refs,
      currentUserId,
    );

    if ("error" in data) {
      return res.status(400).json({ message: data.error });
    }

    const duplicate = await findDuplicateCredentialingRequest(
      data.practiceId,
      data.providerId,
      data.insurancePayerName,
      data.requestType,
    );
    if (duplicate) {
      return res.status(400).json({
        message: DUPLICATE_CREDENTIALING_MESSAGE,
      });
    }

    const actorName = getActorName(req);
    const loggedByName = req.user.role || actorName;
    const requestId = crypto.randomUUID();
    const documentCreates = await prepareCredentialingDocuments(
      requestId,
      data.credentialingId ?? requestId,
      body,
      actorName,
      currentUserId,
    );
    const followUpCreates = prepareFollowUpCreates(
      requestId,
      body,
      actorName,
      loggedByName,
      currentUserId,
    );
    const documentDetails = buildDocumentDetailLines(documentCreates);
    const followUpDetails = buildFollowUpDetailLines(followUpCreates);
    const activityEntries = await buildActivityEntries(
      requestId,
      null,
      body,
      actorName,
      documentDetails,
      followUpDetails,
    );

    let credentialingRequest: string;
    try {
      credentialingRequest = await prisma.$transaction(async (tx) => {
        const created = await tx.credentialingRequest.create({
          data: {
            id: requestId,
            ...data,
            lastActivityDate: data.lastActivityDate || new Date(),
          },
        });

        if (activityEntries.length) {
          await tx.credentialingActivityLog.createMany({
            data: activityEntries.map((entry) => ({
              ...entry,
              credentialingRequestId: created.id,
              createdByUserId: currentUserId,
            })),
          });
        }

        await writeCredentialingChildren(
          tx,
          created.id,
          documentCreates,
          followUpCreates,
        );

        return created.id;
      });
    } catch (error) {
      if (isUniqueCredentialingRequestConflict(error)) {
        return res.status(400).json({
          message: DUPLICATE_CREDENTIALING_MESSAGE,
        });
      }

      throw error;
    }

    const createdRecord = await fetchCredentialingRequestWithDetails(
      credentialingRequest,
    );

    return res.status(201).json({
      message: "Credentialing request created successfully.",
      credentialingRequest: mapRequest(createdRecord),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to create credentialing request.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updateCredentialingRequest(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const currentUserId = req.user.sub;

    const existing = await prisma.credentialingRequest.findUnique({
      where: { id: String(req.params.id) },
      include: {
        practice: true,
        provider: true,
        assignedToUser: true,
        documents: true,
        followUpLogs: true,
        activityLogs: true,
      },
    });

    if (!existing) {
      return res.status(404).json({ message: "Credentialing request not found." });
    }

    const body = req.body as CredentialingBody;
    const refs = await resolveBodyReferences({
      ...body,
      practiceId: body.practiceId || existing.practiceId,
      providerId: body.providerId || existing.providerId || undefined,
      providerName: body.providerName || existing.providerName || undefined,
      assignedToUserId: body.assignedToUserId || existing.assignedToUserId || undefined,
    });
    if ("error" in refs) {
      return res.status(400).json({ message: refs.error });
    }

    const data = buildCredentialingData(
      {
        ...body,
        insurancePayerName: body.insurancePayerName || existing.insurancePayerName,
        requestType: body.requestType || getRequestTypeLabel(existing.requestType),
        contractType: body.contractType || getContractTypeLabel(existing.contractType),
        status: body.status || getStatusLabel(existing.status),
        tinVerified: body.tinVerified || getVerificationLabel(existing.tinVerified),
        addressVerified: body.addressVerified || getVerificationLabel(existing.addressVerified),
        priority: body.priority || getPriorityLabel(existing.priority),
      },
      refs,
      currentUserId,
      existing.credentialingId,
    );

    if ("error" in data) {
      return res.status(400).json({ message: data.error });
    }

    const duplicate = await findDuplicateCredentialingRequest(
      data.practiceId,
      data.providerId,
      data.insurancePayerName,
      data.requestType,
      existing.id,
    );
    if (duplicate) {
      return res.status(400).json({
        message: DUPLICATE_CREDENTIALING_MESSAGE,
      });
    }

    const actorName = getActorName(req);
    const loggedByName = req.user.role || actorName;
    const documentCreates = await prepareCredentialingDocuments(
      existing.id,
      existing.credentialingId,
      body,
      actorName,
      currentUserId,
    );
    const followUpCreates = prepareFollowUpCreates(
      existing.id,
      body,
      actorName,
      loggedByName,
      currentUserId,
    );
    const changedDocuments = getChangedDocumentEntries(existing.documents, body.documents || []);
    const changedFollowUps = getChangedFollowUpEntries(existing.followUpLogs, body.followUpLogs || []);
    const documentDetails = buildDocumentDetailLines(changedDocuments);
    const followUpDetails = buildFollowUpDetailLines(changedFollowUps);
    const activityEntries = await buildActivityEntries(
      existing.id,
      existing,
      body,
      actorName,
      documentDetails,
      followUpDetails,
    );
    try {
      await prisma.$transaction(async (tx) => {
        await tx.credentialingDocument.deleteMany({
          where: { credentialingRequestId: existing.id },
        });
        await tx.credentialingFollowUpLog.deleteMany({
          where: { credentialingRequestId: existing.id },
        });

        await tx.credentialingRequest.update({
          where: { id: existing.id },
          data: {
            ...data,
            updatedByUserId: currentUserId,
            lastActivityDate: new Date(),
          },
        });

        if (activityEntries.length) {
          await tx.credentialingActivityLog.createMany({
            data: activityEntries.map((entry) => ({
              ...entry,
              credentialingRequestId: existing.id,
              createdByUserId: currentUserId,
            })),
          });
        }

        await writeCredentialingChildren(
          tx,
          existing.id,
          documentCreates,
          followUpCreates,
        );
      });
    } catch (error) {
      if (isUniqueCredentialingRequestConflict(error)) {
        return res.status(400).json({
          message: DUPLICATE_CREDENTIALING_MESSAGE,
        });
      }

      throw error;
    }

    const current = await fetchCredentialingRequestWithDetails(existing.id);

    return res.status(200).json({
      message: "Credentialing request updated successfully.",
      credentialingRequest: mapRequest(current),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to update credentialing request.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function deleteCredentialingRequest(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const existing = await prisma.credentialingRequest.findUnique({
      where: { id: String(req.params.id) },
    });

    if (!existing) {
      return res.status(404).json({ message: "Credentialing request not found." });
    }

    await prisma.credentialingRequest.delete({
      where: { id: existing.id },
    });

    return res.status(200).json({
      message: "Credentialing request deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete credentialing request.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
