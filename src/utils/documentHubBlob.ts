import {
  BlobSASPermissions,
  BlobServiceClient,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";

const DEFAULT_MAX_FILE_BYTES = 25 * 1024 * 1024;
const DEFAULT_DOWNLOAD_SAS_MINUTES = 10;

export const DOCUMENT_HUB_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png",
  "image/jpeg",
] as const;

const EXTENSION_TO_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

export function getDocumentHubMaxFileBytes() {
  const configured = Number(process.env.DOCUMENT_HUB_MAX_FILE_BYTES);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return DEFAULT_MAX_FILE_BYTES;
}

function getDownloadSasMinutes() {
  const configured = Number(process.env.DOCUMENT_HUB_DOWNLOAD_SAS_MINUTES);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return DEFAULT_DOWNLOAD_SAS_MINUTES;
}

function getBlobConfig() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.AZURE_DOCUMENT_HUB_CONTAINER_NAME;

  if (!connectionString) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is not set.");
  }

  if (!containerName) {
    throw new Error("AZURE_DOCUMENT_HUB_CONTAINER_NAME is not set.");
  }

  return { connectionString, containerName };
}

export function sanitizePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getBlobServiceClient() {
  const { connectionString, containerName } = getBlobConfig();
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  return { connectionString, containerName, blobServiceClient };
}

function getConnectionStringPart(connectionString: string, key: string) {
  return connectionString
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith(`${key.toLowerCase()}=`))
    ?.split("=")
    .slice(1)
    .join("=");
}

function getFileExtension(fileName: string) {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0) {
    return "";
  }
  return fileName.slice(lastDot).toLowerCase();
}

export function validateDocumentHubFile(params: {
  originalFilename: string;
  mimeType?: string;
  fileSizeBytes: number;
}) {
  const maxBytes = getDocumentHubMaxFileBytes();
  if (params.fileSizeBytes <= 0) {
    return "The uploaded file is empty.";
  }
  if (params.fileSizeBytes > maxBytes) {
    return `File exceeds the maximum size of ${Math.floor(maxBytes / (1024 * 1024))}MB.`;
  }

  const extension = getFileExtension(params.originalFilename);
  const mimeFromExtension = EXTENSION_TO_MIME[extension];
  if (!mimeFromExtension) {
    return "Unsupported file type. Allowed types: PDF, DOCX, XLSX, PPTX, PNG, JPG.";
  }

  const providedMime = (params.mimeType || "").toLowerCase().split(";")[0].trim();
  const allowedMimes: string[] = [...DOCUMENT_HUB_ALLOWED_MIME_TYPES];
  if (providedMime && providedMime !== "application/octet-stream") {
    if (!allowedMimes.includes(providedMime)) {
      return "Unsupported file type. Allowed types: PDF, DOCX, XLSX, PPTX, PNG, JPG.";
    }
    if (providedMime !== mimeFromExtension) {
      return "File extension does not match the file type.";
    }
  }

  return null;
}

export function resolveDocumentHubContentType(params: {
  originalFilename: string;
  mimeType?: string;
}) {
  const extension = getFileExtension(params.originalFilename);
  return (
    EXTENSION_TO_MIME[extension] ||
    params.mimeType ||
    "application/octet-stream"
  );
}

function createBlobReadSasUrl(params: {
  connectionString: string;
  containerName: string;
  blobName: string;
  blobUrl: string;
  expiresInMinutes?: number;
}) {
  const accountName = getConnectionStringPart(params.connectionString, "AccountName");
  const accountKey = getConnectionStringPart(params.connectionString, "AccountKey");

  if (!accountName || !accountKey) {
    throw new Error(
      "AZURE_STORAGE_CONNECTION_STRING must include AccountName and AccountKey.",
    );
  }

  const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
  const startsOn = new Date(Date.now() - 5 * 60 * 1000);
  const expiresOn = new Date(
    Date.now() + (params.expiresInMinutes ?? getDownloadSasMinutes()) * 60 * 1000,
  );
  const sasToken = generateBlobSASQueryParameters(
    {
      containerName: params.containerName,
      blobName: params.blobName,
      permissions: BlobSASPermissions.parse("r"),
      startsOn,
      expiresOn,
    },
    sharedKeyCredential,
  ).toString();

  return `${params.blobUrl}?${sasToken}`;
}

export function createDocumentHubDownloadSasUrl(fileKey: string) {
  const { connectionString, containerName, blobServiceClient } = getBlobServiceClient();
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blockBlobClient = containerClient.getBlockBlobClient(fileKey);

  return createBlobReadSasUrl({
    connectionString,
    containerName,
    blobName: fileKey,
    blobUrl: blockBlobClient.url,
  });
}

export function buildDocumentHubBlobName(params: {
  documentId: string;
  version: number;
  originalFilename: string;
}) {
  const safeFileName = sanitizePathSegment(params.originalFilename);
  return `${params.documentId}/v${params.version}/${safeFileName}`;
}

export async function uploadDocumentHubBuffer(params: {
  blobName: string;
  buffer: Buffer;
  contentType?: string;
}) {
  const { containerName, blobServiceClient } = getBlobServiceClient();
  const containerClient = blobServiceClient.getContainerClient(containerName);
  await containerClient.createIfNotExists();

  const blockBlobClient = containerClient.getBlockBlobClient(params.blobName);
  await blockBlobClient.uploadData(params.buffer, {
    blobHTTPHeaders: {
      blobContentType: params.contentType || "application/octet-stream",
    },
  });

  return {
    blobName: params.blobName,
    url: blockBlobClient.url,
  };
}

export async function deleteDocumentHubBlob(fileKey: string) {
  const { containerName, blobServiceClient } = getBlobServiceClient();
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blockBlobClient = containerClient.getBlockBlobClient(fileKey);
  await blockBlobClient.deleteIfExists();
}
