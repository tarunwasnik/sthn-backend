//backend/src/controllers/operationsBootstrap.controller.ts

import { Request, Response } from "express";

/**
 * GET /admin/operations/bootstrap
 * Confirms OPERATIONS dashboard access
 */
export const operationsBootstrapController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    return res.status(200).json({
      operationsReady: true,
      version: "v1",
      capabilities: [],
    });
  } catch (err: any) {
    return res.status(500).json({
      message: err.message || "Operations bootstrap failed",
    });
  }
};
export {};