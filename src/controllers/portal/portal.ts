import { Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

export async function getClientPortalSnapshot(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    // Usually, the client portal would filter by req.user's practiceId.
    // For this demonstration, we'll pick the first active practice.
    const practice = await prisma.practice.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" }
    });

    if (!practice) {
      return res.status(404).json({ message: "No active practice found for portal." });
    }

    const practiceId = practice.id;

    // 1. Total Billed (YTD) - Aggregating invoices for the current year
    const currentYear = new Date().getFullYear();
    const invoicesYTD = await prisma.invoice.findMany({
      where: {
        practiceId,
        createdAt: {
          gte: new Date(`${currentYear}-01-01`),
        },
      },
    });

    const totalBilled = invoicesYTD.reduce((acc, inv) => acc + Number(inv.totalAmount || 0), 0);

    // 2. Active Providers
    const activeProviders = await prisma.person.count({
      where: {
        practices: { some: { practiceId } },
      },
    });

    // 3. Recent Invoices
    const recentInvoices = await prisma.invoice.findMany({
      where: { practiceId },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    
    const unpaidInvoices = recentInvoices.filter(i => i.status !== "PAID" && i.status !== "CANCELLED").length;

    // 4. Pending Terms / Agreements
    const pendingAgreements = await prisma.agreement.count({
      where: {
        practiceId,
        status: "DRAFT",
      },
    });

    return res.status(200).json({
      message: "Portal snapshot fetched successfully.",
      snapshot: {
        practiceName: practice.name,
        practiceId: practice.id,
        totalBilled,
        activeProviders,
        recentInvoices,
        unpaidInvoices,
        pendingAgreements,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch portal snapshot.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
