import { CompanyStatus } from "../../../generated/prisma/client";
import { Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

type AddressBody = {
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  zip?: string;
};

type CompanyBody = {
  name: string;
  domain?: string;
  industry?: string;
  size?: number;
  revenue?: number;
  phone?: string;
  email?: string;
  website?: string;
  address?: AddressBody;
  status?: string;
};

function isCompanyStatus(status: string): status is CompanyStatus {
  return Object.values(CompanyStatus).includes(status as CompanyStatus);
}

export async function createCompany(req: AuthenticatedRequest, res: Response) {
  try {
    const {
      name,
      domain,
      industry,
      size,
      revenue,
      phone,
      email,
      website,
      address,
      status,
    } = req.body as CompanyBody;

    if (!req.user?.sub) {
      return res.status(401).json({
        message: "Unauthorized.",
      });
    }

    if (!name) {
      return res.status(400).json({
        message: "Company name is required.",
      });
    }

    if (status && !isCompanyStatus(status)) {
      return res.status(400).json({
        message: "Invalid company status.",
        allowedStatuses: Object.values(CompanyStatus),
      });
    }

    const company = await prisma.company.create({
      data: {
        name,
        domain,
        industry,
        size,
        revenue,
        phone,
        email,
        website,
        street: address?.street,
        city: address?.city,
        state: address?.state,
        country: address?.country,
        zip: address?.zip,
        status: (status as CompanyStatus) || CompanyStatus.LEAD,
        ownerId: req.user.sub,
      },
    });

    return res.status(201).json({
      message: "Company created successfully.",
      company,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to create company.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getCompanies(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({
        message: "Unauthorized.",
      });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const { search, status, industry } = req.query;

    const where: any = {
      ownerId: req.user.sub,
    };

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: "insensitive" } },
        { domain: { contains: search as string, mode: "insensitive" } },
        { email: { contains: search as string, mode: "insensitive" } },
      ];
    }

    if (status && (status as string) in CompanyStatus) {
      where.status = status as CompanyStatus;
    }

    if (industry) {
      where.industry = { contains: industry as string, mode: "insensitive" };
    }

    const [companies, totalRecords] = await Promise.all([
      prisma.company.findMany({
        where,
        include: {
          _count: {
            select: { practices: true },
          },
        },
        skip,
        take: limit,
        orderBy: {
          createdAt: "desc",
        },
      }),
      prisma.company.count({ where }),
    ]);

    const totalPages = Math.ceil(totalRecords / limit);

    return res.status(200).json({
      message: "Companies fetched successfully.",
      companies,
      pagination: {
        totalRecords,
        totalPages,
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      message: "Unable to fetch companies.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getCompany(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({
        message: "Unauthorized.",
      });
    }

    if (!id) {
      return res.status(400).json({
        message: "Company id is required.",
      });
    }

    const company = await prisma.company.findFirst({
      where: {
        id,
        ownerId: req.user.sub,
      },
      include: {
        practices: true,
      },
    });

    if (!company) {
      return res.status(404).json({
        message: "Company not found.",
      });
    }

    return res.status(200).json({
      message: "Company fetched successfully.",
      company,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch company.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updateCompany(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const {
      name,
      domain,
      industry,
      size,
      revenue,
      phone,
      email,
      website,
      address,
      status,
    } = req.body as CompanyBody;

    if (!req.user?.sub) {
      return res.status(401).json({
        message: "Unauthorized.",
      });
    }

    if (!id) {
      return res.status(400).json({
        message: "Company id is required.",
      });
    }

    if (status && !isCompanyStatus(status)) {
      return res.status(400).json({
        message: "Invalid company status.",
        allowedStatuses: Object.values(CompanyStatus),
      });
    }

    const companyExists = await prisma.company.findFirst({
      where: {
        id,
        ownerId: req.user.sub,
      },
    });

    if (!companyExists) {
      return res.status(404).json({
        message: "Company not found or you are not authorized to update it.",
      });
    }

    const company = await prisma.company.update({
      where: { id },
      data: {
        name,
        domain,
        industry,
        size,
        revenue,
        phone,
        email,
        website,
        street: address?.street,
        city: address?.city,
        state: address?.state,
        country: address?.country,
        zip: address?.zip,
        status: status as CompanyStatus,
      },
    });

    return res.status(200).json({
      message: "Company updated successfully.",
      company,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to update company.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function deleteCompany(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({
        message: "Unauthorized.",
      });
    }

    if (!id) {
      return res.status(400).json({
        message: "Company id is required.",
      });
    }

    const companyExists = await prisma.company.findFirst({
      where: {
        id,
        ownerId: req.user.sub,
      },
    });

    if (!companyExists) {
      return res.status(404).json({
        message: "Company not found or you are not authorized to delete it.",
      });
    }

    await prisma.company.delete({
      where: { id },
    });

    return res.status(200).json({
      message: "Company deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete company.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
