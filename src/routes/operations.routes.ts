//backend/src/routes/operations.routes.ts

import { Router } from "express";
import { protect } from "../middlewares/auth.middleware";
import { authorizeRoles } from "../middlewares/authorize.middleware";
import { operationsModeOnly } from "../middlewares/operationsMode.middleware";
import { operationsBootstrapController } from "../controllers/operationsBootstrap.controller";

const router = Router();

/* Authentication */
router.use(protect);

/* Admin only */
router.use(authorizeRoles("admin"));

/* Operations mode */
router.use(operationsModeOnly);

/* Bootstrap */
router.get("/bootstrap", operationsBootstrapController);

export default router;
