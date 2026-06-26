import {
  BlobSASPermissions,
  BlobServiceClient,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";

function getBlobConfig() {
  const connectionString = process.env.AZURE_INVOICE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.AZURE_INVOICE_CONTAINER_NAME;

  if (!connectionString) {
    throw new Error("AZURE_INVOICE_STORAGE_CONNECTION_STRING is not set.");
  }

  if (!containerName) {
    throw new Error("AZURE_INVOICE_CONTAINER_NAME is not set.");
  }

  return { connectionString, containerName };
}

function sanitizePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
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

function createBlobServiceClient() {
  const { connectionString, containerName } = getBlobConfig();
  return {
    connectionString,
    containerName,
    blobServiceClient: BlobServiceClient.fromConnectionString(connectionString),
  };
}

export function createInvoiceReceiptBlobSasUrl(params: {
  connectionString: string;
  containerName: string;
  blobName: string;
  blobUrl: string;
}) {
  const accountName = getConnectionStringPart(params.connectionString, "AccountName");
  const accountKey = getConnectionStringPart(params.connectionString, "AccountKey");

  if (!accountName || !accountKey) {
    throw new Error(
      "AZURE_INVOICE_STORAGE_CONNECTION_STRING must include AccountName and AccountKey.",
    );
  }

  const sharedKeyCredential = new StorageSharedKeyCredential(
    accountName,
    accountKey,
  );

  const startsOn = new Date(Date.now() - 5 * 60 * 1000);
  const expiresOn = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

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

export async function uploadInvoiceReceiptBufferToAzureBlob(params: {
  folder: string;
  fileName: string;
  buffer: Buffer;
  contentType?: string;
}) {
  const { connectionString, containerName, blobServiceClient } =
    createBlobServiceClient();
  const containerClient = blobServiceClient.getContainerClient(containerName);
  await containerClient.createIfNotExists();

  const safeFileName = sanitizePathSegment(params.fileName);
  const safeFolder = params.folder
    .split("/")
    .filter(Boolean)
    .map(sanitizePathSegment)
    .join("/");
  const blobName = `${safeFolder}/${Date.now()}-${safeFileName}`;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  await blockBlobClient.uploadData(params.buffer, {
    blobHTTPHeaders: {
      blobContentType: params.contentType || "application/octet-stream",
    },
  });

  return {
    blobName,
    url: blockBlobClient.url,
    sasUrl: createInvoiceReceiptBlobSasUrl({
      connectionString,
      containerName,
      blobName,
      blobUrl: blockBlobClient.url,
    }),
  };
}

export function createInvoiceReceiptSasUrlFromBlobUrl(blobUrl: string) {
  const { connectionString, containerName } = getBlobConfig();
  const parsedUrl = new URL(blobUrl);
  const pathParts = parsedUrl.pathname.split("/").filter(Boolean);

  if (pathParts.length < 2 || pathParts[0] !== containerName) {
    throw new Error("Blob URL does not belong to the configured container.");
  }

  const blobName = decodeURIComponent(pathParts.slice(1).join("/"));
  return createInvoiceReceiptBlobSasUrl({
    connectionString,
    containerName,
    blobName,
    blobUrl,
  });
}
