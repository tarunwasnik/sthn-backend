//backend/src/routes/adminMode.routes.ts
import { Router } from "express";
import {
  getAdminModeController,
  setAdminModeController,
} from "../controllers/adminMode.controller";
import {protect} from "../middlewares/auth.middleware";

const router = Router();

/**
 * GET /admin/mode
 * Returns current admin mode
 */
router.get("/mode", protect, getAdminModeController);

/**
 * POST /admin/mode
 * Body: { mode: "SYSTEM" | "OPERATIONS" }
 */
router.post("/mode", protect, setAdminModeController);

export default router;
