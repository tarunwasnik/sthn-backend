import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware";
import { faceVerificationCaptureUpload } from "../../middlewares/upload.middleware";
import { beginCreatorVerificationSession, getCreatorVerificationSession, getCreatorVerificationStatus, submitCreatorVerification, uploadCreatorVerificationCapture } from "../../controllers/creatorVerification.controller";

const router = Router();
router.post("/me/face-verification/session", protect, beginCreatorVerificationSession);
router.get("/me/face-verification/session/:sessionReference", protect, getCreatorVerificationSession);
router.post("/me/face-verification/session/:sessionReference/captures/:challengeIndex", protect, faceVerificationCaptureUpload.single("file"), uploadCreatorVerificationCapture);
router.post("/me/verification-submission", protect, submitCreatorVerification);
router.get("/me/verification-status", protect, getCreatorVerificationStatus);
export default router;
