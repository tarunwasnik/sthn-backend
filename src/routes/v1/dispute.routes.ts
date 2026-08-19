//backend/src/routes/v1/dispute.routes.ts

import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware";
import {
  openDispute,
  getMyDisputes,
  getBookingDisputeState,
} from "../../controllers/dispute.controller";
import { createParticipantSubmission, getParticipantInvestigation } from "../../controllers/disputeInvestigation.controller";
import { chatDocumentUpload, chatImageUpload } from "../../middlewares/upload.middleware";
import { uploadParticipantDocument, uploadParticipantImage } from "../../controllers/disputeDirectEvidence.controller";

const router = Router();

/**
 * Open a dispute
 * Body: { bookingId, reason }
 */
router.post(
  "/open",
  protect,
  openDispute
);

router.get(
  "/booking/:bookingId",
  protect,
  getBookingDisputeState
);

router.post("/:disputeId/submissions", protect, createParticipantSubmission);
router.get("/:disputeId/investigation", protect, getParticipantInvestigation);
router.post("/:disputeId/evidence/images", protect, chatImageUpload.single("file"), uploadParticipantImage);
router.post("/:disputeId/evidence/documents", protect, chatDocumentUpload.single("file"), uploadParticipantDocument);

/**
 * Get my disputes (user or creator)
 */
router.get(
  "/my",
  protect,
  getMyDisputes
);

export default router;
