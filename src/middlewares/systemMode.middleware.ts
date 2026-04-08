//backend/src/middlewares/systemMode.middleware.ts
import { Request, Response, NextFunction } from "express";
import { getAdminMode } from "../services/adminMode.service";

/**
 * Enforces SYSTEM admin mode
 * Used for all /admin/system routes
 */
export const systemModeOnly = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Role check (Phase 31 truth)
    if (user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const mode = await getAdminMode(user.id);

    if (mode !== "SYSTEM") {
      return res.status(403).json({
        message: "SYSTEM mode required",
        redirectTo: "/admin/entry",
      });
    }

    next();
  } catch (err: any) {
    return res.status(403).json({
      message: err.message || "SYSTEM mode enforcement failed",
    });
  }
};
export{};