import { PersonRole, InfluenceLevel } from "../../../generated/prisma/client";
import { Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

type PersonBody = {
  practiceId?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
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

    const { search, role, influence, practiceId } = req.query;

    const where: any = {
      practice: {
        ownerId: req.user.sub,
      },
    };

    if (search) {
      where.OR = [
        { firstName: { contains: search as string, mode: "insensitive" } },
        { lastName: { contains: search as string, mode: "insensitive" } },
        { email: { contains: search as string, mode: "insensitive" } },
      ];
    }

    if (role) {
      where.role = role as PersonRole;
    }

    if (influence) {
      where.influence = influence as InfluenceLevel;
    }

    if (practiceId) {
      where.practiceId = practiceId as string;
    }

    const [persons, totalRecords] = await Promise.all([
      prisma.person.findMany({
        where,
        include: {
          practice: true,
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
    const { practiceId, firstName, lastName, role, influence, email, phone } =
      req.body as PersonBody;

    if (!req.user?.sub) {
      return res.status(401).json({
        message: "Unauthorized.",
      });
    }

    if (!practiceId || !firstName || !lastName || !role || !influence) {
      return res.status(400).json({
        message:
          "practiceId, firstName, lastName, role and influence are required.",
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

    const practice = await prisma.practice.findFirst({
      where: {
        id: practiceId,
        ownerId: req.user.sub,
      },
    });

    if (!practice) {
      return res.status(404).json({
        message: "Practice not found.",
      });
    }

    const person = await prisma.person.create({
      data: {
        practiceId,
        firstName,
        lastName,
        role,
        influence,
        email,
        phone,
      },
    });

    return res.status(201).json({
      message: "Person created successfully.",
      person,
    });
  } catch (error) {
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
        practice: {
          ownerId: req.user.sub,
        },
      },
      include: {
        practice: true,
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
    const { firstName, lastName, role, influence, email, phone } =
      req.body as PersonBody;

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
        practice: {
          ownerId: req.user.sub,
        },
      },
    });

    if (!existingPerson) {
      return res.status(404).json({
        message: "Person not found.",
      });
    }

    const updateData: {
      firstName?: string;
      lastName?: string;
      role?: PersonRole;
      influence?: InfluenceLevel;
      email?: string | null;
      phone?: string | null;
    } = {};

    if (firstName !== undefined) {
      updateData.firstName = firstName;
    }

    if (lastName !== undefined) {
      updateData.lastName = lastName;
    }

    if (role !== undefined) {
      updateData.role = role as PersonRole;
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

    const person = await prisma.person.update({
      where: {
        id,
      },
      data: updateData,
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
        practice: {
          ownerId: req.user.sub,
        },
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
