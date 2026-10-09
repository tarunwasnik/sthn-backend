import { Router } from "express";

import { moderateTextContent } from "../../controllers/textModeration.controller";
import { protect } from "../../middlewares/auth.middleware";

const router = Router();

router.post("/", protect, moderateTextContent);

export default router;
