//backend/src/routes/v1/creatorApplication.routes.ts

import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware";
import {
  getMyCreatorApplication,
} from "../../controllers/creatorApplication.controller";
import { getMyDirectCreatorDraft, saveMyDirectCreatorDraft } from "../../controllers/directCreatorDraft.controller";
import { beginCreatorVerificationSession, getCreatorVerificationSession, uploadCreatorVerificationCapture, submitCreatorVerification, getCreatorVerificationStatus } from "../../controllers/creatorVerification.controller";
import { faceVerificationCaptureUpload } from "../../middlewares/upload.middleware";

const router = Router();

router.get("/me", protect, getMyCreatorApplication);

router.get("/me/upgrade-draft", protect, getMyDirectCreatorDraft);
router.put("/me/upgrade-draft", protect, saveMyDirectCreatorDraft);
router.post("/me/upgrade-face-verification/session", protect, beginCreatorVerificationSession);
router.get("/me/upgrade-face-verification/session/:sessionReference", protect, getCreatorVerificationSession);
router.post("/me/upgrade-face-verification/session/:sessionReference/captures/:challengeIndex", protect, faceVerificationCaptureUpload.single("file"), uploadCreatorVerificationCapture);
router.get("/me/upgrade-verification-status", protect, getCreatorVerificationStatus);
router.post("/", protect, submitCreatorVerification);

export default router;
