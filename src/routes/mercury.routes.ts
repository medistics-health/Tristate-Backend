import { Router } from "express";
import { verifyAuthToken } from "../middleware/auth.middleware";
import {
  getMercuryAccountsHandler,
  getMercuryTransactionsHandler,
  getStoredMercuryTransactionsHandler,
  reconcileMercuryTransactionHandler,
  syncMercuryTransactionsHandler,
} from "../controllers/mercury/mercury";

const mercuryRouter = Router();

mercuryRouter.use(verifyAuthToken);

// Pull live accounts from Mercury API
mercuryRouter.get("/accounts", getMercuryAccountsHandler);

// Pull live transactions for a specific account from Mercury API (and upsert to DB)
mercuryRouter.get("/accounts/:accountId/transactions", getMercuryTransactionsHandler);

// List stored transactions in CRM DB (with pagination/filtering)
mercuryRouter.get("/transactions", getStoredMercuryTransactionsHandler);

// Reconcile a stored transaction (mark matched/unmatched)
mercuryRouter.patch("/transactions/:id/reconcile", reconcileMercuryTransactionHandler);

// Trigger a full sync from Mercury API to CRM DB
mercuryRouter.post("/sync", syncMercuryTransactionsHandler);

export default mercuryRouter;
