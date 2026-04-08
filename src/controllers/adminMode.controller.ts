


//backen/src/controllers/adminMode.controller.ts

import { Request, Response } from "express";
import { getAdminMode, setAdminMode } from "../services/adminMode.service";
import { AdminMode } from "../types/adminMode.types";

/**
 * GET /admin/mode
 * Returns current admin mode (SYSTEM | OPERATIONS | null)
 */
export const getAdminModeController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const mode = await getAdminMode(user.id);

    return res.status(200).json({
      mode,
    });
  } catch (err: any) {
    return res.status(403).json({
      message: err.message || "Failed to fetch admin mode",
    });
  }
};

/**
 * POST /admin/mode
 * Body: { mode: "SYSTEM" | "OPERATIONS" }
 */
export const setAdminModeController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user;
    const { mode } = req.body as { mode: AdminMode };

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!mode) {
      return res.status(400).json({ message: "Mode is required" });
    }

    const savedMode = await setAdminMode(user.id, mode);

    return res.status(200).json({
      mode: savedMode,
      redirectTo:
        savedMode === "SYSTEM" ? "/admin/system" : "/admin/operations",
    });
  } catch (err: any) {
    return res.status(403).json({
      message: err.message || "Failed to set admin mode",
    });
  }
};
export{};