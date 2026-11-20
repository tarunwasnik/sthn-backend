import { Router } from "express";

import { getMyAccountPreferences, updateMyAccountPreferences } from "../../controllers/accountPreference.controller";
import { protect } from "../../middlewares/auth.middleware";

const router = Router();
router.get("/me", protect, getMyAccountPreferences);
router.patch("/me", protect, updateMyAccountPreferences);

export default router;
