import { Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

type PracticeGroupBody = {
  name: string;
  companyId: string;
  parentId?: string;
};

export async function createPracticeGroup(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const { name, companyId, parentId } = req.body as PracticeGroupBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!name) {
      return res
        .status(400)
        .json({ message: "Name and Company ID are required." });
    }

    // Verify company exists
    const company = await prisma.company.findFirst({
      where: { id: companyId },
    });

    if (!company) {
      return res
        .status(404)
        .json({ message: "Company not found." });
    }

    // If parentId is provided, verify it belongs to the same company
    if (parentId) {
      const parentGroup = await prisma.practiceGroup.findFirst({
        where: { id: parentId, companyId },
      });
      if (!parentGroup) {
        return res
          .status(400)
          .json({ message: "Invalid parent group for this company." });
      }
    }

    const practiceGroup = await prisma.practiceGroup.create({
      data: {
        name,
        companyId,
        parentId,
      },
    });

    return res.status(201).json({
      message: "Practice Group created successfully.",
      practiceGroup,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to create practice group.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getPracticeGroups(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const { companyId } = req.query;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!companyId) {
      return res.status(400).json({ message: "Company ID is required." });
    }

    // Verify company exists
    const company = await prisma.company.findFirst({
      where: { id: companyId as string },
    });

    if (!company) {
      return res
        .status(404)
        .json({ message: "Company not found." });
    }

    const practiceGroups = await prisma.practiceGroup.findMany({
      where: { companyId: companyId as string },
      include: {
        _count: {
          select: { practices: true, children: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      message: "Practice groups fetched successfully.",
      practiceGroups,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch practice groups.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getPracticeGroup(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res
        .status(400)
        .json({ message: "Practice group id is required." });
    }

    const practiceGroup = await prisma.practiceGroup.findUnique({
      where: { id },
      include: {
        company: true,
        practices: true,
        children: true,
        parent: true,
      },
    });

    if (!practiceGroup) {
      return res
        .status(404)
        .json({ message: "Practice group not found." });
    }

    return res.status(200).json({
      message: "Practice group fetched successfully.",
      practiceGroup,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch practice group.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updatePracticeGroup(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { name, parentId } = req.body as Partial<PracticeGroupBody>;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res
        .status(400)
        .json({ message: "Practice group id is required." });
    }

    const existingGroup = await prisma.practiceGroup.findUnique({
      where: { id },
      include: { company: true },
    });

    if (!existingGroup) {
      return res
        .status(404)
        .json({ message: "Practice group not found." });
    }

    // Prevent circular reference if parentId is changed
    if (parentId) {
      if (parentId === id) {
        return res
          .status(400)
          .json({ message: "Group cannot be its own parent." });
      }
      const parentGroup = await prisma.practiceGroup.findFirst({
        where: { id: parentId, companyId: existingGroup.companyId },
      });
      if (!parentGroup) {
        return res
          .status(400)
          .json({ message: "Invalid parent group for this company." });
      }
    }

    const practiceGroup = await prisma.practiceGroup.update({
      where: { id },
      data: {
        name,
        parentId,
      },
    });

    return res.status(200).json({
      message: "Practice group updated successfully.",
      practiceGroup,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to update practice group.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function deletePracticeGroup(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res
        .status(400)
        .json({ message: "Practice group id is required." });
    }

    const existingGroup = await prisma.practiceGroup.findUnique({
      where: { id },
      include: { company: true },
    });

    if (!existingGroup) {
      return res
        .status(404)
        .json({ message: "Practice group not found." });
    }

    await prisma.practiceGroup.delete({
      where: { id },
    });

    return res.status(200).json({
      message: "Practice group deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete practice group.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
