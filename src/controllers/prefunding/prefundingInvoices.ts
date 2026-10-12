import { Response } from "express";
import { prisma } from "../../lib/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { generatePrefundingInvoicePdfBuffer } from "../../utils/prefundingInvoicePdf";

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
        status: "Draft",
        createdByUserId: req.user?.sub || null,
        lineItems: {
          create: (lineItems || []).map((item: any) => ({
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
        practice: true,
        lineItems: true,
        createdByUser: true,
      }
    });

    return res.status(201).json({ message: "Prefunding invoice created", prefundingInvoice });
  } catch (error: any) {
    return res.status(500).json({ message: "Failed to create prefunding invoice", error: error.message });
  }
}

export async function getPrefundingInvoices(req: AuthenticatedRequest, res: Response) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit as string, 10) || 10);
    const search = (req.query.search as string)?.trim() || "";
    const status = (req.query.status as string)?.trim();
    const practiceId = (req.query.practiceId as string)?.trim();
    const sortBy = (req.query.sortBy as string)?.trim() || "createdAt";
    const sortOrder = (req.query.sortOrder as string)?.toLowerCase() === "asc" ? "asc" : "desc";

    const where: any = {};

    if (practiceId) {
      where.practiceId = practiceId;
    }

    if (status) {
      where.status = { equals: status, mode: "insensitive" };
    }

    if (search) {
      where.OR = [
        { cycle: { contains: search, mode: "insensitive" } },
        { status: { contains: search, mode: "insensitive" } },
        { practice: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    const allowedSortFields = ["invoiceDate", "dueDate", "totalAmount", "status", "createdAt", "cycle"];
    const orderBy: any = {};
    if (allowedSortFields.includes(sortBy)) {
      orderBy[sortBy] = sortOrder;
    } else {
      orderBy.createdAt = "desc";
    }

    const [totalRecords, invoices] = await Promise.all([
      prisma.prefundingInvoice.count({ where }),
      prisma.prefundingInvoice.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
        include: {
          createdByUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              userName: true,
              email: true,
            }
          },
          practice: {
            select: {
              id: true,
              name: true,
              emails: true,
              phone: true,
              addressLine1: true,
              city: true,
              state: true,
              zipCode: true,
              persons: {
                include: {
                  person: true,
                },
                take: 1,
              },
            }
          },
          lineItems: true,
        }
      })
    ]);

    const formattedInvoices = invoices.map((inv: any) => {
      const year = new Date(inv.createdAt).getFullYear();
      const code = inv.id.replace(/-/g, "").slice(0, 5).toUpperCase();
      const invoiceNumber = `INV-${year}-${code}`;

      const firstPerson = inv.practice?.persons?.[0]?.person;
      const recipientName = firstPerson ? `${firstPerson.firstName} ${firstPerson.lastName}`.trim() : "";
      const recipientEmail = firstPerson?.email || inv.practice?.emails?.[0] || "";
      const recipient = recipientName
        ? (recipientEmail ? `${recipientName} (${recipientEmail})` : recipientName)
        : (recipientEmail || "N/A");

      const creator = inv.createdByUser;
      const createdBy = creator
        ? (`${creator.firstName || ""} ${creator.lastName || ""}`.trim() || creator.userName || creator.email)
        : "Prince Akabari";

      return {
        id: inv.id,
        invoiceNumber,
        practice: inv.practice?.name || "N/A",
        practiceId: inv.practiceId,
        prefundingCycle: inv.cycle,
        totalAmount: Number(inv.totalAmount),
        status: inv.status,
        dueDate: inv.dueDate ? new Date(inv.dueDate).toISOString().split("T")[0] : "",
        invoiceDate: inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().split("T")[0] : "",
        recipientName,
        recipientEmail,
        recipient,
        createdBy,
        createdDate: new Date(inv.createdAt).toISOString().split("T")[0],
        postedDate: inv.status.toLowerCase() === "posted" ? new Date(inv.updatedAt).toISOString().split("T")[0] : null,
        lineItems: (inv.lineItems || []).map((item: any) => ({
          ...item,
          rate: item.rate !== null ? Number(item.rate) : null,
          amount: Number(item.amount),
        })),
      };
    });

    return res.status(200).json({
      invoices: formattedInvoices,
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.ceil(totalRecords / limit) || 1,
      }
    });
  } catch (error: any) {
    return res.status(500).json({ message: "Failed to fetch prefunding invoices", error: error.message });
  }
}

export async function getPrefundingInvoiceById(req: AuthenticatedRequest, res: Response) {
  try {
    const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
    const inv: any = await prisma.prefundingInvoice.findFirst({
      where: { id },
      include: {
        createdByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            userName: true,
            email: true,
          }
        },
        practice: {
          include: {
            persons: {
              include: { person: true },
              take: 1,
            }
          }
        },
        lineItems: true,
      }
    });

    if (!inv) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    const year = new Date(inv.createdAt).getFullYear();
    const code = inv.id.replace(/-/g, "").slice(0, 5).toUpperCase();

    const firstPerson = inv.practice?.persons?.[0]?.person;
    const recipientName = firstPerson ? `${firstPerson.firstName} ${firstPerson.lastName}`.trim() : "";
    const recipientEmail = firstPerson?.email || inv.practice?.emails?.[0] || "";
    const recipient = recipientName
      ? (recipientEmail ? `${recipientName} (${recipientEmail})` : recipientName)
      : (recipientEmail || "N/A");

    const creator = inv.createdByUser;
    const createdBy = creator
      ? (`${creator.firstName || ""} ${creator.lastName || ""}`.trim() || creator.userName || creator.email)
      : "Prince Akabari";

    const formatted = {
      id: inv.id,
      invoiceNumber: `INV-${year}-${code}`,
      practice: inv.practice?.name || "N/A",
      practiceId: inv.practiceId,
      prefundingCycle: inv.cycle,
      totalAmount: Number(inv.totalAmount),
      status: inv.status,
      dueDate: inv.dueDate ? new Date(inv.dueDate).toISOString().split("T")[0] : "",
      invoiceDate: inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().split("T")[0] : "",
      recipientName,
      recipientEmail,
      recipient,
      createdBy,
      createdDate: new Date(inv.createdAt).toISOString().split("T")[0],
      postedDate: inv.status.toLowerCase() === "posted" ? new Date(inv.updatedAt).toISOString().split("T")[0] : null,
      lineItems: (inv.lineItems || []).map((item: any) => ({
        ...item,
        rate: item.rate !== null ? Number(item.rate) : null,
        amount: Number(item.amount),
      })),
    };

    return res.status(200).json({ invoice: formatted });
  } catch (error: any) {
    return res.status(500).json({ message: "Failed to fetch invoice", error: error.message });
  }
}

export async function getPrefundingInvoicePdf(req: AuthenticatedRequest, res: Response) {
  try {
    const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
    const inv: any = await prisma.prefundingInvoice.findFirst({
      where: { id },
      include: {
        practice: {
          include: {
            persons: {
              include: { person: true },
              
              take: 1,
            }
          }
        },
        lineItems: true,
      }
    });

    if (!inv) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    const firstPerson = inv.practice?.persons?.[0]?.person;
    const recipientName = firstPerson ? `${firstPerson.firstName} ${firstPerson.lastName}`.trim() : undefined;
    const recipientEmail = firstPerson?.email || inv.practice?.emails?.[0] || undefined;

    const year = new Date(inv.createdAt).getFullYear();
    const code = inv.id.replace(/-/g, "").slice(0, 5).toUpperCase();
    const invoiceNumber = `INV-${year}-${code}`;

    const pdfBuffer = await generatePrefundingInvoicePdfBuffer({
      invoiceNumber,
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate,
      cycle: inv.cycle,
      totalAmount: Number(inv.totalAmount),
      status: inv.status,
      practice: inv.practice,
      recipientName,
      recipientEmail,
      lineItems: (inv.lineItems || []).map((item: any) => ({
        ...item,
        rate: item.rate !== null ? Number(item.rate) : null,
        amount: Number(item.amount),
      })),
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="prefunding-invoice-${invoiceNumber}.pdf"`);
    return res.status(200).send(pdfBuffer);
  } catch (error: any) {
    console.error("PDF generation error:", error);
    return res.status(500).json({ message: "Failed to generate invoice PDF", error: error.message });
  }
}

export async function updatePrefundingInvoiceStatus(req: AuthenticatedRequest, res: Response) {
  try {
    const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    const updated = await prisma.prefundingInvoice.update({
      where: { id },
      data: { status },
      include: {
        practice: true,
        lineItems: true,
      }
    });

    return res.status(200).json({ message: "Status updated successfully", invoice: updated });
  } catch (error: any) {
    return res.status(500).json({ message: "Failed to update invoice status", error: error.message });
  }
}

export async function deletePrefundingInvoice(req: AuthenticatedRequest, res: Response) {
  try {
    const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
    await prisma.prefundingInvoice.delete({ where: { id } });
    return res.status(200).json({ message: "Invoice deleted successfully" });
  } catch (error: any) {
    return res.status(500).json({ message: "Failed to delete invoice", error: error.message });
  }
}
