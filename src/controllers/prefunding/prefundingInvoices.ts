import { Response } from "express";
import { prisma } from "../../lib/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";

export async function createPrefundingInvoice(req: AuthenticatedRequest, res: Response) {
  try {
    const { practiceId, cycle, invoiceDate, dueDate, totalAmount, lineItems } = req.body;

    if (!practiceId || !cycle || !invoiceDate || !dueDate || totalAmount === undefined) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const prefundingInvoice = await prisma.prefundingInvoice.create({
      data: {
        practiceId,
        cycle,
        invoiceDate: new Date(invoiceDate),
        dueDate: new Date(dueDate),
        totalAmount,
        status: "DRAFT",
        lineItems: {
          create: lineItems.map((item: any) => ({
            name: item.name,
            basis: item.basis,
            pricingModel: item.pricingModel,
            rate: item.rate,
            amount: item.amount,
            isOneTime: item.isOneTime || false,
          }))
        }
      },
      include: {
        lineItems: true
      }
    });

    return res.status(201).json({ message: "Prefunding invoice created", prefundingInvoice });
  } catch (error: any) {
    return res.status(500).json({ message: "Failed to create prefunding invoice", error: error.message });
  }
}
