//backend/src/controlllers/systemBootstrap.controller.ts
import { Request, Response } from "express";

/**
 * GET /admin/system/bootstrap
 * Confirms SYSTEM dashboard access
 */
export const systemBootstrapController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    return res.status(200).json({
      systemReady: true,
      version: "v1",
      permissions: [],
    });
  } catch (err: any) {
    return res.status(500).json({
      message: err.message || "System bootstrap failed",
    });
  }
};
