import {
  ExternalEntityType,
  ExternalSyncStatus,
  ExternalSystem,
  Prisma,
  PrismaClient,
} from "../../../generated/prisma/client";
import { randomUUID } from "crypto";
import { prisma } from "../../lib/prisma";
import {
  decodeQuickBooksState,
  buildQuickBooksAuthUrl,
  exchangeQuickBooksCode,
  getQuickBooksApiBaseUrl,
  refreshQuickBooksTokens,
} from "../../lib/quickbooks";

type DbClient = PrismaClient | Prisma.TransactionClient;

type QuickBooksConnectionRecord = {
  id: string;
  companyId: string;
  realmId: string;
  isSandbox: boolean;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  connectedByUserId: string | null;
  defaultIncomeItemId: string | null;
  defaultExpenseAccountId: string | null;
  lastSyncAt: Date | null;
  lastError: string | null;
};

type QuickBooksConnectionSummary = Omit<
  QuickBooksConnectionRecord,
  "accessToken" | "refreshToken"
>;

type QuickBooksRequestOptions = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
};

type QuickBooksSyncJobParams = {
  companyId?: string;
  entityType: ExternalEntityType;
  entityId: string;
  externalId?: string | null;
  payload?: unknown;
};

class QuickBooksServiceError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

function asDate(value?: string | Date | null, fieldName = "date") {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new QuickBooksServiceError(400, `Invalid ${fieldName}.`);
  }

  return parsed;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeCurrency(currency?: string | null) {
  return (currency || "USD").toUpperCase();
}

function toQuickBooksDate(value?: Date | null) {
  if (!value) {
    return undefined;
  }

  return value.toISOString().slice(0, 10);
}

function escapeQuickBooksQueryValue(value: string) {
  return value.replace(/'/g, "\\'");
}

async function createQuickBooksSyncJob(
  params: QuickBooksSyncJobParams,
  externalId?: string | null,
) {
  return prisma.externalSyncJob.create({
    data: {
      system: ExternalSystem.QUICKBOOKS,
      entityType: params.entityType,
      entityId: params.entityId,
      externalId: externalId ?? undefined,
      status: ExternalSyncStatus.PENDING,
      payload: params.payload as Prisma.InputJsonValue,
    },
  });
}

async function addQuickBooksSyncAttempt(
  externalSyncJobId: string,
  params: {
    status: ExternalSyncStatus;
    requestPayload?: unknown;
    responsePayload?: unknown;
    errorMessage?: string | null;
  },
) {
  return prisma.externalSyncAttempt.create({
    data: {
      externalSyncJobId,
      status: params.status,
      requestPayload: params.requestPayload as Prisma.InputJsonValue,
      responsePayload: params.responsePayload as Prisma.InputJsonValue,
      errorMessage: params.errorMessage ?? undefined,
    },
  });
}

async function markQuickBooksJob(
  externalSyncJobId: string,
  params: {
    status: ExternalSyncStatus;
    externalId?: string | null;
    lastError?: string | null;
  },
) {
  return prisma.externalSyncJob.update({
    where: { id: externalSyncJobId },
    data: {
      status: params.status,
      externalId: params.externalId ?? undefined,
      lastError: params.lastError ?? undefined,
      lastSyncedAt:
        params.status === ExternalSyncStatus.SYNCED ? new Date() : undefined,
    },
  });
}

async function loadQuickBooksConnectionForCompany(companyId: string) {
  const rows = await prisma.$queryRaw<QuickBooksConnectionRecord[]>`
    SELECT
      id,
      company_id AS "companyId",
      realm_id AS "realmId",
      is_sandbox AS "isSandbox",
      access_token AS "accessToken",
      refresh_token AS "refreshToken",
      access_token_expires_at AS "accessTokenExpiresAt",
      refresh_token_expires_at AS "refreshTokenExpiresAt",
      connected_by_user_id AS "connectedByUserId",
      default_income_item_id AS "defaultIncomeItemId",
      default_expense_account_id AS "defaultExpenseAccountId",
      last_sync_at AS "lastSyncAt",
      last_error AS "lastError"
    FROM quickbooks_connections
    WHERE company_id = ${companyId}
    LIMIT 1
  `;

  return rows[0] || null;
}

async function loadQuickBooksConnectionById(connectionId: string) {
  const rows = await prisma.$queryRaw<QuickBooksConnectionRecord[]>`
    SELECT
      id,
      company_id AS "companyId",
      realm_id AS "realmId",
      is_sandbox AS "isSandbox",
      access_token AS "accessToken",
      refresh_token AS "refreshToken",
      access_token_expires_at AS "accessTokenExpiresAt",
      refresh_token_expires_at AS "refreshTokenExpiresAt",
      connected_by_user_id AS "connectedByUserId",
      default_income_item_id AS "defaultIncomeItemId",
      default_expense_account_id AS "defaultExpenseAccountId",
      last_sync_at AS "lastSyncAt",
      last_error AS "lastError"
    FROM quickbooks_connections
    WHERE id = ${connectionId}
    LIMIT 1
  `;

  return rows[0] || null;
}

async function ensureQuickBooksConnectionForCompany(
  companyId: string,
): Promise<QuickBooksConnectionRecord> {
  const connection = await loadQuickBooksConnectionForCompany(companyId);

  if (!connection) {
    throw new QuickBooksServiceError(
      400,
      "QuickBooks is not connected for this company.",
    );
  }

  return connection as QuickBooksConnectionRecord;
}

async function persistQuickBooksTokens(
  connectionId: string,
  tokens: {
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt?: Date | null;
    refreshTokenExpiresAt?: Date | null;
  },
) {
  const rows = await prisma.$queryRaw<QuickBooksConnectionRecord[]>`
    UPDATE quickbooks_connections
    SET
      access_token = ${tokens.accessToken},
      refresh_token = ${tokens.refreshToken},
      access_token_expires_at = ${tokens.accessTokenExpiresAt ?? null},
      refresh_token_expires_at = ${tokens.refreshTokenExpiresAt ?? null},
      last_error = NULL,
      updated_at = NOW()
    WHERE id = ${connectionId}
    RETURNING
      id,
      company_id AS "companyId",
      realm_id AS "realmId",
      is_sandbox AS "isSandbox",
      access_token AS "accessToken",
      refresh_token AS "refreshToken",
      access_token_expires_at AS "accessTokenExpiresAt",
      refresh_token_expires_at AS "refreshTokenExpiresAt",
      connected_by_user_id AS "connectedByUserId",
      default_income_item_id AS "defaultIncomeItemId",
      default_expense_account_id AS "defaultExpenseAccountId",
      last_sync_at AS "lastSyncAt",
      last_error AS "lastError"
  `;

  return rows[0];
}

async function updateQuickBooksConnectionFields(
  connectionId: string,
  fields: {
    defaultIncomeItemId?: string | null;
    defaultExpenseAccountId?: string | null;
    connectedByUserId?: string | null;
    lastSyncAt?: Date | null;
    lastError?: string | null;
    accessToken?: string | null;
    refreshToken?: string | null;
    accessTokenExpiresAt?: Date | null;
    refreshTokenExpiresAt?: Date | null;
    isSandbox?: boolean;
    realmId?: string;
  },
) {
  const assignments: Prisma.Sql[] = [];

  if (fields.defaultIncomeItemId !== undefined) {
    assignments.push(
      Prisma.sql`default_income_item_id = ${fields.defaultIncomeItemId}`,
    );
  }

  if (fields.defaultExpenseAccountId !== undefined) {
    assignments.push(
      Prisma.sql`default_expense_account_id = ${fields.defaultExpenseAccountId}`,
    );
  }

  if (fields.connectedByUserId !== undefined) {
    assignments.push(
      Prisma.sql`connected_by_user_id = ${fields.connectedByUserId}`,
    );
  }

  if (fields.lastSyncAt !== undefined) {
    assignments.push(Prisma.sql`last_sync_at = ${fields.lastSyncAt}`);
  }

  if (fields.lastError !== undefined) {
    assignments.push(Prisma.sql`last_error = ${fields.lastError}`);
  }

  if (fields.accessToken !== undefined) {
    assignments.push(Prisma.sql`access_token = ${fields.accessToken}`);
  }

  if (fields.refreshToken !== undefined) {
    assignments.push(Prisma.sql`refresh_token = ${fields.refreshToken}`);
  }

  if (fields.accessTokenExpiresAt !== undefined) {
    assignments.push(
      Prisma.sql`access_token_expires_at = ${fields.accessTokenExpiresAt}`,
    );
  }

  if (fields.refreshTokenExpiresAt !== undefined) {
    assignments.push(
      Prisma.sql`refresh_token_expires_at = ${fields.refreshTokenExpiresAt}`,
    );
  }

  if (fields.isSandbox !== undefined) {
    assignments.push(Prisma.sql`is_sandbox = ${fields.isSandbox}`);
  }

  if (fields.realmId !== undefined) {
    assignments.push(Prisma.sql`realm_id = ${fields.realmId}`);
  }

  if (assignments.length === 0) {
    return loadQuickBooksConnectionById(connectionId);
  }

  const rows = await prisma.$queryRaw<QuickBooksConnectionRecord[]>`
    UPDATE quickbooks_connections
    SET ${Prisma.join(assignments, ", ")}, updated_at = NOW()
    WHERE id = ${connectionId}
    RETURNING
      id,
      company_id AS "companyId",
      realm_id AS "realmId",
      is_sandbox AS "isSandbox",
      access_token AS "accessToken",
      refresh_token AS "refreshToken",
      access_token_expires_at AS "accessTokenExpiresAt",
      refresh_token_expires_at AS "refreshTokenExpiresAt",
      connected_by_user_id AS "connectedByUserId",
      default_income_item_id AS "defaultIncomeItemId",
      default_expense_account_id AS "defaultExpenseAccountId",
      last_sync_at AS "lastSyncAt",
      last_error AS "lastError"
  `;

  return rows[0];
}

async function requestQuickBooks<T>(
  db: DbClient,
  connection: QuickBooksConnectionRecord,
  options: QuickBooksRequestOptions,
  retrying = false,
): Promise<T> {
  const baseUrl = getQuickBooksApiBaseUrl(connection.isSandbox, connection.realmId);
  const url = new URL(`${baseUrl}${options.path}`);

  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  try {
    const response = await fetch(url.toString(), {
      method: options.method,
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const errorPayload = await response.text();
      throw new QuickBooksServiceError(
        response.status,
        `QuickBooks request failed with status ${response.status}: ${errorPayload}`,
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    const isUnauthorized =
      error instanceof QuickBooksServiceError && error.statusCode === 401;

    if (isUnauthorized && !retrying) {
      const refreshed = await refreshQuickBooksTokens({
        refreshToken: connection.refreshToken,
        realmId: connection.realmId,
      });

      const updatedConnection = await persistQuickBooksTokens(connection.id, {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
        refreshTokenExpiresAt: refreshed.refreshTokenExpiresAt,
      });

      return requestQuickBooks<T>(
        db,
        updatedConnection as QuickBooksConnectionRecord,
        options,
        true,
      );
    }

    throw error;
  }
}

async function queryQuickBooks<T>(
  db: DbClient,
  connection: QuickBooksConnectionRecord,
  query: string,
): Promise<T> {
  const response = await requestQuickBooks<{
    QueryResponse?: T;
  }>(db, connection, {
    method: "GET",
    path: "/query",
    query: {
      query,
      minorversion: "75",
    },
  });

  return (response.QueryResponse || {}) as T;
}

async function loadCompanyContext(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
  });

  if (!company) {
    throw new QuickBooksServiceError(404, "Company not found.");
  }

  return company;
}

function summarizeQuickBooksConnection(
  connection: QuickBooksConnectionRecord | null,
): QuickBooksConnectionSummary | null {
  if (!connection) {
    return null;
  }

  const { accessToken, refreshToken, ...summary } = connection;
  return summary;
}

async function loadPracticeContext(practiceId: string) {
  const practice = await prisma.practice.findUnique({
    where: { id: practiceId },
    include: { company: true },
  });

  if (!practice) {
    throw new QuickBooksServiceError(404, "Practice not found.");
  }

  if (!practice.companyId || !practice.company) {
    throw new QuickBooksServiceError(
      400,
      "Practice must belong to a company before syncing to QuickBooks.",
    );
  }

  return practice;
}

async function loadInvoiceContext(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      practice: { include: { company: true } },
      lineItems: {
        include: {
          service: true,
        },
      },
    },
  });

  if (!invoice) {
    throw new QuickBooksServiceError(404, "Invoice not found.");
  }

  if (!invoice.practice.companyId || !invoice.practice.company) {
    throw new QuickBooksServiceError(
      400,
      "Invoice practice must belong to a company before syncing to QuickBooks.",
    );
  }

  return invoice;
}

async function loadVendorContext(vendorId: string) {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    include: {
      vendorPayables: {
        include: {
          lineItems: {
            include: {
              service: true,
            },
          },
        },
      },
    },
  });

  if (!vendor) {
    throw new QuickBooksServiceError(404, "Vendor not found.");
  }

  return vendor;
}

async function loadVendorPayableContext(vendorPayableId: string) {
  const vendorPayable = await prisma.vendorPayable.findUnique({
    where: { id: vendorPayableId },
    include: {
      vendor: true,
      practice: { include: { company: true } },
      lineItems: {
        include: {
          service: true,
        },
      },
    },
  });

  if (!vendorPayable) {
    throw new QuickBooksServiceError(404, "Vendor payable not found.");
  }

  if (!vendorPayable.practice.companyId || !vendorPayable.practice.company) {
    throw new QuickBooksServiceError(
      400,
      "Vendor payable practice must belong to a company before syncing to QuickBooks.",
    );
  }

  return vendorPayable;
}

async function loadPaymentContext(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      practice: { include: { company: true } },
      allocations: {
        include: {
          invoice: true,
        },
      },
    },
  });

  if (!payment) {
    throw new QuickBooksServiceError(404, "Payment not found.");
  }

  if (!payment.practice.companyId || !payment.practice.company) {
    throw new QuickBooksServiceError(
      400,
      "Payment practice must belong to a company before syncing to QuickBooks.",
    );
  }

  return payment;
}

async function findQuickBooksRecordByName(
  db: DbClient,
  connection: QuickBooksConnectionRecord,
  entityName: "Customer" | "Vendor" | "Item" | "Account",
  fieldName: "DisplayName" | "Name",
  value: string,
) {
  const query = `SELECT * FROM ${entityName} WHERE ${fieldName} = '${escapeQuickBooksQueryValue(
    value,
  )}' MAXRESULTS 1`;
  const response = await queryQuickBooks<any>(db, connection, query);
  const list = response[entityName];

  if (!Array.isArray(list) || list.length === 0) {
    return null;
  }

  return list[0];
}

async function findPreferredQuickBooksAccount(
  db: DbClient,
  connection: QuickBooksConnectionRecord,
  preferredNames: string[],
) {
  for (const preferredName of preferredNames) {
    const account = await findQuickBooksRecordByName(
      db,
      connection,
      "Account",
      "Name",
      preferredName,
    );

    if (account?.Id) {
      return account;
    }
  }

  return null;
}

async function ensureQuickBooksIncomeAccount(
  db: DbClient,
  connection: QuickBooksConnectionRecord,
) {
  if (connection.defaultIncomeItemId) {
    return connection.defaultIncomeItemId;
  }

  let account =
    (await findPreferredQuickBooksAccount(db, connection, [
      "Service/Fee Income",
      "Sales of Product Income",
      "Income",
    ])) ||
    (await findPreferredQuickBooksAccount(db, connection, [
      "Service Income",
      "Other Income",
      "Other Common Income",
    ]));

  if (!account?.Id) {
    // Auto-create a default income account if none found
    const createdAccount = await requestQuickBooks<any>(db, connection, {
      method: "POST",
      path: "/account",
      body: {
        Name: "Tristate Service Revenue",
        AccountType: "Income",
        AccountSubType: "ServiceFeeIncome",
      },
    });
    account = createdAccount.Account || createdAccount;
  }

  if (!account?.Id) {
    throw new QuickBooksServiceError(
      400,
      "Unable to find or create a suitable income account in QuickBooks.",
    );
  }

  const itemName = "Tristate Service Revenue";
  const existingItem = await findQuickBooksRecordByName(
    db,
    connection,
    "Item",
    "Name",
    itemName,
  );

  if (existingItem?.Id) {
    await updateQuickBooksConnectionFields(connection.id, {
      defaultIncomeItemId: String(existingItem.Id),
    });
    return existingItem.Id as string;
  }

  const createdItem = await requestQuickBooks<any>(db, connection, {
    method: "POST",
    path: "/item",
    body: {
      Name: itemName,
      Type: "Service",
      IncomeAccountRef: { value: account.Id },
      Taxable: false,
      TrackQtyOnHand: false,
    },
  });

  if (!createdItem?.Item?.Id && !createdItem?.Id) {
    throw new QuickBooksServiceError(
      500,
      "QuickBooks did not return an item identifier.",
    );
  }

  const itemId = (createdItem.Item?.Id || createdItem.Id) as string;

  await updateQuickBooksConnectionFields(connection.id, {
    defaultIncomeItemId: itemId,
  });

  return itemId;
}

async function ensureQuickBooksExpenseAccount(
  db: DbClient,
  connection: QuickBooksConnectionRecord,
) {
  if (connection.defaultExpenseAccountId) {
    return connection.defaultExpenseAccountId;
  }

  let account =
    (await findPreferredQuickBooksAccount(db, connection, [
      "Cost of Goods Sold",
      "Expenses",
      "Expense",
    ])) ||
    (await findPreferredQuickBooksAccount(db, connection, [
      "Other Expenses",
    ]));

  if (!account?.Id) {
    // Auto-create a default expense account if none found
    const createdAccount = await requestQuickBooks<any>(db, connection, {
      method: "POST",
      path: "/account",
      body: {
        Name: "Tristate Operating Expense",
        AccountType: "Expense",
        AccountSubType: "AdvertisingPromotional", // Generic fallback
      },
    });
    account = createdAccount.Account || createdAccount;
  }

  if (!account?.Id) {
    throw new QuickBooksServiceError(
      400,
      "Unable to find or create a suitable expense account in QuickBooks.",
    );
  }

  await updateQuickBooksConnectionFields(connection.id, {
    defaultExpenseAccountId: String(account.Id),
  });

  return account.Id as string;
}

async function ensureQuickBooksCustomer(
  db: DbClient,
  practiceId: string,
  connection: QuickBooksConnectionRecord,
  displayName: string,
  email?: string | null,
) {
  const existing = await prisma.practice.findUnique({
    where: { id: practiceId },
    select: { quickbooksCustomerId: true },
  });

  if (existing?.quickbooksCustomerId) {
    try {
      // Verify the ID is valid for the current QuickBooks connection
      await requestQuickBooks(db, connection, {
        method: "GET",
        path: `/customer/${existing.quickbooksCustomerId}`,
      });
      return existing.quickbooksCustomerId;
    } catch (err) {
      // If it fails (e.g. 400 Invalid ID or 404 Not Found), 
      // it means the ID is from a different company or was deleted.
      // We clear it and proceed to find/create it for the current company.
      await prisma.practice.update({
        where: { id: practiceId },
        data: { quickbooksCustomerId: null },
      });
    }
  }

  const trimmedName = displayName.trim();
  let customer = await findQuickBooksRecordByName(
    db,
    connection,
    "Customer",
    "DisplayName",
    trimmedName,
  );

  if (customer?.Id) {
    await prisma.practice.update({
      where: { id: practiceId },
      data: { quickbooksCustomerId: customer.Id },
    });
    return customer.Id as string;
  }

  try {
    const createdCustomer = await requestQuickBooks<any>(db, connection, {
      method: "POST",
      path: "/customer",
      body: {
        DisplayName: trimmedName,
        CompanyName: trimmedName,
        PrimaryEmailAddr: email ? { Address: email } : undefined,
        Active: true,
      },
    });

    const customerId = (createdCustomer.Customer?.Id || createdCustomer.Id) as
      | string
      | undefined;

    if (!customerId) {
      throw new QuickBooksServiceError(
        500,
        "QuickBooks did not return a customer identifier.",
      );
    }

    await prisma.practice.update({
      where: { id: practiceId },
      data: { quickbooksCustomerId: customerId },
    });

    return customerId;
  } catch (err: any) {
    const errorMessage = err?.message || "";
    if (errorMessage.match(/6240/) || errorMessage.includes("Duplicate Name Exists")) {
      // 1. Try to find as a Customer (Broad Search)
      const cQuery = `SELECT * FROM Customer MAXRESULTS 1000`;
      const allCustomers = await queryQuickBooks<any>(db, connection, cQuery);
      const cList = allCustomers.Customer || [];
      const foundCustomer = cList.find((c: any) => 
        c.DisplayName.trim().toLowerCase() === trimmedName.toLowerCase() ||
        (c.CompanyName && c.CompanyName.trim().toLowerCase() === trimmedName.toLowerCase())
      );

      if (foundCustomer) {
        await prisma.practice.update({
          where: { id: practiceId },
          data: { quickbooksCustomerId: foundCustomer.Id },
        });
        return foundCustomer.Id as string;
      }

      // 2. Try to find as a Vendor (Broad Search)
      const vQuery = `SELECT * FROM Vendor MAXRESULTS 1000`;
      const allVendors = await queryQuickBooks<any>(db, connection, vQuery);
      const vList = allVendors.Vendor || [];
      const foundVendor = vList.find((v: any) => 
        v.DisplayName.trim().toLowerCase() === trimmedName.toLowerCase() ||
        (v.CompanyName && v.CompanyName.trim().toLowerCase() === trimmedName.toLowerCase())
      );

      if (foundVendor) {
        throw new QuickBooksServiceError(
          400,
          `QuickBooks Conflict: '${trimmedName}' already exists as a VENDOR in QuickBooks. QBO does not allow duplicate names across Customers and Vendors. Please rename the Practice in TriState (e.g., '${trimmedName} (Practice)') or rename the Vendor in QuickBooks.`,
        );
      }

      // 3. Check for Account conflict (just in case)
      const conflictAccount = await findQuickBooksRecordByName(db, connection, "Account", "Name", trimmedName);
      if (conflictAccount) {
        throw new QuickBooksServiceError(
          400,
          `QuickBooks Conflict: '${trimmedName}' already exists as an ACCOUNT in QuickBooks. Please use a unique name for this Practice in TriState.`,
        );
      }

      throw new QuickBooksServiceError(
        400,
        `QuickBooks Conflict: '${trimmedName}' already exists in QuickBooks (possibly as an Employee or Other Name) but could not be automatically linked. Please rename it in TriState to something unique.`,
      );
    }
    throw err;
  }
}

async function ensureQuickBooksVendor(
  db: DbClient,
  vendorId: string,
  connection: QuickBooksConnectionRecord,
  displayName: string,
  email?: string | null,
) {
  const existing = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { quickbooksVendorId: true },
  });

  if (existing?.quickbooksVendorId) {
    try {
      // Verify the ID is valid for the current QuickBooks connection
      await requestQuickBooks(db, connection, {
        method: "GET",
        path: `/vendor/${existing.quickbooksVendorId}`,
      });
      return existing.quickbooksVendorId;
    } catch (err) {
      // If it fails, clear it and proceed to find/create it for the current company.
      await prisma.vendor.update({
        where: { id: vendorId },
        data: { quickbooksVendorId: null },
      });
    }
  }

  const trimmedName = displayName.trim();
  const vendorRecord = await findQuickBooksRecordByName(
    db,
    connection,
    "Vendor",
    "DisplayName",
    trimmedName,
  );

  if (vendorRecord?.Id) {
    await prisma.vendor.update({
      where: { id: vendorId },
      data: { quickbooksVendorId: vendorRecord.Id },
    });
    return vendorRecord.Id as string;
  }

  try {
    const createdVendor = await requestQuickBooks<any>(db, connection, {
      method: "POST",
      path: "/vendor",
      body: {
        DisplayName: trimmedName,
        CompanyName: trimmedName,
        PrimaryEmailAddr: email ? { Address: email } : undefined,
        Active: true,
      },
    });

    const qbVendorId = (createdVendor.Vendor?.Id || createdVendor.Id) as
      | string
      | undefined;

    if (!qbVendorId) {
      throw new QuickBooksServiceError(
        500,
        "QuickBooks did not return a vendor identifier.",
      );
    }

    await prisma.vendor.update({
      where: { id: vendorId },
      data: { quickbooksVendorId: qbVendorId },
    });

    return qbVendorId;
  } catch (err: any) {
    const errorMessage = err?.message || String(err);
    
    // TEMPORARY DEBUG LOG
    try {
      require('fs').appendFileSync('c:/Tristate/backend_debug.log', `[${new Date().toISOString()}] Error in ensureQuickBooksVendor for ${displayName}: ${errorMessage}\n`);
    } catch (logErr) {}

    if (errorMessage.match(/6240/) || errorMessage.includes("Duplicate Name Exists")) {
      // 1. Try to find as a Vendor (Broad Search)
      const vQuery = `SELECT * FROM Vendor MAXRESULTS 1000`;
      const allVendors = await queryQuickBooks<any>(db, connection, vQuery);
      const vList = allVendors.Vendor || [];
      const foundVendor = vList.find((v: any) => 
        v.DisplayName.trim().toLowerCase() === trimmedName.toLowerCase() ||
        (v.CompanyName && v.CompanyName.trim().toLowerCase() === trimmedName.toLowerCase())
      );

      if (foundVendor) {
        await prisma.vendor.update({
          where: { id: vendorId },
          data: { quickbooksVendorId: foundVendor.Id },
        });
        return foundVendor.Id as string;
      }

      // 2. Try to find as a Customer (Broad Search)
      const cQuery = `SELECT * FROM Customer MAXRESULTS 1000`;
      const allCustomers = await queryQuickBooks<any>(db, connection, cQuery);
      const cList = allCustomers.Customer || [];
      const foundCustomer = cList.find((c: any) => 
        c.DisplayName.trim().toLowerCase() === trimmedName.toLowerCase() ||
        (c.CompanyName && c.CompanyName.trim().toLowerCase() === trimmedName.toLowerCase())
      );

      if (foundCustomer) {
        throw new QuickBooksServiceError(
          400,
          `QuickBooks Conflict: '${trimmedName}' already exists as a CUSTOMER in QuickBooks. QBO does not allow duplicate names across Vendors and Customers. Please rename the Vendor in TriState (e.g., '${trimmedName} (Vendor)') or rename the Customer in QuickBooks.`,
        );
      }

      // 3. Check for Account conflict (just in case)
      const conflictAccount = await findQuickBooksRecordByName(db, connection, "Account", "Name", trimmedName);
      if (conflictAccount) {
        throw new QuickBooksServiceError(
          400,
          `QuickBooks Conflict: '${trimmedName}' already exists as an ACCOUNT in QuickBooks. Please use a unique name for this Vendor in TriState.`,
        );
      }

      throw new QuickBooksServiceError(
        400,
        `QuickBooks Conflict: '${trimmedName}' already exists in QuickBooks (possibly as an Employee or Other Name) but could not be automatically linked. Please rename it in TriState to something unique.`,
      );
    }
    throw err;
  }
}

function buildQuickBooksInvoiceLines(params: {
  lineItems: {
    description: string | null;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    serviceName: string;
  }[];
  itemId: string;
}) {
  return params.lineItems.map((lineItem, index) => ({
    Amount: roundMoney(lineItem.totalPrice),
    DetailType: "SalesItemLineDetail",
    Description: lineItem.description || lineItem.serviceName,
    LineNum: index + 1,
    SalesItemLineDetail: {
      ItemRef: {
        value: params.itemId,
      },
      Qty: lineItem.quantity,
      UnitPrice: roundMoney(lineItem.unitPrice),
    },
  }));
}

function buildQuickBooksBillLines(params: {
  lineItems: {
    description: string | null;
    totalCost: number;
    serviceName: string;
  }[];
  accountId: string;
}) {
  return params.lineItems.map((lineItem, index) => ({
    Amount: roundMoney(lineItem.totalCost),
    DetailType: "AccountBasedExpenseLineDetail",
    Description: lineItem.description || lineItem.serviceName,
    LineNum: index + 1,
    AccountBasedExpenseLineDetail: {
      AccountRef: {
        value: params.accountId,
      },
    },
  }));
}

async function syncQuickBooksJob<T>(
  params: QuickBooksSyncJobParams,
  externalId: string | null | undefined,
  runner: (jobId: string) => Promise<T>,
) {
  const job = await createQuickBooksSyncJob(params, externalId);

  try {
    await markQuickBooksJob(job.id, {
      status: ExternalSyncStatus.IN_PROGRESS,
      externalId: externalId ?? undefined,
    });

    const result = await runner(job.id);

    await markQuickBooksJob(job.id, {
      status: ExternalSyncStatus.SYNCED,
    });

    await addQuickBooksSyncAttempt(job.id, {
      status: ExternalSyncStatus.SYNCED,
      responsePayload: result,
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    await markQuickBooksJob(job.id, {
      status: ExternalSyncStatus.FAILED,
      externalId: externalId ?? undefined,
      lastError: message,
    });

    await addQuickBooksSyncAttempt(job.id, {
      status: ExternalSyncStatus.FAILED,
      errorMessage: message,
    });

    throw error;
  }
}

export async function createQuickBooksConnection(params: {
  companyId: string;
  userId?: string;
  isSandbox?: boolean;
}) {
  const company = await loadCompanyContext(params.companyId);

  const authUrl = buildQuickBooksAuthUrl({
    companyId: company.id,
    userId: params.userId,
    isSandbox: params.isSandbox ?? true,
  });

  return {
    company: {
      id: company.id,
      name: company.name,
      domain: company.domain,
      status: company.status,
    },
    authUrl,
  };
}

export async function completeQuickBooksConnection(params: {
  code: string;
  realmId: string;
  state: string;
}) {
  const state = decodeQuickBooksState(params.state);

  if (Date.now() - state.issuedAt > 1000 * 60 * 30) {
    throw new QuickBooksServiceError(400, "QuickBooks connection state expired.");
  }

  const tokens = await exchangeQuickBooksCode({
    code: params.code,
    realmId: params.realmId,
  });

  const connectionRows = await prisma.$queryRaw<QuickBooksConnectionRecord[]>`
    INSERT INTO quickbooks_connections (
      id,
      company_id,
      realm_id,
      is_sandbox,
      access_token,
      refresh_token,
      access_token_expires_at,
      refresh_token_expires_at,
      connected_by_user_id,
      last_sync_at,
      last_error,
      created_at,
      updated_at
    ) VALUES (
      ${randomUUID()},
      ${state.companyId},
      ${params.realmId},
      ${state.isSandbox},
      ${tokens.accessToken},
      ${tokens.refreshToken},
      ${tokens.accessTokenExpiresAt ?? null},
      ${tokens.refreshTokenExpiresAt ?? null},
      ${state.userId ?? null},
      ${new Date()},
      NULL,
      NOW(),
      NOW()
    )
    ON CONFLICT (realm_id)
    DO UPDATE SET
      company_id = EXCLUDED.company_id,
      is_sandbox = EXCLUDED.is_sandbox,
      access_token = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      access_token_expires_at = EXCLUDED.access_token_expires_at,
      refresh_token_expires_at = EXCLUDED.refresh_token_expires_at,
      connected_by_user_id = EXCLUDED.connected_by_user_id,
      last_sync_at = EXCLUDED.last_sync_at,
      last_error = NULL,
      updated_at = NOW()
    RETURNING
      id,
      company_id AS "companyId",
      realm_id AS "realmId",
      is_sandbox AS "isSandbox",
      access_token AS "accessToken",
      refresh_token AS "refreshToken",
      access_token_expires_at AS "accessTokenExpiresAt",
      refresh_token_expires_at AS "refreshTokenExpiresAt",
      connected_by_user_id AS "connectedByUserId",
      default_income_item_id AS "defaultIncomeItemId",
      default_expense_account_id AS "defaultExpenseAccountId",
      last_sync_at AS "lastSyncAt",
      last_error AS "lastError"
  `;

  const connection = connectionRows[0];

  return summarizeQuickBooksConnection(connection as QuickBooksConnectionRecord);
}

export async function getQuickBooksConnectionStatus(companyId: string) {
  const connection = await loadQuickBooksConnectionForCompany(companyId);

  return {
    connected: Boolean(connection),
    connection: summarizeQuickBooksConnection(connection as QuickBooksConnectionRecord | null),
  };
}

export async function disconnectQuickBooksConnection(companyId: string) {
  const connection = await loadQuickBooksConnectionForCompany(companyId);

  if (!connection) {
    return { disconnected: true };
  }

  await prisma.$executeRaw`
    DELETE FROM quickbooks_connections
    WHERE company_id = ${companyId}
  `;

  return { disconnected: true };
}

export async function syncQuickBooksCustomer(practiceId: string) {
  const practice = await loadPracticeContext(practiceId);
  const connection = await ensureQuickBooksConnectionForCompany(practice.companyId!);

  return syncQuickBooksJob(
    {
      companyId: practice.companyId!,
      entityType: ExternalEntityType.CUSTOMER,
      entityId: practiceId,
      externalId: practice.quickbooksCustomerId,
      payload: {
        practiceId,
        companyId: practice.companyId,
      },
    },
    practice.quickbooksCustomerId,
    async (jobId) => {
      const customerId = await ensureQuickBooksCustomer(
        prisma,
        practiceId,
        connection,
        practice.name,
        practice.company?.email || null,
      );

      await markQuickBooksJob(jobId, {
        status: ExternalSyncStatus.SYNCED,
        externalId: customerId,
      });

      return {
        quickbooksCustomerId: customerId,
      };
    },
  );
}

export async function syncQuickBooksVendorForCompany(
  vendorId: string,
  companyId: string,
) {
  const vendor = await loadVendorContext(vendorId);
  const connection = await ensureQuickBooksConnectionForCompany(companyId);

  return syncQuickBooksJob(
    {
      companyId,
      entityType: ExternalEntityType.VENDOR,
      entityId: vendorId,
      externalId: vendor.quickbooksVendorId,
      payload: {
        vendorId,
      },
    },
    vendor.quickbooksVendorId,
    async (jobId) => {
      const qbVendorId = await ensureQuickBooksVendor(
        prisma,
        vendorId,
        connection,
        vendor.name,
        vendor.remitEmail || null,
      );

      await markQuickBooksJob(jobId, {
        status: ExternalSyncStatus.SYNCED,
        externalId: qbVendorId,
      });

      return {
        quickbooksVendorId: qbVendorId,
      };
    },
  );
}

export async function syncQuickBooksInvoice(invoiceId: string) {
  const invoice = await loadInvoiceContext(invoiceId);

  // Prevent double sync
  if (invoice.quickbooksInvoiceId) {
    return {
      quickbooksInvoiceId: invoice.quickbooksInvoiceId,
      message: "Invoice was already synced to QuickBooks.",
    };
  }

  const connection = await ensureQuickBooksConnectionForCompany(
    invoice.practice.companyId!,
  );

  return syncQuickBooksJob(
    {
      companyId: invoice.practice.companyId!,
      entityType: ExternalEntityType.INVOICE,
      entityId: invoiceId,
      externalId: invoice.quickbooksInvoiceId,
      payload: {
        invoiceId,
        practiceId: invoice.practiceId,
      },
    },
    invoice.quickbooksInvoiceId,
    async (jobId) => {
      const customerId = await ensureQuickBooksCustomer(
        prisma,
        invoice.practiceId,
        connection,
        invoice.practice.name,
        invoice.practice.company?.email || null,
      );

      const itemId = await ensureQuickBooksIncomeAccount(prisma, connection);

      if (invoice.lineItems.length === 0) {
        throw new QuickBooksServiceError(
          400,
          "Invoice must have at least one line item before syncing to QuickBooks.",
        );
      }

      const qbLines = buildQuickBooksInvoiceLines({
        itemId,
        lineItems: invoice.lineItems.map((lineItem) => ({
          description: lineItem.description || null,
          quantity: Math.max(1, lineItem.quantity),
          unitPrice: Number(lineItem.unitPrice),
          totalPrice: Number(lineItem.totalPrice),
          serviceName: lineItem.service.name,
        })),
      });

      const payload = {
        CustomerRef: {
          value: customerId,
        },
        DocNumber: invoice.invoiceNumber || undefined,
        TxnDate: toQuickBooksDate(invoice.createdAt),
        DueDate: toQuickBooksDate(invoice.dueDate),
        BillEmail: invoice.practice.company?.email
          ? { Address: invoice.practice.company.email }
          : undefined,
        CurrencyRef: {
          value: normalizeCurrency(invoice.currency),
        },
        PrivateNote: `Local invoice ${invoice.id}`,
        Line: qbLines,
      };

      const createdInvoice = await requestQuickBooks<any>(prisma, connection, {
        method: "POST",
        path: "/invoice",
        body: payload,
      });

      const qbInvoiceId = (createdInvoice.Invoice?.Id || createdInvoice.Id) as
        | string
        | undefined;

      if (!qbInvoiceId) {
        throw new QuickBooksServiceError(
          500,
          "QuickBooks did not return an invoice identifier.",
        );
      }

      await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          quickbooksInvoiceId: qbInvoiceId,
        },
      });

      await markQuickBooksJob(jobId, {
        status: ExternalSyncStatus.SYNCED,
        externalId: qbInvoiceId,
      });

      return {
        quickbooksInvoiceId: qbInvoiceId,
      };
    },
  );
}

export async function syncQuickBooksVendorBill(vendorPayableId: string) {
  const vendorPayable = await loadVendorPayableContext(vendorPayableId);

  // Prevent double sync
  if (vendorPayable.quickbooksBillId) {
    return {
      quickbooksBillId: vendorPayable.quickbooksBillId,
      message: "Vendor payable was already synced to QuickBooks.",
    };
  }

  const connection = await ensureQuickBooksConnectionForCompany(
    vendorPayable.practice.companyId!,
  );

  return syncQuickBooksJob(
    {
      companyId: vendorPayable.practice.companyId!,
      entityType: ExternalEntityType.BILL,
      entityId: vendorPayableId,
      externalId: vendorPayable.quickbooksBillId,
      payload: {
        vendorPayableId,
        vendorId: vendorPayable.vendorId,
      },
    },
    vendorPayable.quickbooksBillId,
    async (jobId) => {
      const qbVendorId = await ensureQuickBooksVendor(
        prisma,
        vendorPayable.vendorId,
        connection,
        vendorPayable.vendor.name,
        vendorPayable.vendor.remitEmail || null,
      );

      const accountId = await ensureQuickBooksExpenseAccount(prisma, connection);

      if (vendorPayable.lineItems.length === 0) {
        throw new QuickBooksServiceError(
          400,
          "Vendor payable must have at least one line item before syncing to QuickBooks.",
        );
      }

      const qbLines = buildQuickBooksBillLines({
        accountId,
        lineItems: vendorPayable.lineItems.map((lineItem) => ({
          description: lineItem.description || null,
          totalCost: Number(lineItem.totalCost),
          serviceName: lineItem.service?.name || "Vendor payable",
        })),
      });

      const payload = {
        VendorRef: {
          value: qbVendorId,
        },
        TxnDate: toQuickBooksDate(vendorPayable.createdAt),
        DueDate: toQuickBooksDate(vendorPayable.paidAt),
        CurrencyRef: {
          value: normalizeCurrency(vendorPayable.currency),
        },
        PrivateNote: `Local vendor payable ${vendorPayable.id}`,
        Line: qbLines,
      };

      const createdBill = await requestQuickBooks<any>(prisma, connection, {
        method: "POST",
        path: "/bill",
        body: payload,
      });

      const qbBillId = (createdBill.Bill?.Id || createdBill.Id) as string | undefined;

      if (!qbBillId) {
        throw new QuickBooksServiceError(
          500,
          "QuickBooks did not return a bill identifier.",
        );
      }

      await prisma.vendorPayable.update({
        where: { id: vendorPayableId },
        data: {
          quickbooksBillId: qbBillId,
        },
      });

      await markQuickBooksJob(jobId, {
        status: ExternalSyncStatus.SYNCED,
        externalId: qbBillId,
      });

      return {
        quickbooksBillId: qbBillId,
      };
    },
  );
}

export async function syncQuickBooksPayment(paymentId: string) {
  const payment = await loadPaymentContext(paymentId);
  const connection = await ensureQuickBooksConnectionForCompany(
    payment.practice.companyId!,
  );

  return syncQuickBooksJob(
    {
      companyId: payment.practice.companyId!,
      entityType: ExternalEntityType.PAYMENT,
      entityId: paymentId,
      externalId: payment.quickbooksPaymentId,
      payload: {
        paymentId,
      },
    },
    payment.quickbooksPaymentId,
    async (jobId) => {
      if (payment.allocations.length === 0) {
        throw new QuickBooksServiceError(
          400,
          "Payment must have at least one allocation before syncing to QuickBooks.",
        );
      }

      const customerId = await ensureQuickBooksCustomer(
        prisma,
        payment.practiceId,
        connection,
        payment.practice.name,
        payment.practice.company?.email || null,
      );

      for (const allocation of payment.allocations) {
        if (!allocation.invoice.quickbooksInvoiceId) {
          throw new QuickBooksServiceError(
            400,
            `Invoice ${allocation.invoiceId} must be synced to QuickBooks before syncing the payment.`,
          );
        }
      }

      const totalAmount = roundMoney(
        payment.allocations.reduce(
          (sum, allocation) => sum + Number(allocation.allocatedAmount),
          0,
        ),
      );

      const payload = {
        CustomerRef: {
          value: customerId,
        },
        TxnDate: toQuickBooksDate(payment.paymentDate || new Date()),
        TotalAmt: totalAmount,
        Line: payment.allocations.map((allocation) => ({
          Amount: roundMoney(Number(allocation.allocatedAmount)),
          LinkedTxn: [
            {
              TxnId: allocation.invoice.quickbooksInvoiceId,
              TxnType: "Invoice",
            },
          ],
        })),
      };

      const createdPayment = await requestQuickBooks<any>(prisma, connection, {
        method: "POST",
        path: "/payment",
        body: payload,
      });

      const qbPaymentId = (createdPayment.Payment?.Id || createdPayment.Id) as
        | string
        | undefined;

      if (!qbPaymentId) {
        throw new QuickBooksServiceError(
          500,
          "QuickBooks did not return a payment identifier.",
        );
      }

      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          quickbooksPaymentId: qbPaymentId,
        },
      });

      await markQuickBooksJob(jobId, {
        status: ExternalSyncStatus.SYNCED,
        externalId: qbPaymentId,
      });

      return {
        quickbooksPaymentId: qbPaymentId,
      };
    },
  );
}

export async function syncQuickBooksVendorBillPayment(vendorPayableId: string) {
  const vendorPayable = await loadVendorPayableContext(vendorPayableId);
  const connection = await ensureQuickBooksConnectionForCompany(
    vendorPayable.practice.companyId!,
  );

  return syncQuickBooksJob(
    {
      companyId: vendorPayable.practice.companyId!,
      entityType: ExternalEntityType.BILL_PAYMENT,
      entityId: vendorPayableId,
      externalId: vendorPayable.quickbooksBillPaymentId,
      payload: {
        vendorPayableId,
      },
    },
    vendorPayable.quickbooksBillPaymentId,
    async (jobId) => {
      if (!vendorPayable.quickbooksBillId) {
        throw new QuickBooksServiceError(
          400,
          "Vendor payable must be synced to QuickBooks before syncing the bill payment.",
        );
      }

      if (!vendorPayable.paidAt) {
        throw new QuickBooksServiceError(
          400,
          "Vendor payable must have a paidAt date before syncing a bill payment.",
        );
      }

      const qbVendorId = await ensureQuickBooksVendor(
        prisma,
        vendorPayable.vendorId,
        connection,
        vendorPayable.vendor.name,
        vendorPayable.vendor.remitEmail || null,
      );

      const payload = {
        VendorRef: {
          value: qbVendorId,
        },
        TotalAmt: roundMoney(Number(vendorPayable.totalAmount)),
        TxnDate: toQuickBooksDate(vendorPayable.paidAt),
        Line: [
          {
            Amount: roundMoney(Number(vendorPayable.totalAmount)),
            LinkedTxn: [
              {
                TxnId: vendorPayable.quickbooksBillId,
                TxnType: "Bill",
              },
            ],
          },
        ],
      };

      const createdBillPayment = await requestQuickBooks<any>(prisma, connection, {
        method: "POST",
        path: "/billpayment",
        body: payload,
      });

      const qbBillPaymentId = (
        createdBillPayment.BillPayment?.Id || createdBillPayment.Id
      ) as string | undefined;

      if (!qbBillPaymentId) {
        throw new QuickBooksServiceError(
          500,
          "QuickBooks did not return a bill payment identifier.",
        );
      }

      await prisma.vendorPayable.update({
        where: { id: vendorPayableId },
        data: {
          quickbooksBillPaymentId: qbBillPaymentId,
        },
      });

      await markQuickBooksJob(jobId, {
        status: ExternalSyncStatus.SYNCED,
        externalId: qbBillPaymentId,
      });

      return {
        quickbooksBillPaymentId: qbBillPaymentId,
      };
    },
  );
}

export { QuickBooksServiceError };
