import { Router } from "express";
import { verifyAuthToken } from "../middleware/auth.middleware";
import {
  createInvoice,
  getInvoice,
  getAllInvoices,
  updateInvoice,
  deleteInvoice,
} from "../controllers/invoice/invoice";
import {
  createInvoiceLineItem,
  getInvoiceLineItem,
  getAllInvoiceLineItems,
  updateInvoiceLineItem,
  deleteInvoiceLineItem,
} from "../controllers/invoice/invoiceLineItem";

const invoiceRouter = Router();

invoiceRouter.use(verifyAuthToken);

// Invoice routes
invoiceRouter.get("/", getAllInvoices);
invoiceRouter.post("/", createInvoice);

// Invoice Line Item routes
invoiceRouter.get("/line-items", getAllInvoiceLineItems);
invoiceRouter.post("/line-items", createInvoiceLineItem);
invoiceRouter.get("/line-items/:id", getInvoiceLineItem);
invoiceRouter.patch("/line-items/:id", updateInvoiceLineItem);
invoiceRouter.delete("/line-items/:id", deleteInvoiceLineItem);

// Invoice detail routes
invoiceRouter.get("/:id", getInvoice);
invoiceRouter.patch("/:id", updateInvoice);
invoiceRouter.delete("/:id", deleteInvoice);

export default invoiceRouter;
