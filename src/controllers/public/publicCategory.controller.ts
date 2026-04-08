//backend/src/controllers/public/publicCategory.controller.ts
import { Request, Response } from "express";
import { getPublicCategoriesData } from "../../services/public/publicCategory.service";

/**
 * GET /public/categories
 * Public categories for Explore page
 */
export const getPublicCategories = async (
  req: Request,
  res: Response
) => {
  try {
    const data = await getPublicCategoriesData();

    res.setHeader("Cache-Control", "public, max-age=300");
    return res.status(200).json(data);
  } catch {
    return res.status(500).json({
      message: "Failed to load public categories",
    });
  }
};