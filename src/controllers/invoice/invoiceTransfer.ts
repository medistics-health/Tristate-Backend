import { Response } from "express";
import { prisma } from "../../lib/prisma";
import { stripe } from "../../lib/stripe";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

type StripeTransferSummary = {
  id: string;
  invoiceId: string;
  invoiceNumber: string | null;
  practiceName: string;
  invoiceStatus: string;
  stripeConnectedAccountId: string;
  stripeConnectedAccountName: string;
  amount: number;
  currency: string;
  status: string;
  stripeTransferId: string | null;
  transferGroup: string | null;
  failureMessage: string | null;
  serviceNames: string[];
  lineItemDescriptions: string[];
  createdAt: string;
  updatedAt: string;
};

type StripeAccountSummary = {
  id: string;
  displayName: string;
  email: string | null;
  country: string | null;
  defaultCurrency: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDisabledReason: string | null;
  businessProfile: {
    name: string | null;
    url: string | null;
  };
};

type StripeTransferStatus = "PENDING" | "SENT" | "FAILED" | "SKIPPED";

type AccountSummary = {
  stripeConnectedAccountId: string;
  stripeConnectedAccountName: string;
  transferCount: number;
  invoiceCount: number;
  customerPaidTotal: number;
  sentTotal: number;
  pendingTotal: number;
  failedTotal: number;
  skippedTotal: number;
  latestStatus: string;
  latestUpdatedAt: string;
};

function getStripeAccountDisplayName(account: any) {
  const rawDisplayName =
    account?.business_profile?.name ||
    account?.company?.name ||
    [account?.individual?.first_name, account?.individual?.last_name]
      .filter(Boolean)
      .join(" ") ||
    account?.display_name ||
    account?.settings?.dashboard?.display_name ||
    account?.email ||
    account?.id ||
    "Unknown";

  return String(rawDisplayName).replace(/\s{2,}/g, " ").trim();
}

function serializeStripeAccount(account: any): StripeAccountSummary {
  return {
    id: account.id,
    displayName: getStripeAccountDisplayName(account),
    email: account.email ?? null,
    country: account.country ?? null,
    defaultCurrency: account.default_currency ?? null,
    chargesEnabled: Boolean(account.charges_enabled),
    payoutsEnabled: Boolean(account.payouts_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
    requirementsDisabledReason: account.requirements?.disabled_reason ?? null,
    businessProfile: {
      name: account.business_profile?.name ?? null,
      url: account.business_profile?.url ?? null,
    },
  };
}

async function getPlatformAccountSummary() {
  const platformAccountId = process.env.STRIPE_PLATFORM_ACCOUNT_ID?.trim();
  if (!platformAccountId) {
    return null;
  }

  try {
    const account = await stripe.accounts.retrieve(platformAccountId);
    if ((account as any).deleted) {
      return null;
    }
    return serializeStripeAccount(account);
  } catch {
    return null;
  }
}

function toAmount(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function matchesStatus(statusFilter: string | undefined, status: string) {
  if (!statusFilter || statusFilter === "ALL") {
    return true;
  }
  return status.toUpperCase() === statusFilter.toUpperCase();
}

export async function getInvoiceStripePayoutSummary(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.max(1, parseInt(String(req.query.limit || "10"), 10) || 10);
    const accountId = typeof req.query.accountId === "string" ? req.query.accountId.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status.trim().toUpperCase() : "";
    const invoiceStatus = typeof req.query.invoiceStatus === "string" ? req.query.invoiceStatus.trim().toUpperCase() : "";
    const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";

    const [accountsResponse, platformAccount, transfers, invoices] = await Promise.all([
      stripe.accounts.list({ limit: 100 }),
      getPlatformAccountSummary(),
      prisma.invoiceConnectedAccountTransfer.findMany({
        include: {
          invoice: {
            include: {
              practice: true,
              lineItems: {
                include: {
                  service: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.invoice.findMany({
        where: {
          lineItems: {
            some: {
              stripeConnectedAccountId: { not: null },
            },
          },
        },
        include: {
          practice: true,
          lineItems: {
            include: {
              service: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const accountMap = new Map<string, StripeAccountSummary>();
    for (const account of accountsResponse.data) {
      if ((account as any).deleted) continue;
      accountMap.set(account.id, serializeStripeAccount(account));
    }

    const transferRecordMap = new Map<string, (typeof transfers)[number]>();
    for (const transfer of transfers) {
      transferRecordMap.set(
        `${transfer.invoiceId}:${transfer.stripeConnectedAccountId}`,
        transfer,
      );
    }

    const invoiceRows = invoices.flatMap((invoice) => {
      const groupedByAccount = new Map<
        string,
        {
          lineItems: typeof invoice.lineItems;
          amount: number;
        }
      >();

      for (const lineItem of invoice.lineItems) {
        const destination = lineItem.stripeConnectedAccountId?.trim();
        if (!destination) {
          continue;
        }
        const current = groupedByAccount.get(destination);
        const amount = toAmount(lineItem.externalTotalPrice ?? lineItem.totalPrice);
        if (current) {
          current.amount += amount;
          current.lineItems.push(lineItem);
        } else {
          groupedByAccount.set(destination, {
            amount,
            lineItems: [lineItem],
          });
        }
      }

      return Array.from(groupedByAccount.entries()).map(
        ([stripeConnectedAccountId, group]) => {
          const transferRecord =
            transferRecordMap.get(`${invoice.id}:${stripeConnectedAccountId}`) || null;
          const serviceNames = Array.from(
            new Set(
              group.lineItems
                .map((lineItem) => lineItem.service?.name || lineItem.description || "")
                .filter(Boolean),
            ),
          );
          const lineItemDescriptions = group.lineItems.map(
            (lineItem) => lineItem.description || lineItem.service?.name || "Line item",
          );
          const inferredStatus: StripeTransferStatus =
            transferRecord?.status ||
            (invoice.status === "PAID" || invoice.status === "PARTIALLY_PAID"
              ? "PENDING"
              : "SKIPPED");

          const connectedAccountName =
            accountMap.get(stripeConnectedAccountId)?.displayName ||
            getStripeAccountDisplayName({
              id: stripeConnectedAccountId,
              business_profile: null,
              company: null,
              individual: null,
              display_name: null,
              settings: null,
              email: null,
            });

          return {
            id: transferRecord?.id || `${invoice.id}:${stripeConnectedAccountId}`,
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber ?? null,
            practiceName: invoice.practice?.name || "Practice",
            invoiceStatus: invoice.status,
            stripeConnectedAccountId,
            stripeConnectedAccountName: connectedAccountName,
            amount: toAmount(group.amount),
            currency: (transferRecord?.currency || invoice.currency || "USD").toUpperCase(),
            status: inferredStatus,
            stripeTransferId: transferRecord?.stripeTransferId || null,
            transferGroup: transferRecord?.transferGroup || invoice.stripeInvoiceId || invoice.id,
            failureMessage: transferRecord?.failureMessage || null,
            serviceNames,
            lineItemDescriptions,
            createdAt: (transferRecord?.createdAt || invoice.createdAt).toISOString(),
            updatedAt: (transferRecord?.updatedAt || invoice.updatedAt).toISOString(),
          } as StripeTransferSummary;
        },
      );
    });

    const enrichedRows = invoiceRows
      .map((row) => {
        const storedTransfer = transfers.find(
          (transfer) =>
            transfer.invoiceId === row.invoiceId &&
            transfer.stripeConnectedAccountId === row.stripeConnectedAccountId,
        );
        if (!storedTransfer) {
          return row;
        }

        return {
          ...row,
          id: storedTransfer.id,
          amount: toAmount(storedTransfer.amount),
          currency: (storedTransfer.currency || row.currency || "USD").toUpperCase(),
          status: storedTransfer.status,
          stripeTransferId: storedTransfer.stripeTransferId,
          transferGroup: storedTransfer.transferGroup,
          failureMessage: storedTransfer.failureMessage,
          createdAt: storedTransfer.createdAt.toISOString(),
          updatedAt: storedTransfer.updatedAt.toISOString(),
        } as StripeTransferSummary;
      })
      .filter((row) => row.amount !== 0);

    const filteredRows = enrichedRows.filter((row) => {
      if (accountId && row.stripeConnectedAccountId !== accountId) {
        return false;
      }
      if (!matchesStatus(status || undefined, row.status)) {
        return false;
      }
      if (!matchesStatus(invoiceStatus || undefined, row.invoiceStatus)) {
        return false;
      }
      if (search) {
        const haystack = [
          row.invoiceNumber,
          row.practiceName,
          row.stripeConnectedAccountName,
          ...row.serviceNames,
          ...row.lineItemDescriptions,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(search)) {
          return false;
        }
      }
      return true;
    });

    const overallTotals = filteredRows.reduce(
      (acc, row) => {
        acc.totalAllocated += row.amount;
        if (row.status === "SENT") acc.totalSent += row.amount;
        if (row.status === "PENDING") acc.totalPending += row.amount;
        if (row.status === "FAILED") acc.totalFailed += row.amount;
        if (row.status === "SKIPPED") acc.totalSkipped += row.amount;
        acc.transferCount += 1;
        if (row.invoiceStatus === "PAID" || row.invoiceStatus === "PARTIALLY_PAID") {
          acc.customerPaidTotal += row.amount;
        }
        return acc;
      },
      {
        totalAllocated: 0,
        totalSent: 0,
        totalPending: 0,
        totalFailed: 0,
        totalSkipped: 0,
        customerPaidTotal: 0,
        transferCount: 0,
      },
    );

    const accountSummaryMap = new Map<string, AccountSummary>();
    for (const account of accountsResponse.data) {
      if ((account as any).deleted) continue;
      accountSummaryMap.set(account.id, {
        stripeConnectedAccountId: account.id,
        stripeConnectedAccountName: accountMap.get(account.id)?.displayName || getStripeAccountDisplayName(account),
        transferCount: 0,
        invoiceCount: 0,
        customerPaidTotal: 0,
        sentTotal: 0,
        pendingTotal: 0,
        failedTotal: 0,
        skippedTotal: 0,
        latestStatus: "PENDING",
        latestUpdatedAt: new Date(0).toISOString(),
      });
    }

    for (const row of filteredRows) {
      const existing = accountSummaryMap.get(row.stripeConnectedAccountId);
      const current: AccountSummary = existing || {
        stripeConnectedAccountId: row.stripeConnectedAccountId,
        stripeConnectedAccountName: row.stripeConnectedAccountName,
        transferCount: 0,
        invoiceCount: 0,
        customerPaidTotal: 0,
        sentTotal: 0,
        pendingTotal: 0,
        failedTotal: 0,
        skippedTotal: 0,
        latestStatus: row.status,
        latestUpdatedAt: row.updatedAt,
      };

      current.transferCount += 1;
      current.invoiceCount += 1;
      current.customerPaidTotal += row.amount;
      if (row.status === "SENT") current.sentTotal += row.amount;
      if (row.status === "PENDING") current.pendingTotal += row.amount;
      if (row.status === "FAILED") current.failedTotal += row.amount;
      if (row.status === "SKIPPED") current.skippedTotal += row.amount;
      if (new Date(row.updatedAt).getTime() > new Date(current.latestUpdatedAt).getTime()) {
        current.latestUpdatedAt = row.updatedAt;
        current.latestStatus = row.status;
      }
      accountSummaryMap.set(row.stripeConnectedAccountId, current);
    }

    const accountSummaries = Array.from(accountSummaryMap.values()).sort(
      (a, b) => b.customerPaidTotal - a.customerPaidTotal,
    );

    const total = filteredRows.length;
    const pagedRows = filteredRows.slice((page - 1) * limit, (page - 1) * limit + limit);

    return res.status(200).json({
      message: "Stripe payout summary fetched successfully.",
      platformAccount,
      connectedAccounts: accountSummaries,
      totals: overallTotals,
      rows: pagedRows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch Stripe payout summary.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
