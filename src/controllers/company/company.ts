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
  taxIds?: {
    id?: string;
    taxIdNumber: string;
    legalEntityName: string;
    notes?: string;
  }[];
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
      taxIds,
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
        taxIds: taxIds
          ? {
              create: taxIds.map((tax) => ({
                taxIdNumber: tax.taxIdNumber,
                legalEntityName: tax.legalEntityName,
                notes: tax.notes,
              })),
            }
          : undefined,
      },
      include: {
        taxIds: true,
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

    const where: any = {};

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
          taxIds: true,
          _count: {
            select: {
              practices: true,
              practiceGroups: true,
              taxIds: true,
            },
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
      },
      include: {
        practices: true,
        practiceGroups: true,
        taxIds: true,
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
      taxIds,
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
      },
    });

    if (!companyExists) {
      return res.status(404).json({
        message: "Company not found.",
      });
    }

    // SYNC BEHAVIOR:
    // If taxIds is provided, we want the database to exactly match the provided list.
    if (taxIds !== undefined) {
      // 1. Identify IDs being sent (to keep)
      const sentTaxIds = taxIds.map((t) => t.id).filter(Boolean) as string[];

      // 2. Identify TaxIdNumbers being sent (to keep - for records without IDs yet)
      const sentTaxNumbers = taxIds
        .filter((t) => !t.id)
        .map((t) => t.taxIdNumber);

      // 3. Delete existing records for this company that are NOT in the sent list
      await prisma.taxId.deleteMany({
        where: {
          companyId: id,
          AND: [
            { id: { notIn: sentTaxIds } },
            { taxIdNumber: { notIn: sentTaxNumbers } },
          ],
        },
      });

      // 4. Upsert the provided records
      if (taxIds.length > 0) {
        for (const tax of taxIds) {
          await prisma.taxId.upsert({
            where: tax.id ? { id: tax.id } : { taxIdNumber: tax.taxIdNumber },
            update: {
              taxIdNumber: tax.taxIdNumber,
              legalEntityName: tax.legalEntityName,
              notes: tax.notes,
              companyId: id,
            },
            create: {
              taxIdNumber: tax.taxIdNumber,
              legalEntityName: tax.legalEntityName,
              notes: tax.notes,
              companyId: id,
            },
          });
        }
      }
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
      include: {
        taxIds: true,
      },
    });

    return res.status(200).json({
      message: "Company updated successfully.",
      company,
    });
  } catch (error) {
    if ((error as any).code === "P2002") {
      return res.status(400).json({
        message:
          "One or more Tax ID numbers are already in use by another company.",
        error: "Unique constraint failed",
      });
    }
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
      },
    });

    if (!companyExists) {
      return res.status(404).json({
        message: "Company not found.",
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
