import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware";
import { imageModerationUpload } from "../../middlewares/upload.middleware";
import { releaseTemporaryImageModerationAsset, submitImageModeration } from "../../controllers/imageModeration.controller";
const router = Router();
router.post("/admissions", protect, imageModerationUpload.single("file"), submitImageModeration);
router.post("/temporary-assets/:assetReference/release", protect, releaseTemporaryImageModerationAsset);
export default router;
