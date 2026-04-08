//backend/src/middlewares/operationsMode.middleware.ts

import { Request, Response, NextFunction } from "express";
import { getAdminMode } from "../services/adminMode.service";

/**
 * Enforces OPERATIONS admin mode
 * Used for all /admin/operations routes
 */
export const operationsModeOnly = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Phase 31 truth
    if (user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const mode = await getAdminMode(user.id);

    if (mode !== "OPERATIONS") {
      return res.status(403).json({
        message: "OPERATIONS mode required",
        redirectTo: "/admin/entry",
      });
    }

    next();
  } catch (err: any) {
    return res.status(403).json({
      message: err.message || "OPERATIONS mode enforcement failed",
    });
  }
};
