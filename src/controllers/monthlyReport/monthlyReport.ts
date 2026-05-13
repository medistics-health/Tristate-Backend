import { Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

type SubmitReportBody = {
  practiceId: string;
  serviceId: string;
  month: string;
  year: number;
  metrics: Record<string, number>;
  dueDate?: string;
};

function isReportStatus(value: string): value is "PENDING" | "SUBMITTED" {
  return value === "PENDING" || value === "SUBMITTED";
}

export async function submitReport(req: AuthenticatedRequest, res: Response) {
  try {
    const { practiceId, serviceId, month, year, metrics, dueDate } =
      req.body as SubmitReportBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!practiceId || !serviceId || !month || !year || !dueDate) {
      return res.status(400).json({
        message:
          "practiceId, serviceId, month, year, and dueDate are required.",
      });
    }

    const practice = await prisma.practice.findUnique({
      where: { id: practiceId },
    });
    if (!practice) {
      return res.status(404).json({ message: "Practice not found." });
    }

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
    });
    if (!service) {
      return res.status(404).json({ message: "Service not found." });
    }

    const existing = await prisma.monthlyReport.findUnique({
      where: {
        serviceId,
      },
    });

    let report;

    if (existing) {
      // report = await prisma.monthlyReport.update({
      //   where: { id: existing.id },
      //   data: {
      //     status: "SUBMITTED",
      //     submittedBy: req.user.userName,
      //     metrics: metrics ?? {},
      //     dueDate: dueDate ? new Date(dueDate) : undefined,
      //   },
      //   include: {
      //     practice: { select: { name: true } },
      //     service: { select: { name: true } },
      //   },
      // });
      return res.status(400).json({
        message: "Report Already Submitted for this Service",
      });
    } else {
      report = await prisma.monthlyReport.create({
        data: {
          practiceId,
          serviceId,
          status: "SUBMITTED",
          submittedBy: req.user.userName,
          month,
          year,
          metrics: metrics ?? {},
          dueDate: new Date(dueDate),
        },
        include: {
          practice: { select: { name: true } },
          service: { select: { name: true } },
        },
      });
    }

    return res.status(201).json({
      message: "Report submitted successfully.",
      report: {
        id: report.id,
        practiceName: report.practice.name,
        practiceId: report.practiceId,
        serviceName: report.service.name,
        serviceId: report.serviceId,
        status: report.status,
        submittedBy: report.submittedBy,
        dueDate: report.dueDate?.toISOString().split("T")[0] ?? null,
        month: report.month,
        year: report.year,
        metrics: report.metrics,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to submit report.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getReports(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const status = req.query.status as string;
    const practiceName = req.query.practiceName as string;
    const serviceName = req.query.serviceName as string;
    const sortBy = (req.query.sortBy as string) || "createdAt";
    const sortOrder =
      (req.query.sortOrder as string) === "asc" ? "asc" : "desc";

    const skip = (page - 1) * limit;

    const where: any = {};

    if (status && isReportStatus(status)) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { practice: { name: { contains: search, mode: "insensitive" } } },
        { service: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    if (practiceName) {
      where.practice = {
        name: { contains: practiceName, mode: "insensitive" },
      };
    }

    if (serviceName) {
      where.service = { name: { contains: serviceName, mode: "insensitive" } };
    }

    const orderBy: any = {};
    if (sortBy === "practiceName") {
      orderBy.practice = { name: sortOrder };
    } else if (sortBy === "serviceName") {
      orderBy.service = { name: sortOrder };
    } else {
      orderBy[sortBy] = sortOrder;
    }

    const [reports, total] = await Promise.all([
      prisma.monthlyReport.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          practice: { select: { name: true } },
          service: { select: { name: true } },
        },
      }),
      prisma.monthlyReport.count({ where }),
    ]);

    return res.status(200).json({
      message: "Reports fetched successfully.",
      reports: reports.map((report) => ({
        id: report.id,
        practiceName: report.practice.name,
        practiceId: report.practiceId,
        serviceName: report.service.name,
        serviceId: report.serviceId,
        status: report.status,
        submittedBy: report.submittedBy,
        dueDate: report.dueDate?.toISOString().split("T")[0] ?? null,
        month: report.month,
        year: report.year,
        metrics: report.metrics,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch reports.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getReport(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Report id is required." });
    }

    const report = await prisma.monthlyReport.findUnique({
      where: { id },
      include: {
        practice: { select: { name: true } },
        service: { select: { name: true } },
      },
    });

    if (!report) {
      return res.status(404).json({ message: "Report not found." });
    }

    return res.status(200).json({
      message: "Report fetched successfully.",
      report: {
        id: report.id,
        practiceName: report.practice.name,
        practiceId: report.practiceId,
        serviceName: report.service.name,
        serviceId: report.serviceId,
        status: report.status,
        submittedBy: report.submittedBy,
        dueDate: report.dueDate?.toISOString().split("T")[0] ?? null,
        month: report.month,
        year: report.year,
        metrics: report.metrics,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch report.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updateReport(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { status, metrics, month, year, dueDate, submittedBy } = req.body as {
      status?: string;
      metrics?: Record<string, number>;
      month: string;
      year: number;
      dueDate?: string;
      submittedBy?: string;
    };

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Report id is required." });
    }

    const existing = await prisma.monthlyReport.findUnique({ where: { id } });

    if (!existing) {
      return res.status(404).json({ message: "Report not found." });
    }

    const data: any = {};
    if (status && isReportStatus(status)) data.status = status;
    if (metrics !== undefined) data.metrics = metrics;
    if (month !== undefined) data.month = month;
    if (year !== undefined) data.year = year;
    if (dueDate) data.dueDate = new Date(dueDate);
    if (submittedBy) data.submittedBy = submittedBy;

    const report = await prisma.monthlyReport.update({
      where: { id },
      data,
      include: {
        practice: { select: { name: true } },
        service: { select: { name: true } },
      },
    });

    return res.status(200).json({
      message: "Report updated successfully.",
      report: {
        id: report.id,
        practiceName: report.practice.name,
        practiceId: report.practiceId,
        serviceName: report.service.name,
        serviceId: report.serviceId,
        status: report.status,
        submittedBy: report.submittedBy,
        dueDate: report.dueDate?.toISOString().split("T")[0] ?? null,
        month: report.month,
        year: report.year,
        metrics: report.metrics,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to update report.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function deleteReport(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Report id is required." });
    }

    const existing = await prisma.monthlyReport.findUnique({ where: { id } });

    if (!existing) {
      return res.status(404).json({ message: "Report not found." });
    }

    await prisma.monthlyReport.delete({ where: { id } });

    return res.status(200).json({ message: "Report deleted successfully." });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete report.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
