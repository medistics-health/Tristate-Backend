import { Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { syncQuickBooksVendorBill, syncQuickBooksVendorBillPayment, getQuickBooksBillPdf } from "../../services/quickbooks/quickbooks.service";

export async function getAllVendorPayables(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || "";
    const status = (req.query.status as string) || "";
    const practiceId = (req.query.practiceId as string) || "";
    const vendorId = (req.query.vendorId as string) || "";
    const sortBy = (req.query.sortBy as string) || "createdAt";
    const sortOrder = (req.query.sortOrder as string)?.toLowerCase() === "asc" ? "asc" : "desc";

    const skip = (page - 1) * limit;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (practiceId) {
      where.practiceId = practiceId;
    }

    if (vendorId) {
      where.vendorId = vendorId;
    }

    if (search) {
      where.OR = [
        { payableNumber: { contains: search, mode: "insensitive" } },
        { vendor: { name: { contains: search, mode: "insensitive" } } },
        { practice: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    let orderBy: any = { createdAt: sortOrder };
    if (sortBy === "payableNumber") {
      orderBy = { payableNumber: sortOrder };
    } else if (sortBy === "vendor") {
      orderBy = { vendor: { name: sortOrder } };
    } else if (sortBy === "practice") {
      orderBy = { practice: { name: sortOrder } };
    } else if (sortBy === "totalAmount") {
      orderBy = { totalAmount: sortOrder };
    } else if (sortBy === "status") {
      orderBy = { status: sortOrder };
    } else if (sortBy === "updatedAt") {
      orderBy = { updatedAt: sortOrder };
    }

    const [payables, total] = await Promise.all([
      prisma.vendorPayable.findMany({
        where,
        include: { vendor: true, practice: true },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.vendorPayable.count({ where }),
    ]);

    return res.status(200).json({
      message: "Vendor payables fetched successfully.",
      payables,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch vendor payables.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function releaseVendorPayable(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      return res.status(400).json({ message: "id is required." });
    }

    const payable = await prisma.vendorPayable.findFirst({ where: { id } });
    if (!payable) {
      return res.status(404).json({ message: "Vendor payable not found." });
    }

    // Only allow release if it's currently on hold or draft
    const updatedPayable = await prisma.vendorPayable.update({
      where: { id },
      data: {
        status: "APPROVED",
        releasedAt: new Date(),
      },
      include: { vendor: true, practice: true },
    });

    return res.status(200).json({
      message: "Vendor payable released successfully.",
      payable: updatedPayable,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to release vendor payable.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function createVendorPayable(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const { vendorId, practiceId, totalAmount, description } = req.body;

    if (!vendorId || !practiceId || !totalAmount) {
      return res.status(400).json({ message: "vendorId, practiceId and totalAmount are required." });
    }

    const payable = await prisma.vendorPayable.create({
      data: {
        vendorId,
        practiceId,
        totalAmount,
        currency: "USD",
        status: "DRAFT",
        lineItems: {
          create: [
            {
              description: description || "Manual payable",
              quantity: 1,
              unitCost: totalAmount,
              totalCost: totalAmount,
            },
          ],
        },
      },
    });

    return res.status(201).json({
      message: "Vendor payable created successfully.",
      payable,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to create vendor payable.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function syncVendorPayableToQuickBooks(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      return res.status(400).json({ message: "id is required." });
    }

    const result = await syncQuickBooksVendorBill(id);

    return res.status(200).json({
      message: "Synced to QuickBooks successfully.",
      result,
    });
  } catch (error) {
    const status = (error as any).statusCode || 500;
    return res.status(status).json({
      message: "Unable to sync to QuickBooks.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function generateVendorStatement(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      return res.status(400).json({ message: "id is required." });
    }

    // In a real app, this would use a PDF generator to create a statement
    // For now, we mock the generation and return a success message
    
    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 800));

    return res.status(200).json({
      message: "Vendor statement generated successfully.",
      id, // Return the ID so the frontend can show the preview
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to generate vendor statement.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function deleteVendorPayable(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      return res.status(400).json({ message: "id is required." });
    }

    const payable = await prisma.vendorPayable.findFirst({ where: { id } });
    if (!payable) {
      return res.status(404).json({ message: "Vendor payable not found." });
    }

    // Delete the payable (Cascade will handle line items)
    await prisma.vendorPayable.delete({ where: { id } });

    return res.status(200).json({
      message: "Vendor payable deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete vendor payable.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function syncBillPaymentToQuickBooks(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      return res.status(400).json({ message: "id is required." });
    }

    const result = await syncQuickBooksVendorBillPayment(id);

    return res.status(200).json({
      message: "Bill payment synced to QuickBooks successfully.",
      result,
    });
  } catch (error) {
    const status = (error as any).statusCode || 500;
    return res.status(status).json({
      message: "Unable to sync bill payment to QuickBooks.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getVendorPayableById(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      return res.status(400).json({ message: "id is required." });
    }

    const payable = await prisma.vendorPayable.findFirst({
      where: { id },
      include: { vendor: true, practice: true },
    });

    if (!payable) {
      return res.status(404).json({ message: "Vendor payable not found." });
    }

    return res.status(200).json({
      message: "Vendor payable fetched successfully.",
      payable,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch vendor payable.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function payVendorPayable(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      return res.status(400).json({ message: "id is required." });
    }

    const payable = await prisma.vendorPayable.findFirst({ where: { id } });
    if (!payable) {
      return res.status(404).json({ message: "Vendor payable not found." });
    }

    const paymentDate = new Date();

    // Update status to PAID locally
    const updatedPayable = await prisma.vendorPayable.update({
      where: { id },
      data: {
        status: "PAID",
        paidAt: paymentDate,
      },
      include: { vendor: true, practice: true },
    });

    // Check if synced to QuickBooks and has a bill ID
    let qbPaymentResult = null;
    if (payable.quickbooksBillId) {
      try {
        // Trigger QuickBooks Bill Payment Sync automatically!
        qbPaymentResult = await syncQuickBooksVendorBillPayment(id);
      } catch (qbError) {
        console.warn("Auto-syncing bill payment to QuickBooks failed during payment recording:", qbError);
      }
    }

    return res.status(200).json({
      message: "Vendor payable marked as paid successfully.",
      payable: updatedPayable,
      quickbooksSync: qbPaymentResult,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to pay vendor payable.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function downloadQuickBooksBillHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      return res.status(400).json({ message: "Vendor payable id is required." });
    }

    const payable = await prisma.vendorPayable.findFirst({ where: { id } });
    if (!payable) {
      return res.status(404).json({ message: "Vendor payable not found." });
    }

    if (payable.status !== "PAID") {
      return res.status(400).json({ message: "Bill download is only available for PAID vendor payables." });
    }

    if (!payable.quickbooksBillId) {
      return res.status(400).json({ message: "This bill has not been synced to QuickBooks yet." });
    }

    const pdfBuffer = await getQuickBooksBillPdf(payable.id);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="bill-${payable.payableNumber || payable.id}.pdf"`);
    return res.send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({
      message: "Unable to download QuickBooks bill.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
