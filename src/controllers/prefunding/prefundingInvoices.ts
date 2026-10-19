import { Response } from "express";
import { prisma } from "../../lib/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { generatePrefundingInvoicePdfBuffer } from "../../utils/prefundingInvoicePdf";
import { processAndEmailPrefundingInvoice } from "./prefundingStripe";

export async function createPrefundingInvoice(req: AuthenticatedRequest, res: Response) {
  try {
    const { practiceId, cycle, invoiceDate, dueDate, totalAmount, lineItems } = req.body;

    if (!practiceId || !cycle || !invoiceDate || !dueDate || totalAmount === undefined) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const year = new Date(invoiceDate).getFullYear();
    const uniqueSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
    const invoiceNumber = `INV-${year}-${uniqueSuffix}`;

    const prefundingInvoice = await prisma.prefundingInvoice.create({
      data: {
        invoiceNumber,
        practiceId,
        cycle,
        invoiceDate: new Date(invoiceDate),
        dueDate: new Date(dueDate),
        totalAmount,
        subtotalAmount: totalAmount,
        status: "Draft",
        createdByUserId: req.user?.sub || null,
        lineItems: {
          create: (lineItems || []).map((item: any, idx: number) => ({
            name: item.name,
            basis: item.basis || null,
            pricingModel: item.pricingModel || null,
            rate: item.rate !== undefined && item.rate !== null && item.rate !== "" ? Number(item.rate) : null,
            amount: Number(item.amount) || 0,
            notes: item.notes !== undefined && item.notes !== null ? String(item.notes).trim() : null,
            includeInGrandTotal: item.includeInGrandTotal !== undefined ? Boolean(item.includeInGrandTotal) : true,
            sequence: item.sequence !== undefined && item.sequence !== null ? Number(item.sequence) : idx,
            isOneTime: Boolean(item.isOneTime),
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
          lineItems: {
            orderBy: { sequence: "asc" }
          },
          paymentAllocations: {
            include: {
              payment: true,
            },
            take: 1,
          },
        }
      })
    ]);

    const formattedInvoices = invoices.map((inv: any) => {
      const year = new Date(inv.createdAt).getFullYear();
      const code = inv.id.replace(/-/g, "").slice(0, 5).toUpperCase();
      const invoiceNumber = inv.invoiceNumber || `INV-${year}-${code}`;

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

      const firstPaymentAlloc = inv.paymentAllocations?.[0];
      const paymentRecord = firstPaymentAlloc?.payment;
      const paymentMethodDisplay = paymentRecord?.paymentMethod || inv.paymentMethod || null;

      return {
        id: inv.id,
        invoiceNumber,
        practice: inv.practice?.name || "N/A",
        practiceId: inv.practiceId,
        prefundingCycle: inv.cycle,
        totalAmount: Number(inv.totalAmount),
        subtotalAmount: inv.subtotalAmount ? Number(inv.subtotalAmount) : Number(inv.totalAmount),
        processingFeeAmount: inv.processingFeeAmount ? Number(inv.processingFeeAmount) : 0,
        companyFeeAmount: inv.companyFeeAmount ? Number(inv.companyFeeAmount) : 0,
        paymentMethod: inv.paymentMethod || null,
        paymentMethodDisplay,
        status: inv.status,
        dueDate: inv.dueDate ? new Date(inv.dueDate).toISOString().split("T")[0] : "",
        invoiceDate: inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().split("T")[0] : "",
        recipientName,
        recipientEmail,
        recipient,
        createdBy,
        createdDate: new Date(inv.createdAt).toISOString().split("T")[0],
        postedDate: inv.status.toLowerCase() === "posted" ? new Date(inv.updatedAt).toISOString().split("T")[0] : null,
        stripeInvoiceId: inv.stripeInvoiceId || null,
        stripeHostedInvoiceUrl: inv.stripeHostedInvoiceUrl || null,
        stripeInvoicePdfUrl: inv.stripeInvoicePdfUrl || null,
        paidDate: paymentRecord?.paymentDate ? new Date(paymentRecord.paymentDate).toISOString().split("T")[0] : null,
        lineItems: (inv.lineItems || []).map((item: any) => ({
          ...item,
          rate: item.rate !== null ? Number(item.rate) : null,
          amount: Number(item.amount),
          includeInGrandTotal: item.includeInGrandTotal !== false,
          sequence: item.sequence ?? 0,
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
        lineItems: {
          orderBy: { sequence: "asc" }
        },
        paymentAllocations: {
          include: {
            payment: true,
          },
          take: 1,
        },
      }
    });

    if (!inv) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    const year = new Date(inv.createdAt).getFullYear();
    const code = inv.id.replace(/-/g, "").slice(0, 5).toUpperCase();
    const invoiceNumber = inv.invoiceNumber || `INV-${year}-${code}`;

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

    const firstPaymentAlloc = inv.paymentAllocations?.[0];
    const paymentRecord = firstPaymentAlloc?.payment;
    const paymentMethodDisplay = paymentRecord?.paymentMethod || inv.paymentMethod || null;

    const formatted = {
      id: inv.id,
      invoiceNumber,
      practice: inv.practice?.name || "N/A",
      practiceId: inv.practiceId,
      prefundingCycle: inv.cycle,
      totalAmount: Number(inv.totalAmount),
      subtotalAmount: inv.subtotalAmount ? Number(inv.subtotalAmount) : Number(inv.totalAmount),
      processingFeeAmount: inv.processingFeeAmount ? Number(inv.processingFeeAmount) : 0,
      companyFeeAmount: inv.companyFeeAmount ? Number(inv.companyFeeAmount) : 0,
      paymentMethod: inv.paymentMethod || null,
      paymentMethodDisplay,
      status: inv.status,
      dueDate: inv.dueDate ? new Date(inv.dueDate).toISOString().split("T")[0] : "",
      invoiceDate: inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().split("T")[0] : "",
      recipientName,
      recipientEmail,
      recipient,
      createdBy,
      createdDate: new Date(inv.createdAt).toISOString().split("T")[0],
      postedDate: inv.status.toLowerCase() === "posted" ? new Date(inv.updatedAt).toISOString().split("T")[0] : null,
      stripeInvoiceId: inv.stripeInvoiceId || null,
      stripeHostedInvoiceUrl: inv.stripeHostedInvoiceUrl || null,
      stripeInvoicePdfUrl: inv.stripeInvoicePdfUrl || null,
      paidDate: paymentRecord?.paymentDate ? new Date(paymentRecord.paymentDate).toISOString().split("T")[0] : null,
      lineItems: (inv.lineItems || []).map((item: any) => ({
        ...item,
        rate: item.rate !== null ? Number(item.rate) : null,
        amount: Number(item.amount),
        includeInGrandTotal: item.includeInGrandTotal !== false,
        sequence: item.sequence ?? 0,
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
        lineItems: {
          orderBy: { sequence: "asc" }
        },
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
    const invoiceNumber = inv.invoiceNumber || `INV-${year}-${code}`;

    const subtotalAmount = inv.subtotalAmount ? Number(inv.subtotalAmount) : Number(inv.totalAmount);
    const processingFeeAmount = inv.processingFeeAmount ? Number(inv.processingFeeAmount) : 0;
    const isCc = inv.paymentMethod === "CREDIT_CARD";
    const processingFeeDescription = processingFeeAmount > 0
      ? `Payment Processing Fee (${isCc ? "Credit Card" : "ACH"}):`
      : undefined;

    const pdfBuffer = await generatePrefundingInvoicePdfBuffer({
      invoiceNumber,
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate,
      cycle: inv.cycle,
      subtotalAmount,
      processingFeeAmount,
      processingFeeDescription,
      totalAmount: Number(inv.totalAmount),
      status: inv.status,
      practice: inv.practice,
      recipientName,
      recipientEmail,
      lineItems: (inv.lineItems || []).map((item: any) => ({
        ...item,
        rate: item.rate !== null ? Number(item.rate) : null,
        amount: Number(item.amount),
        includeInGrandTotal: item.includeInGrandTotal !== false,
        sequence: item.sequence ?? 0,
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

    if (status.toLowerCase() === "posted") {
      // Validate and process Stripe Invoice + Email dispatch with A4 PDF
      const postedInvoice = await processAndEmailPrefundingInvoice(id);
      return res.status(200).json({
        message: "Invoice posted successfully and Stripe invoice sent via email.",
        invoice: postedInvoice,
      });
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
    console.error("Error in updatePrefundingInvoiceStatus:", error);
    return res.status(400).json({ message: error.message || "Failed to update invoice status" });
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
