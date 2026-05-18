import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import axios from "axios";

const isSandbox = process.env.MERCURY_ENV === "sandbox";
const MERCURY_BASE_URL = isSandbox 
  ? "https://backend.mercury.com/api/v1" 
  : "https://api.mercury.com/api/v1";
const MERCURY_API_KEY = process.env.MERCURY_API_KEY ?? "";

function mercuryHeaders() {
  return {
    Authorization: `Bearer ${MERCURY_API_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

// ─── GET /api/v1/mercury/accounts ────────────────────────────────────────────
export async function getMercuryAccountsHandler(req: Request, res: Response) {
  try {
    if (!MERCURY_API_KEY) {
      return res.status(200).json({
        accounts: [],
        message: "Mercury API key not configured. Set MERCURY_API_KEY in environment.",
        configured: false,
        environment: process.env.MERCURY_ENV || "production",
      });
    }

    const response = await axios.get(`${MERCURY_BASE_URL}/accounts`, {
      headers: mercuryHeaders(),
    });

    return res.status(200).json({
      accounts: response.data?.accounts ?? response.data ?? [],
      configured: true,
      environment: process.env.MERCURY_ENV || "production",
    });
  } catch (error: any) {
    const status = error?.response?.status ?? 500;
    const message = error?.response?.data?.message ?? error?.message ?? "Failed to fetch Mercury accounts";
    return res.status(status < 500 ? status : 502).json({ error: message });
  }
}

// ─── GET /api/v1/mercury/accounts/:accountId/transactions ────────────────────
export async function getMercuryTransactionsHandler(req: Request, res: Response) {
  const accountId = req.params.accountId as string;
  const { limit = "50", offset = "0", status, start, end } = req.query as Record<string, string>;

  try {
    if (!MERCURY_API_KEY) {
      // Return stored transactions from DB if no API key
      const transactions = await prisma.mercuryTransaction.findMany({
        where: accountId ? { accountId } : undefined,
        orderBy: { postedAt: "desc" },
        take: Number(limit),
        skip: Number(offset),
      });
      const total = await prisma.mercuryTransaction.count({
        where: accountId ? { accountId } : undefined,
      });
      return res.status(200).json({
        transactions,
        total,
        configured: false,
        environment: process.env.MERCURY_ENV || "production",
        message: "Showing stored transactions. Mercury API key not configured.",
      });
    }

    const params: Record<string, string> = { limit, offset };
    if (status) params.status = status;
    if (start) params.start = start;
    if (end) params.end = end;

    const response = await axios.get(
      `${MERCURY_BASE_URL}/account/${accountId}/transactions`,
      { headers: mercuryHeaders(), params }
    );

    const rawTxns: any[] = response.data?.transactions ?? [];

    // Upsert transactions into DB for reconciliation
    const upsertPromises = rawTxns.map((txn: any) =>
      prisma.mercuryTransaction.upsert({
        where: { mercuryTransactionId: String(txn.id) },
        update: {
          status: txn.status ?? "PENDING",
          description: txn.note ?? txn.bankDescription ?? null,
          counterpartyName: txn.counterpartyName ?? null,
          postedAt: txn.postedAt ? new Date(txn.postedAt) : null,
          rawPayloadJson: txn,
        },
        create: {
          mercuryTransactionId: String(txn.id),
          accountId: txn.accountId ?? accountId,
          amount: txn.amount ?? 0,
          direction: txn.amount >= 0 ? "CREDIT" : "DEBIT",
          status: txn.status ?? "PENDING",
          description: txn.note ?? txn.bankDescription ?? null,
          counterpartyName: txn.counterpartyName ?? null,
          postedAt: txn.postedAt ? new Date(txn.postedAt) : null,
          rawPayloadJson: txn,
          reconciliationStatus: "UNMATCHED",
        },
      })
    );

    await Promise.allSettled(upsertPromises);

    return res.status(200).json({
      transactions: rawTxns,
      total: response.data?.total ?? rawTxns.length,
      configured: true,
      environment: process.env.MERCURY_ENV || "production",
    });
  } catch (error: any) {
    // Fallback to DB stored transactions
    try {
      const transactions = await prisma.mercuryTransaction.findMany({
        where: accountId ? { accountId } : undefined,
        orderBy: { postedAt: "desc" },
        take: Number(limit),
        skip: Number(offset),
      });
      const total = await prisma.mercuryTransaction.count({
        where: accountId ? { accountId } : undefined,
      });
      return res.status(200).json({
        transactions,
        total,
        configured: true,
        environment: process.env.MERCURY_ENV || "production",
        fromCache: true,
        warning: "Mercury API unavailable, showing cached transactions.",
      });
    } catch {
      const status = error?.response?.status ?? 500;
      const message = error?.response?.data?.message ?? error?.message ?? "Failed to fetch Mercury transactions";
      return res.status(status < 500 ? status : 502).json({ error: message });
    }
  }
}

// ─── GET /api/v1/mercury/transactions (stored in CRM DB) ─────────────────────
export async function getStoredMercuryTransactionsHandler(req: Request, res: Response) {
  const {
    page = "1",
    limit = "20",
    accountId,
    reconciliationStatus,
    direction,
  } = req.query as Record<string, string>;

  const pageNum = Math.max(1, Number(page));
  const limitNum = Math.min(100, Math.max(1, Number(limit)));
  const skip = (pageNum - 1) * limitNum;

  const where: any = {};
  if (accountId) where.accountId = accountId;
  if (reconciliationStatus) where.reconciliationStatus = reconciliationStatus;
  if (direction) where.direction = direction;

  try {
    const [transactions, total] = await Promise.all([
      prisma.mercuryTransaction.findMany({
        where,
        orderBy: { postedAt: "desc" },
        take: limitNum,
        skip,
      }),
      prisma.mercuryTransaction.count({ where }),
    ]);

    return res.status(200).json({
      transactions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? "Failed to fetch stored transactions" });
  }
}

// ─── PATCH /api/v1/mercury/transactions/:id/reconcile ────────────────────────
export async function reconcileMercuryTransactionHandler(req: Request, res: Response) {
  const id = req.params.id as string;
  const { reconciliationStatus, matchedEntityType, matchedEntityId } = req.body as {
    reconciliationStatus: string;
    matchedEntityType?: string;
    matchedEntityId?: string;
  };

  if (!reconciliationStatus) {
    return res.status(400).json({ error: "reconciliationStatus is required" });
  }

  try {
    const transaction = await prisma.mercuryTransaction.update({
      where: { id },
      data: {
        reconciliationStatus,
        matchedEntityType: matchedEntityType ?? null,
        matchedEntityId: matchedEntityId ?? null,
      },
    });
    return res.status(200).json({ transaction });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return res.status(404).json({ error: "Transaction not found" });
    }
    return res.status(500).json({ error: error?.message ?? "Failed to reconcile transaction" });
  }
}

// ─── POST /api/v1/mercury/sync ────────────────────────────────────────────────
// Pull all transactions from Mercury and upsert into DB
export async function syncMercuryTransactionsHandler(req: Request, res: Response) {
  const { accountId } = req.body as { accountId?: string };

  if (!MERCURY_API_KEY) {
    return res.status(400).json({
      error: "Mercury API key not configured. Set MERCURY_API_KEY in environment.",
      configured: false,
    });
  }

  try {
    // Get accounts if no accountId provided
    let accountIds: string[] = [];
    if (accountId) {
      accountIds = [accountId];
    } else {
      const accountsResp = await axios.get(`${MERCURY_BASE_URL}/accounts`, {
        headers: mercuryHeaders(),
      });
      accountIds = (accountsResp.data?.accounts ?? []).map((a: any) => a.id);
    }

    let totalSynced = 0;

    for (const acctId of accountIds) {
      const response = await axios.get(
        `${MERCURY_BASE_URL}/account/${acctId}/transactions`,
        { headers: mercuryHeaders(), params: { limit: "500", offset: "0" } }
      );

      const rawTxns: any[] = response.data?.transactions ?? [];

      for (const txn of rawTxns) {
        await prisma.mercuryTransaction.upsert({
          where: { mercuryTransactionId: String(txn.id) },
          update: {
            status: txn.status ?? "PENDING",
            description: txn.note ?? txn.bankDescription ?? null,
            counterpartyName: txn.counterpartyName ?? null,
            postedAt: txn.postedAt ? new Date(txn.postedAt) : null,
            rawPayloadJson: txn,
          },
          create: {
            mercuryTransactionId: String(txn.id),
            accountId: txn.accountId ?? acctId,
            amount: Math.abs(txn.amount ?? 0),
            direction: (txn.amount ?? 0) >= 0 ? "CREDIT" : "DEBIT",
            status: txn.status ?? "PENDING",
            description: txn.note ?? txn.bankDescription ?? null,
            counterpartyName: txn.counterpartyName ?? null,
            postedAt: txn.postedAt ? new Date(txn.postedAt) : null,
            rawPayloadJson: txn,
            reconciliationStatus: "UNMATCHED",
          },
        });
        totalSynced++;
      }
    }

    return res.status(200).json({
      synced: totalSynced,
      accounts: accountIds.length,
      message: `Synced ${totalSynced} transactions from ${accountIds.length} account(s).`,
    });
  } catch (error: any) {
    const status = error?.response?.status ?? 500;
    const message = error?.response?.data?.message ?? error?.message ?? "Mercury sync failed";
    return res.status(status < 500 ? status : 502).json({ error: message });
  }
}
