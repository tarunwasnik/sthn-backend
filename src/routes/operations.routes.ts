//backend/src/routes/operations.routes.ts

import { Router } from "express";
import { operationsModeOnly } from "../middlewares/operationsMode.middleware";
import { operationsBootstrapController } from "../controllers/operationsBootstrap.controller";

const router = Router();

/**
 * All OPERATIONS dashboard routes:
 * - Authenticated
 * - Admin only
 * - OPERATIONS mode enforced
 */
router.use(operationsModeOnly);

/**
 * Bootstrap endpoint
 * GET /admin/operations/bootstrap
 */
router.get("/bootstrap", operationsBootstrapController);

export default router;
export {};