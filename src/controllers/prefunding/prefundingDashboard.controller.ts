import { Response } from "express";
import { prisma } from "../../lib/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";

function calculateUpcomingCyclesForPractice(
  practiceId: string,
  practiceName: string,
  startDateStr?: Date | string | null,
  cycleType?: string | null,
  count: number = 6
) {
  let baseDate: Date;
  if (startDateStr) {
    const raw = startDateStr instanceof Date ? startDateStr.toISOString() : String(startDateStr);
    const parts = raw.split("T")[0].split("-").map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      baseDate = new Date(parts[0], parts[1] - 1, parts[2]);
    } else {
      baseDate = new Date(startDateStr);
    }
  } else {
    baseDate = new Date();
  }

  const cycle = (cycleType || "MONTHLY").toUpperCase();
  const cycles: Array<{
    label: string;
    startDate: string;
    endDate: string;
    practiceId: string;
    practiceName: string;
    cycleType: string;
  }> = [];

  let currentStart = new Date(baseDate);

  for (let i = 0; i < count; i++) {
    let nextStart: Date;
    if (cycle === "WEEKLY") {
      nextStart = new Date(currentStart);
      nextStart.setDate(nextStart.getDate() + 7);
    } else if (cycle === "BI_WEEKLY" || cycle === "BIWEEKLY") {
      nextStart = new Date(currentStart);
      nextStart.setDate(nextStart.getDate() + 14);
    } else if (cycle === "QUARTERLY") {
      nextStart = new Date(currentStart);
      nextStart.setMonth(nextStart.getMonth() + 3);
    } else if (cycle === "SEMI_ANNUALLY" || cycle === "SEMIANNUALLY") {
      nextStart = new Date(currentStart);
      nextStart.setMonth(nextStart.getMonth() + 6);
    } else if (cycle === "YEARLY") {
      nextStart = new Date(currentStart);
      nextStart.setFullYear(nextStart.getFullYear() + 1);
    } else {
      // Default: MONTHLY
      nextStart = new Date(currentStart);
      nextStart.setMonth(nextStart.getMonth() + 1);
    }

    const currentEnd = new Date(nextStart);
    currentEnd.setDate(currentEnd.getDate() - 1);

    const startFormatted = currentStart.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
    const endFormatted = currentEnd.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });

    const startISO = `${currentStart.getFullYear()}-${String(currentStart.getMonth() + 1).padStart(2, "0")}-${String(currentStart.getDate()).padStart(2, "0")}`;
    const endISO = `${currentEnd.getFullYear()}-${String(currentEnd.getMonth() + 1).padStart(2, "0")}-${String(currentEnd.getDate()).padStart(2, "0")}`;

    const label = `${startFormatted} - ${endFormatted}`;

    cycles.push({
      label,
      startDate: startISO,
      endDate: endISO,
      practiceId,
      practiceName,
      cycleType: cycle,
    });

    currentStart = nextStart;
  }

  return cycles;
}

export async function getPrefundingDashboardData(req: AuthenticatedRequest, res: Response) {
  try {
    const { practiceId, cycle, status, dateFrom, dateTo } = req.query as {
      practiceId?: string;
      cycle?: string;
      status?: string;
      dateFrom?: string;
      dateTo?: string;
    };

    // 1. Build Filter Clause for Invoices
    const invoiceWhere: any = {};

    if (practiceId && practiceId !== "all") {
      invoiceWhere.practiceId = practiceId;
    }

    if (cycle && cycle !== "all") {
      invoiceWhere.cycle = { contains: cycle, mode: "insensitive" };
    }

    if (status && status !== "all") {
      invoiceWhere.status = { equals: status, mode: "insensitive" };
    }

    if (dateFrom || dateTo) {
      invoiceWhere.invoiceDate = {};
      if (dateFrom) {
        invoiceWhere.invoiceDate.gte = new Date(dateFrom);
      }
      if (dateTo) {
        const toD = new Date(dateTo);
        toD.setHours(23, 59, 59, 999);
        invoiceWhere.invoiceDate.lte = toD;
      }
    }

    // 2. Fetch Aggregates & Counts
    const [
      totalEnabledPractices,
      totalPrefundingRates,
      allEnabledPractices,
      invoices,
      allDistinctCyclesRaw,
      stripeTransferSummary,
    ] = await Promise.all([
      // Total Prefunding-enabled Practices (overall or filtered by practiceId)
      prisma.practice.count({
        where: {
          isPrefundingEnabled: true,
          ...(practiceId && practiceId !== "all" ? { id: practiceId } : {}),
        },
      }),

      // Total Prefunding Rate templates/line items
      prisma.prefundingRate.count({
        where: practiceId && practiceId !== "all"
          ? { practiceRates: { some: { practiceId } } }
          : {},
      }),

      // Enabled Practices list for upcoming cycles calculation & filter dropdown
      prisma.practice.findMany({
        where: {
          isPrefundingEnabled: true,
          ...(practiceId && practiceId !== "all" ? { id: practiceId } : {}),
        },
        select: {
          id: true,
          name: true,
          prefundingCycle: true,
          prefundingStartDate: true,
          prefundingDueOn: true,
          prefundingReminderOn: true,
        },
        orderBy: { name: "asc" },
      }),

      // Prefunding Invoices matching the filter
      prisma.prefundingInvoice.findMany({
        where: invoiceWhere,
        orderBy: { createdAt: "desc" },
        include: {
          practice: {
            select: {
              id: true,
              name: true,
              prefundingDueOn: true,
              prefundingReminderOn: true,
              prefundingCycle: true,
            },
          },
          createdByUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          approvedByUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          lineItems: {
            select: {
              id: true,
              name: true,
              amount: true,
              rate: true,
              basis: true,
              pricingModel: true,
            },
          },
          stripeTransfers: {
            select: {
              id: true,
              status: true,
              amount: true,
            },
          },
        },
      }),

      // Distinct cycles in system for filter dropdown
      prisma.prefundingInvoice.findMany({
        distinct: ["cycle"],
        select: { cycle: true },
        orderBy: { cycle: "asc" },
      }),

      // Stripe Transfer status aggregation for prefunding invoices
      prisma.invoiceConnectedAccountTransfer.groupBy({
        by: ["status"],
        where: {
          prefundingInvoiceId: { not: null },
          ...(practiceId && practiceId !== "all"
            ? { prefundingInvoice: { practiceId } }
            : {}),
        },
        _count: { id: true },
        _sum: { amount: true },
      }),
    ]);

    // 3. Compute Invoice Status Counts & Financial Aggregates
    let draftCount = 0;
    let pendingApprovalCount = 0;
    let approvedCount = 0;
    let postedCount = 0;
    let paidCount = 0;
    let overdueCount = 0;
    let cancelledCount = 0;

    let draftAmount = 0;
    let pendingApprovalAmount = 0;
    let approvedAmount = 0;
    let postedAmount = 0;
    let paidAmount = 0;
    let overdueAmount = 0;

    let totalAmountSum = 0;
    let totalNetAmountSum = 0;
    let upcomingDueAmountSum = 0;

    const now = new Date();
    const reminders: Array<{
      id: string;
      invoiceId: string;
      invoiceNumber: string;
      practiceId: string;
      practiceName: string;
      type: "reminder_due" | "overdue" | "cycle_starting";
      title: string;
      message: string;
      dueDate: string;
      cycle: string;
      amount: number;
      daysRemaining: number;
      severity: "info" | "warning" | "urgent";
    }> = [];

    for (const inv of invoices) {
      const amt = Number(inv.totalAmount) || 0;
      totalAmountSum += amt;

      const subtotal = inv.subtotalAmount ? Number(inv.subtotalAmount) : amt;
      const companyFee = inv.companyFeeAmount ? Number(inv.companyFeeAmount) : 0;
      const net = inv.netAmount !== null && inv.netAmount !== undefined ? Number(inv.netAmount) : Math.max(0, subtotal - companyFee);
      totalNetAmountSum += net;

      const normStatus = (inv.status || "").toLowerCase().trim();
      switch (normStatus) {
        case "draft":
          draftCount++;
          draftAmount += amt;
          break;
        case "pending approval":
        case "pending":
          pendingApprovalCount++;
          pendingApprovalAmount += amt;
          break;
        case "approved":
          approvedCount++;
          approvedAmount += amt;
          break;
        case "posted":
        case "sent":
          postedCount++;
          postedAmount += amt;
          break;
        case "paid":
          paidCount++;
          paidAmount += amt;
          break;
        case "overdue":
          overdueCount++;
          overdueAmount += amt;
          break;
        case "cancelled":
          cancelledCount++;
          break;
        default:
          break;
      }

      // Check upcoming due amount & reminders
      if (inv.dueDate) {
        const dueD = new Date(inv.dueDate);
        const msDiff = dueD.getTime() - now.getTime();
        const daysToDue = Math.ceil(msDiff / (1000 * 60 * 60 * 24));

        // Upcoming due amounts: active invoices not yet paid or cancelled
        if (normStatus !== "paid" && normStatus !== "cancelled") {
          upcomingDueAmountSum += amt;

          const invNumber = inv.invoiceNumber || inv.id.slice(0, 8);
          const practiceReminderDays = inv.practice?.prefundingReminderOn ?? 2;

          if (daysToDue < 0 || normStatus === "overdue") {
            reminders.push({
              id: `rem-overdue-${inv.id}`,
              invoiceId: inv.id,
              invoiceNumber: invNumber,
              practiceId: inv.practiceId,
              practiceName: inv.practice?.name || "Unknown Practice",
              type: "overdue",
              title: "Overdue Prefunding Invoice",
              message: `Invoice #${invNumber} was due ${Math.abs(daysToDue)} day(s) ago (${dueD.toLocaleDateString()}). Total amount: $${amt.toFixed(2)}`,
              dueDate: dueD.toISOString(),
              cycle: inv.cycle,
              amount: amt,
              daysRemaining: daysToDue,
              severity: "urgent",
            });
          } else if (daysToDue <= practiceReminderDays) {
            reminders.push({
              id: `rem-upcoming-${inv.id}`,
              invoiceId: inv.id,
              invoiceNumber: invNumber,
              practiceId: inv.practiceId,
              practiceName: inv.practice?.name || "Unknown Practice",
              type: "reminder_due",
              title: "Due Soon Reminder",
              message: `Invoice #${invNumber} is due in ${daysToDue} day(s) (${dueD.toLocaleDateString()}). Total amount: $${amt.toFixed(2)}`,
              dueDate: dueD.toISOString(),
              cycle: inv.cycle,
              amount: amt,
              daysRemaining: daysToDue,
              severity: daysToDue <= 1 ? "warning" : "info",
            });
          }
        }
      }
    }

    // 4. Compute Upcoming Cycles across Prefunding Practices
    const upcomingCyclesList: Array<{
      label: string;
      startDate: string;
      endDate: string;
      practiceId: string;
      practiceName: string;
      cycleType: string;
      daysUntilStart: number;
    }> = [];

    for (const p of allEnabledPractices) {
      if (p.prefundingCycle && p.prefundingStartDate) {
        const cycles = calculateUpcomingCyclesForPractice(
          p.id,
          p.name,
          p.prefundingStartDate,
          p.prefundingCycle,
          4
        );

        for (const c of cycles) {
          const cStart = new Date(c.startDate);
          const diffDays = Math.ceil((cStart.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          // Filter to future or active cycles
          if (diffDays >= -7) {
            upcomingCyclesList.push({
              ...c,
              daysUntilStart: diffDays,
            });
          }
        }
      }
    }

    // Sort upcoming cycles by start date ascending
    upcomingCyclesList.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

    // 5. Total Prefunding Calculations performed (Total invoices created)
    const totalCalculationsCount = invoices.length;

    // 6. Distinct cycles for filter
    const distinctCycles = allDistinctCyclesRaw.map((c) => c.cycle).filter(Boolean);

    // 7. Recent Invoices (limit to 10 for table)
    const recentInvoices = invoices.slice(0, 10).map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber || inv.id.slice(0, 8),
      practiceId: inv.practiceId,
      practiceName: inv.practice?.name || "Unknown Practice",
      cycle: inv.cycle,
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate,
      totalAmount: Number(inv.totalAmount),
      subtotalAmount: inv.subtotalAmount ? Number(inv.subtotalAmount) : Number(inv.totalAmount),
      processingFeeAmount: inv.processingFeeAmount ? Number(inv.processingFeeAmount) : 0,
      companyFeeAmount: inv.companyFeeAmount ? Number(inv.companyFeeAmount) : 0,
      netAmount: inv.netAmount !== null && inv.netAmount !== undefined ? Number(inv.netAmount) : Math.max(0, (inv.subtotalAmount ? Number(inv.subtotalAmount) : Number(inv.totalAmount)) - (inv.companyFeeAmount ? Number(inv.companyFeeAmount) : 0)),
      status: inv.status,
      paymentMethod: inv.paymentMethod,
      stripeInvoiceId: inv.stripeInvoiceId,
      stripeHostedInvoiceUrl: inv.stripeHostedInvoiceUrl,
      invoicePdfBlobUrl: inv.invoicePdfBlobUrl,
      receiptPdfBlobUrl: inv.receiptPdfBlobUrl,
      createdAt: inv.createdAt,
      createdByName: inv.createdByUser ? `${inv.createdByUser.firstName} ${inv.createdByUser.lastName}` : null,
      lineItemsCount: inv.lineItems?.length || 0,
      stripeTransfersCount: inv.stripeTransfers?.length || 0,
    }));

    return res.status(200).json({
      success: true,
      summary: {
        totalPractices: totalEnabledPractices,
        upcomingCyclesCount: upcomingCyclesList.length,
        totalCalculations: totalCalculationsCount,
        ratesCount: totalPrefundingRates,
        totalPrefundingAmount: totalAmountSum,
        totalNetAmount: totalNetAmountSum,
        upcomingDueAmount: upcomingDueAmountSum,
        statusCounts: {
          draft: draftCount,
          pendingApproval: pendingApprovalCount,
          approved: approvedCount,
          posted: postedCount,
          paid: paidCount,
          overdue: overdueCount,
          cancelled: cancelledCount,
        },
        statusAmounts: {
          draft: draftAmount,
          pendingApproval: pendingApprovalAmount,
          approved: approvedAmount,
          posted: postedAmount,
          paid: paidAmount,
          overdue: overdueAmount,
        },
        stripeTransfers: stripeTransferSummary.map((st) => ({
          status: st.status,
          count: st._count.id,
          totalAmount: Number(st._sum.amount || 0),
        })),
      },
      upcomingCycles: upcomingCyclesList.slice(0, 8),
      reminders,
      recentInvoices,
      availablePractices: allEnabledPractices.map((p) => ({
        id: p.id,
        name: p.name,
        cycle: p.prefundingCycle,
      })),
      availableCycles: distinctCycles,
    });
  } catch (error: any) {
    console.error("Error in getPrefundingDashboardData:", error);
    return res.status(500).json({
      message: "Failed to load prefunding dashboard data",
      error: error.message,
    });
  }
}
