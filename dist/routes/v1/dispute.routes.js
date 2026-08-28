"use strict";
//backend/src/routes/v1/dispute.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const dispute_controller_1 = require("../../controllers/dispute.controller");
const disputeInvestigation_controller_1 = require("../../controllers/disputeInvestigation.controller");
const upload_middleware_1 = require("../../middlewares/upload.middleware");
const disputeDirectEvidence_controller_1 = require("../../controllers/disputeDirectEvidence.controller");
const router = (0, express_1.Router)();
/**
 * Open a dispute
 * Body: { bookingId, reason }
 */
router.post("/open", auth_middleware_1.protect, dispute_controller_1.openDispute);
router.get("/booking/:bookingId", auth_middleware_1.protect, dispute_controller_1.getBookingDisputeState);
router.post("/:disputeId/submissions", auth_middleware_1.protect, disputeInvestigation_controller_1.createParticipantSubmission);
router.get("/:disputeId/investigation", auth_middleware_1.protect, disputeInvestigation_controller_1.getParticipantInvestigation);
router.post("/:disputeId/evidence/images", auth_middleware_1.protect, upload_middleware_1.chatImageUpload.single("file"), disputeDirectEvidence_controller_1.uploadParticipantImage);
router.post("/:disputeId/evidence/documents", auth_middleware_1.protect, upload_middleware_1.chatDocumentUpload.single("file"), disputeDirectEvidence_controller_1.uploadParticipantDocument);
/**
 * Get my disputes (user or creator)
 */
router.get("/my", auth_middleware_1.protect, dispute_controller_1.getMyDisputes);
exports.default = router;
