import { ContactRole, InfluenceLevel } from "../../../generated/prisma/client";
import { Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

type ContactBody = {
  practiceId?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  influence?: string;
  email?: string;
  phone?: string;
};

function isContactRole(role: string): role is ContactRole {
  return Object.values(ContactRole).includes(role as ContactRole);
}

function isInfluenceLevel(influence: string): influence is InfluenceLevel {
  return Object.values(InfluenceLevel).includes(influence as InfluenceLevel);
}

export async function createContact(req: AuthenticatedRequest, res: Response) {
  try {
    const { practiceId, firstName, lastName, role, influence, email, phone } =
      req.body as ContactBody;

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

    if (!isContactRole(role)) {
      return res.status(400).json({
        message: "Invalid contact role.",
        allowedRoles: Object.values(ContactRole),
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

    const contact = await prisma.contact.create({
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
      message: "Contact created successfully.",
      contact,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to create contact.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getContact(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({
        message: "Unauthorized.",
      });
    }

    if (!id) {
      return res.status(400).json({
        message: "Contact id is required.",
      });
    }

    const contact = await prisma.contact.findFirst({
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

    if (!contact) {
      return res.status(404).json({
        message: "Contact not found.",
      });
    }

    return res.status(200).json({
      message: "Contact fetched successfully.",
      contact,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch contact.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updateContact(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { firstName, lastName, role, influence, email, phone } =
      req.body as ContactBody;

    if (!req.user?.sub) {
      return res.status(401).json({
        message: "Unauthorized.",
      });
    }

    if (!id) {
      return res.status(400).json({
        message: "Contact id is required.",
      });
    }

    if (role && !isContactRole(role)) {
      return res.status(400).json({
        message: "Invalid contact role.",
        allowedRoles: Object.values(ContactRole),
      });
    }

    if (influence && !isInfluenceLevel(influence)) {
      return res.status(400).json({
        message: "Invalid influence level.",
        allowedInfluenceLevels: Object.values(InfluenceLevel),
      });
    }

    const existingContact = await prisma.contact.findFirst({
      where: {
        id,
        practice: {
          ownerId: req.user.sub,
        },
      },
    });

    if (!existingContact) {
      return res.status(404).json({
        message: "Contact not found.",
      });
    }

    const updateData: {
      firstName?: string;
      lastName?: string;
      role?: ContactRole;
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
      updateData.role = role as ContactRole;
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

    const contact = await prisma.contact.update({
      where: {
        id,
      },
      data: updateData,
    });

    return res.status(200).json({
      message: "Contact updated successfully.",
      contact,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to update contact.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
