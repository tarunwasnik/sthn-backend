//backend/src/routes/v1/profileVerification.routes.ts
import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware";
import { authorizeRoles } from "../../middlewares/authorize.middleware";
import {
  listPendingProfiles,
  listAdminReviewProfiles,
  getAdminProfileVerificationDetailController,
  getAdminProfileVerificationCaptureController,
  approveProfile,
  rejectProfile,
} from "../../controllers/profileVerification.controller";

const router = Router();

router.get(
  "/pending",
  protect,
  authorizeRoles("admin"),
  listPendingProfiles
);

router.get(
  "/admin-review",
  protect,
  authorizeRoles("admin"),
  listAdminReviewProfiles,
);

router.get("/:verificationReference", protect, authorizeRoles("admin"), getAdminProfileVerificationDetailController);
router.get("/:verificationReference/captures/:challengeIndex", protect, authorizeRoles("admin"), getAdminProfileVerificationCaptureController);

router.patch(
  "/:profileId/approve",
  protect,
  authorizeRoles("admin"),
  approveProfile
);

router.patch(
  "/:profileId/reject",
  protect,
  authorizeRoles("admin"),
  rejectProfile
);

export default router;
