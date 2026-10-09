import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware";
import { imageModerationUpload } from "../../middlewares/upload.middleware";
import { submitImageModeration } from "../../controllers/imageModeration.controller";
const router = Router();
router.post("/admissions", protect, imageModerationUpload.single("file"), submitImageModeration);
export default router;
