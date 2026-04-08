//backend/src/routes/system.routes.ts
import { Router } from "express";
import { systemModeOnly } from "../middlewares/systemMode.middleware";
import { systemBootstrapController } from "../controllers/systemBootstrap.controller";

const router = Router();

/**
 * All SYSTEM dashboard routes:
 * - Authenticated
 * - Admin only
 * - SYSTEM mode enforced
 */
router.use(systemModeOnly);

/**
 * Bootstrap endpoint
 * GET /admin/system/bootstrap
 */
router.get("/bootstrap", systemBootstrapController);

export default router;
