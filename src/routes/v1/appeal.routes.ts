//backend/src/routes/v1/appeal.routes.ts


import { Router } from "express";
import { raiseAppeal } from "../../controllers/appeal.controller";
import { protect } from "../../middlewares/auth.middleware";

const router = Router();

/**
 * All appeal routes require authentication
 */
router.use(protect);

/**
 * Raise an appeal against a dispute
 * POST /api/appeals/:disputeId
 */
router.post("/:disputeId", raiseAppeal);

export default router;