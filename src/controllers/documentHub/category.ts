import { Response } from "express";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { routeParam } from "../../middleware/documentHubUpload";
import { prisma } from "../../lib/prisma";

function requireUser(req: AuthenticatedRequest, res: Response) {
  if (!req.user?.sub) {
    res.status(401).json({ message: "Unauthorized." });
    return null;
  }
  return req.user;
}

export async function listCategories(req: AuthenticatedRequest, res: Response) {
  try {
    if (!requireUser(req, res)) {
      return;
    }

    const categories = await prisma.hubDocumentCategory.findMany({
      include: {
        parentCategory: { select: { id: true, name: true } },
        _count: { select: { documentLinks: true, childCategories: true } },
      },
      orderBy: { name: "asc" },
    });

    return res.status(200).json({
      message: "Categories fetched successfully.",
      categories,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch categories.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function createCategory(req: AuthenticatedRequest, res: Response) {
  try {
    if (!requireUser(req, res)) {
      return;
    }

    const name = String(req.body?.name || "").trim();
    const parentCategoryId = req.body?.parentCategoryId
      ? String(req.body.parentCategoryId)
      : null;

    if (!name) {
      return res.status(400).json({ message: "name is required." });
    }

    const existing = await prisma.hubDocumentCategory.findUnique({ where: { name } });
    if (existing) {
      return res.status(409).json({ message: "A category with this name already exists." });
    }

    if (parentCategoryId) {
      const parent = await prisma.hubDocumentCategory.findUnique({
        where: { id: parentCategoryId },
      });
      if (!parent) {
        return res.status(400).json({ message: "Parent category not found." });
      }
    }

    const category = await prisma.hubDocumentCategory.create({
      data: { name, parentCategoryId },
    });

    return res.status(201).json({ message: "Category created successfully.", category });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to create category.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updateCategory(req: AuthenticatedRequest, res: Response) {
  try {
    if (!requireUser(req, res)) {
      return;
    }

    const id = routeParam(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Category id is required." });
    }

    const existing = await prisma.hubDocumentCategory.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Category not found." });
    }

    const name =
      req.body?.name !== undefined ? String(req.body.name).trim() : undefined;
    const parentCategoryId =
      req.body?.parentCategoryId === null
        ? null
        : req.body?.parentCategoryId
          ? String(req.body.parentCategoryId)
          : undefined;

    if (name) {
      const duplicate = await prisma.hubDocumentCategory.findFirst({
        where: { name, id: { not: id } },
      });
      if (duplicate) {
        return res.status(409).json({ message: "A category with this name already exists." });
      }
    }

    if (parentCategoryId === id) {
      return res.status(400).json({ message: "A category cannot be its own parent." });
    }

    const category = await prisma.hubDocumentCategory.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(parentCategoryId !== undefined ? { parentCategoryId } : {}),
      },
    });

    return res.status(200).json({ message: "Category updated successfully.", category });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to update category.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function deleteCategory(req: AuthenticatedRequest, res: Response) {
  try {
    if (!requireUser(req, res)) {
      return;
    }

    const id = routeParam(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Category id is required." });
    }

    const existing = await prisma.hubDocumentCategory.findUnique({
      where: { id },
      include: { _count: { select: { documentLinks: true, childCategories: true } } },
    });
    if (!existing) {
      return res.status(404).json({ message: "Category not found." });
    }

    if (existing._count.childCategories > 0) {
      return res.status(400).json({
        message: "Reassign or delete child categories before deleting this category.",
      });
    }

    const documentsWithOnlyThisCategory = await prisma.hubDocument.count({
      where: {
        categoryLinks: {
          some: { categoryId: id },
        },
        AND: {
          categoryLinks: {
            every: { categoryId: id },
          },
        },
      },
    });

    if (documentsWithOnlyThisCategory > 0) {
      return res.status(400).json({
        message:
          "Cannot delete a category that is the only category on one or more documents. Merge or reassign first.",
      });
    }

    await prisma.hubDocumentCategory.delete({ where: { id } });
    return res.status(200).json({ message: "Category deleted successfully." });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete category.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function mergeCategories(req: AuthenticatedRequest, res: Response) {
  try {
    if (!requireUser(req, res)) {
      return;
    }

    const id = routeParam(req.params.id);
    const targetCategoryId = String(req.body?.targetCategoryId || "").trim();
    if (!id || !targetCategoryId) {
      return res.status(400).json({
        message: "Category id and targetCategoryId are required.",
      });
    }
    if (id === targetCategoryId) {
      return res.status(400).json({ message: "Cannot merge a category into itself." });
    }

    const [source, target] = await Promise.all([
      prisma.hubDocumentCategory.findUnique({ where: { id } }),
      prisma.hubDocumentCategory.findUnique({ where: { id: targetCategoryId } }),
    ]);
    if (!source || !target) {
      return res.status(404).json({ message: "Category not found." });
    }

    const sourceLinks = await prisma.hubDocumentCategoryLink.findMany({
      where: { categoryId: id },
    });
    const targetLinks = await prisma.hubDocumentCategoryLink.findMany({
      where: { categoryId: targetCategoryId },
    });
    const targetDocumentIds = new Set(targetLinks.map((link) => link.documentId));

    const linksToMove = sourceLinks.filter(
      (link) => !targetDocumentIds.has(link.documentId),
    );
    if (linksToMove.length) {
      await prisma.hubDocumentCategoryLink.createMany({
        data: linksToMove.map((link) => ({
          documentId: link.documentId,
          categoryId: targetCategoryId,
        })),
      });
    }

    await prisma.hubDocumentCategory.updateMany({
      where: { parentCategoryId: id },
      data: { parentCategoryId: targetCategoryId },
    });
    await prisma.hubDocumentCategory.delete({ where: { id } });

    return res.status(200).json({
      message: "Category merged successfully.",
      targetCategory: target,
      movedLinks: linksToMove.length,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to merge categories.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
