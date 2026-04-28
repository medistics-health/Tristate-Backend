import { PersonRole, InfluenceLevel } from "../../../generated/prisma/client";
import { Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

type PersonBody = {
  practiceIds?: string[];
  companyIds?: string[];
  firstName?: string;
  lastName?: string;
  role?: string;
  designation?: string;
  influence?: string;
  email?: string;
  phone?: string;
};

function isPersonRole(role: string): role is PersonRole {
  return Object.values(PersonRole).includes(role as PersonRole);
}

function isInfluenceLevel(influence: string): influence is InfluenceLevel {
  return Object.values(InfluenceLevel).includes(influence as InfluenceLevel);
}

export async function getPersons(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({
        message: "Unauthorized.",
      });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const { search, role, influence, practiceId, companyId } = req.query;

    const where: any = {};

    if (search) {
      where.AND = [
        {
          OR: [
            { firstName: { contains: search as string, mode: "insensitive" } },
            { lastName: { contains: search as string, mode: "insensitive" } },
            { email: { contains: search as string, mode: "insensitive" } },
          ],
        },
      ];
    }

    if (role) {
      where.role = role as PersonRole;
    }

    if (influence) {
      where.influence = influence as InfluenceLevel;
    }

    if (practiceId) {
      where.practices = {
        some: {
          practiceId: practiceId as string,
        },
      };
    }

    if (companyId) {
      where.companies = {
        some: {
          companyId: companyId as string,
        },
      };
    }

    const [persons, totalRecords] = await Promise.all([
      prisma.person.findMany({
        where,
        include: {
          practices: {
            include: {
              practice: true,
            },
          },
          companies: {
            include: {
              company: true,
            },
          },
          docusealSubmissions: {
            where: { signers: { some: { status: "completed" } } },
          },
        },
        skip,
        take: limit,
        orderBy: {
          createdAt: "desc",
        },
      }),
      prisma.person.count({ where }),
    ]);

    const totalPages = Math.ceil(totalRecords / limit);

    return res.status(200).json({
      message: "Persons fetched successfully.",
      persons,
      pagination: {
        totalRecords,
        totalPages,
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch persons.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function createPerson(req: AuthenticatedRequest, res: Response) {
  try {
    const {
      practiceIds,
      companyIds,
      firstName,
      lastName,
      role,
      designation,
      influence,
      email,
      phone,
    } = req.body as PersonBody;

    if (!req.user?.sub) {
      return res.status(401).json({
        message: "Unauthorized.",
      });
    }

    if (!firstName || !lastName || !role || !influence) {
      return res.status(400).json({
        message: "firstName, lastName, role and influence are required.",
      });
    }

    if (!practiceIds?.length && !companyIds?.length) {
      return res.status(400).json({
        message: "At least one practiceIds or companyIds is required.",
      });
    }

    if (!isPersonRole(role)) {
      return res.status(400).json({
        message: "Invalid person role.",
        allowedRoles: Object.values(PersonRole),
      });
    }

    if (!isInfluenceLevel(influence)) {
      return res.status(400).json({
        message: "Invalid influence level.",
        allowedInfluenceLevels: Object.values(InfluenceLevel),
      });
    }

    if (practiceIds?.length) {
      const validPractices = await prisma.practice.findMany({
        where: {
          id: { in: practiceIds },
          // ownerId: req.user.sub,
        },
      });

      if (validPractices.length !== practiceIds.length) {
        return res.status(404).json({
          message: "One or more practices not found.",
        });
      }
    }

    if (companyIds?.length) {
      const validCompanies = await prisma.company.findMany({
        where: {
          id: { in: companyIds },
          // ownerId: req.user.sub,
        },
      });

      if (validCompanies.length !== companyIds.length) {
        return res.status(404).json({
          message: "One or more companies not found.",
        });
      }
    }

    const createData: any = {
      firstName,
      lastName,
      role,
      designation,
      influence,
      email,
      phone,
    };

    if (practiceIds?.length) {
      createData.practices = {
        create: practiceIds.map((practiceId) => ({
          practiceId,
        })),
      };
    }

    if (companyIds?.length) {
      createData.companies = {
        create: companyIds.map((companyId) => ({
          companyId,
        })),
      };
    }

    const person = await prisma.person.create({
      data: createData,
      include: {
        practices: {
          include: {
            practice: true,
          },
        },
        companies: {
          include: {
            company: true,
          },
        },
      },
    });

    return res.status(201).json({
      message: "Person created successfully.",
      person,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      message: "Unable to create person.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getPerson(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({
        message: "Unauthorized.",
      });
    }

    if (!id) {
      return res.status(400).json({
        message: "Person id is required.",
      });
    }

    const person = await prisma.person.findFirst({
      where: {
        id,
        // OR: [
        //   {
        //     practices: {
        //       some: {
        //         practice: {
        //           ownerId: req.user.sub,
        //         },
        //       },
        //     },
        //   },
        //   {
        //     companies: {
        //       some: {
        //         company: {
        //           ownerId: req.user.sub,
        //         },
        //       },
        //     },
        //   },
        // ],
      },
      include: {
        practices: {
          include: {
            practice: true,
          },
        },
        companies: {
          include: {
            company: true,
          },
        },
        docusealSubmissions: {
          where: { signers: { some: { status: "completed" } } },
        },
      },
    });

    if (!person) {
      return res.status(404).json({
        message: "Person not found.",
      });
    }

    return res.status(200).json({
      message: "Person fetched successfully.",
      person,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch person.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updatePerson(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const {
      firstName,
      lastName,
      role,
      designation,
      influence,
      email,
      phone,
      practiceIds,
      companyIds,
    } = req.body as PersonBody;

    if (!req.user?.sub) {
      return res.status(401).json({
        message: "Unauthorized.",
      });
    }

    if (!id) {
      return res.status(400).json({
        message: "Person id is required.",
      });
    }

    if (role && !isPersonRole(role)) {
      return res.status(400).json({
        message: "Invalid person role.",
        allowedRoles: Object.values(PersonRole),
      });
    }

    if (influence && !isInfluenceLevel(influence)) {
      return res.status(400).json({
        message: "Invalid influence level.",
        allowedInfluenceLevels: Object.values(InfluenceLevel),
      });
    }

    const existingPerson = await prisma.person.findFirst({
      where: {
        id,
        // OR: [
        //   {
        //     practices: {
        //       some: {
        //         practice: {
        //           ownerId: req.user.sub,
        //         },
        //       },
        //     },
        //   },
        //   {
        //     companies: {
        //       some: {
        //         company: {
        //           ownerId: req.user.sub,
        //         },
        //       },
        //     },
        //   },
        // ],
      },
    });

    if (!existingPerson) {
      return res.status(404).json({
        message: "Person not found.",
      });
    }

    const updateData: any = {};

    if (firstName !== undefined) {
      updateData.firstName = firstName;
    }

    if (lastName !== undefined) {
      updateData.lastName = lastName;
    }

    if (role !== undefined) {
      updateData.role = role as PersonRole;
    }

    if (designation !== undefined) {
      updateData.designation = designation;
    }

    if (influence !== undefined) {
      updateData.influence = influence as InfluenceLevel;
    }

    if (email !== undefined) {
      updateData.email = email;
    }

    if (phone !== undefined) {
      updateData.phone = phone;
    }

    if (practiceIds !== undefined) {
      const existingPractices = await prisma.practicePerson.findMany({
        where: { personId: id },
        select: { practiceId: true },
      });
      const existingPracticeSet = new Set(
        existingPractices.map((e) => e.practiceId),
      );
      const newPracticeSet = new Set(practiceIds);

      const toRemove = [...existingPracticeSet].filter(
        (pid) => !newPracticeSet.has(pid),
      );
      const toAdd = [...newPracticeSet].filter(
        (pid) => !existingPracticeSet.has(pid),
      );

      if (toRemove.length) {
        await prisma.practicePerson.deleteMany({
          where: { personId: id, practiceId: { in: toRemove } },
        });
      }

      if (toAdd.length) {
        const validPractices = await prisma.practice.findMany({
          // where: { id: { in: toAdd }, ownerId: req.user.sub },
          where: { id: { in: toAdd } },
        });
        if (validPractices.length !== toAdd.length) {
          return res
            .status(404)
            .json({ message: "One or more practices not found." });
        }
        updateData.practices = {
          create: toAdd.map((practiceId) => ({ practiceId })),
        };
      }
    }

    if (companyIds !== undefined) {
      const existingCompanies = await prisma.companyPerson.findMany({
        where: { personId: id },
        select: { companyId: true },
      });
      const existingCompanySet = new Set(
        existingCompanies.map((e) => e.companyId),
      );
      const newCompanySet = new Set(companyIds);

      const toRemove = [...existingCompanySet].filter(
        (cid) => !newCompanySet.has(cid),
      );
      const toAdd = [...newCompanySet].filter(
        (cid) => !existingCompanySet.has(cid),
      );

      if (toRemove.length) {
        await prisma.companyPerson.deleteMany({
          where: { personId: id, companyId: { in: toRemove } },
        });
      }

      if (toAdd.length) {
        const validCompanies = await prisma.company.findMany({
          where: {
            id: { in: toAdd },
            // ownerId: req.user.sub
          },
        });
        if (validCompanies.length !== toAdd.length) {
          return res
            .status(404)
            .json({ message: "One or more companies not found." });
        }
        updateData.companies = {
          create: toAdd.map((companyId) => ({ companyId })),
        };
      }
    }

    const person = await prisma.person.update({
      where: { id },
      data: updateData,
      include: {
        practices: { include: { practice: true } },
        companies: { include: { company: true } },
      },
    });

    return res.status(200).json({
      message: "Person updated successfully.",
      person,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to update person.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function deletePerson(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({
        message: "Unauthorized.",
      });
    }

    if (!id) {
      return res.status(400).json({
        message: "Person id is required.",
      });
    }

    const existingPerson = await prisma.person.findFirst({
      where: {
        id,
        // OR: [
        //   {
        //     practices: {
        //       some: {
        //         practice: {
        //           ownerId: req.user.sub,
        //         },
        //       },
        //     },
        //   },
        //   {
        //     companies: {
        //       some: {
        //         company: {
        //           ownerId: req.user.sub,
        //         },
        //       },
        //     },
        //   },
        // ],
      },
    });

    if (!existingPerson) {
      return res.status(404).json({
        message: "Person not found.",
      });
    }

    await prisma.person.delete({
      where: {
        id,
      },
    });

    return res.status(200).json({
      message: "Person deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete person.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

type PersonAssociationBody = {
  practiceIds?: string[];
  companyIds?: string[];
};

// async function getPersonOwnershipCondition(_userId: string) {
//   return {};
// }

export async function addPersonAssociations(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { practiceIds, companyIds } = req.body as PersonAssociationBody;

    if (!req.user?.sub) {
      return res.status(401).json({
        message: "Unauthorized.",
      });
    }

    if (!id) {
      return res.status(400).json({
        message: "Person id is required.",
      });
    }

    if (!practiceIds?.length && !companyIds?.length) {
      return res.status(400).json({
        message: "At least one practiceIds or companyIds is required.",
      });
    }

    const existingPerson = await prisma.person.findFirst({
      where: {
        id,
      },
    });

    if (!existingPerson) {
      return res.status(404).json({
        message: "Person not found.",
      });
    }

    const createData: any = {};

    if (practiceIds?.length) {
      const validPractices = await prisma.practice.findMany({
        where: {
          id: { in: practiceIds },
          // ownerId: req.user.sub,
        },
      });

      if (validPractices.length !== practiceIds.length) {
        return res.status(404).json({
          message: "One or more practices not found.",
        });
      }

      const existingPracticeIds = await prisma.practicePerson.findMany({
        where: {
          personId: id,
          practiceId: { in: practiceIds },
        },
        select: { practiceId: true },
      });

      const existingPracticeIdSet = new Set(
        existingPracticeIds.map((p) => p.practiceId),
      );
      const newPracticeIds = practiceIds.filter(
        (pid) => !existingPracticeIdSet.has(pid),
      );

      if (newPracticeIds.length) {
        createData.practices = {
          create: newPracticeIds.map((practiceId) => ({ practiceId })),
        };
      }
    }

    if (companyIds?.length) {
      const validCompanies = await prisma.company.findMany({
        where: {
          id: { in: companyIds },
          // ownerId: req.user.sub,
        },
      });

      if (validCompanies.length !== companyIds.length) {
        return res.status(404).json({
          message: "One or more companies not found.",
        });
      }

      const existingCompanyIds = await prisma.companyPerson.findMany({
        where: {
          personId: id,
          companyId: { in: companyIds },
        },
        select: { companyId: true },
      });

      const existingCompanyIdSet = new Set(
        existingCompanyIds.map((c) => c.companyId),
      );
      const newCompanyIds = companyIds.filter(
        (cid) => !existingCompanyIdSet.has(cid),
      );

      if (newCompanyIds.length) {
        createData.companies = {
          create: newCompanyIds.map((companyId) => ({ companyId })),
        };
      }
    }

    if (Object.keys(createData).length === 0) {
      return res.status(400).json({
        message: "All associations already exist.",
      });
    }

    const person = await prisma.person.update({
      where: { id },
      data: createData,
      include: {
        practices: {
          include: { practice: true },
        },
        companies: {
          include: { company: true },
        },
      },
    });

    return res.status(200).json({
      message: "Associations added successfully.",
      person,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to add associations.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function removePersonPractice(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const practiceId = req.body.practiceId as string;

    if (!req.user?.sub) {
      return res.status(401).json({
        message: "Unauthorized.",
      });
    }

    if (!id || !practiceId) {
      return res.status(400).json({
        message: "Person id and practiceId are required.",
      });
    }

    const existingPerson = await prisma.person.findFirst({
      where: {
        id,
      },
    });

    if (!existingPerson) {
      return res.status(404).json({
        message: "Person not found.",
      });
    }

    const association = await prisma.practicePerson.findFirst({
      where: {
        personId: id,
        practiceId,
      },
    });

    if (!association) {
      return res.status(404).json({
        message: "Practice association not found.",
      });
    }

    await prisma.practicePerson.delete({
      where: { id: association.id },
    });

    const person = await prisma.person.findUnique({
      where: { id },
      include: {
        practices: {
          include: { practice: true },
        },
        companies: {
          include: { company: true },
        },
      },
    });

    return res.status(200).json({
      message: "Practice removed successfully.",
      person,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to remove practice.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function removePersonCompany(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const companyId = req.body.companyId as string;

    if (!req.user?.sub) {
      return res.status(401).json({
        message: "Unauthorized.",
      });
    }

    if (!id || !companyId) {
      return res.status(400).json({
        message: "Person id and companyId are required.",
      });
    }

    const existingPerson = await prisma.person.findFirst({
      where: {
        id,
      },
    });

    if (!existingPerson) {
      return res.status(404).json({
        message: "Person not found.",
      });
    }

    const association = await prisma.companyPerson.findFirst({
      where: {
        personId: id,
        companyId,
      },
    });

    if (!association) {
      return res.status(404).json({
        message: "Company association not found.",
      });
    }

    await prisma.companyPerson.delete({
      where: { id: association.id },
    });

    const person = await prisma.person.findUnique({
      where: { id },
      include: {
        practices: {
          include: { practice: true },
        },
        companies: {
          include: { company: true },
        },
      },
    });

    return res.status(200).json({
      message: "Company removed successfully.",
      person,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to remove company.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function syncPersonPractices(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const practiceIds = req.body.practiceIds as string[];

    if (!req.user?.sub) {
      return res.status(401).json({
        message: "Unauthorized.",
      });
    }

    if (!id) {
      return res.status(400).json({
        message: "Person id is required.",
      });
    }

    const existingPerson = await prisma.person.findFirst({
      where: {
        id,
      },
    });

    if (!existingPerson) {
      return res.status(404).json({
        message: "Person not found.",
      });
    }

    if (practiceIds?.length) {
      const validPractices = await prisma.practice.findMany({
        where: {
          id: { in: practiceIds },
          // ownerId: req.user.sub,
        },
      });

      if (validPractices.length !== practiceIds.length) {
        return res.status(404).json({
          message: "One or more practices not found.",
        });
      }
    }

    await prisma.practicePerson.deleteMany({
      where: { personId: id },
    });

    if (practiceIds?.length) {
      await prisma.practicePerson.createMany({
        data: practiceIds.map((practiceId) => ({
          personId: id,
          practiceId,
        })),
      });
    }

    const person = await prisma.person.findUnique({
      where: { id },
      include: {
        practices: {
          include: { practice: true },
        },
        companies: {
          include: { company: true },
        },
      },
    });

    return res.status(200).json({
      message: "Practices synced successfully.",
      person,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to sync practices.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function syncPersonCompanies(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const companyIds = req.body.companyIds as string[];

    if (!req.user?.sub) {
      return res.status(401).json({
        message: "Unauthorized.",
      });
    }

    if (!id) {
      return res.status(400).json({
        message: "Person id is required.",
      });
    }

    const existingPerson = await prisma.person.findFirst({
      where: {
        id,
      },
    });

    if (!existingPerson) {
      return res.status(404).json({
        message: "Person not found.",
      });
    }

    if (companyIds?.length) {
      const validCompanies = await prisma.company.findMany({
        where: {
          id: { in: companyIds },
          // ownerId: req.user.sub,
        },
      });

      if (validCompanies.length !== companyIds.length) {
        return res.status(404).json({
          message: "One or more companies not found.",
        });
      }
    }

    await prisma.companyPerson.deleteMany({
      where: { personId: id },
    });

    if (companyIds?.length) {
      await prisma.companyPerson.createMany({
        data: companyIds.map((companyId) => ({
          personId: id,
          companyId,
        })),
      });
    }

    const person = await prisma.person.findUnique({
      where: { id },
      include: {
        practices: {
          include: { practice: true },
        },
        companies: {
          include: { company: true },
        },
      },
    });

    return res.status(200).json({
      message: "Companies synced successfully.",
      person,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to sync companies.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
