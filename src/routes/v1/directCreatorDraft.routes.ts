import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware";
import { getMyDirectCreatorDraft, saveMyDirectCreatorDraft } from "../../controllers/directCreatorDraft.controller";

const router = Router();
router.get("/me/draft", protect, getMyDirectCreatorDraft);
router.put("/me/draft", protect, saveMyDirectCreatorDraft);
export default router;
