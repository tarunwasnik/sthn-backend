//backend/src/controllers/public/publicHome.controller.ts

import { Request, Response } from "express";
import { getPublicHomeData } from "../../services/public/publicHome.service";

export const getPublicHome = async (
  req: Request,
  res: Response
) => {
  try {
    const data = await getPublicHomeData();

    // During development disable caching
    res.setHeader("Cache-Control", "no-store");

    return res.status(200).json(data);
  } catch (error) {
    console.error("Public Home Error:", error);
    return res.status(500).json({
      message: "Failed to load public home data",
    });
  }
};