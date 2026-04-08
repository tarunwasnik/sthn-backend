//backend/src/routes/v1/creatorApplication.routes.ts

import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware";
import { applyForCreator } from "../../controllers/creatorApplication.controller";

const router = Router();

router.post("/", protect, applyForCreator);

export default router;