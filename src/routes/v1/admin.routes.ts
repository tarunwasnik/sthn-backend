// backend/src/routes/v1/admin.routes.ts

import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware";
import { authorizeRoles } from "../../middlewares/authorize.middleware";

import {
  suspendUser,
  activateUser,
  banUser,
  approveCreator,
  rejectCreator,
  resetUserTrust,
  adminCancelBooking,
  resolveDispute,
  getEscalatedDisputes,
  decideAppeal,
  getAuditLogs,
} from "../../controllers/admin.controller";

import {
  listCreatorApplications,
  approveCreatorApplication,
  rejectCreatorApplication,
  deleteCreatorApplication,
} from "../../controllers/adminCreatorApproval.controller";

import adminActionsRoutes from "./admin.actions.routes";
import featureFlagTelemetryRoutes from "./featureFlagTelemetry.routes";
import featureFlagDashboardRoutes from "./featureFlagDashboard.routes";

import { simulatePayoutStatus } from "../../controllers/admin/providerSimulator.controller";
import { applyPayoutDestinationVerificationDecision } from "../../controllers/admin/payoutDestinationVerification.controller";
import {
  suspendUserThroughAdminAction,
  activateUserThroughAdminAction,
  banUserThroughAdminAction,
  resetUserTrustThroughAdminAction,
} from "../../controllers/adminActions/governanceCompatibility.controller";
import { getAdminGovernanceTargetController } from "../../controllers/adminGovernanceRead.controller";
import { addAdminDisputeFinding, createAdminDisputeRequest, finalizeAdminDispute, getAdminDispute, getAdminDisputeInvestigation, listAdminDisputes, setAdminDisputeInputAccess, shareAdminDisputeSubmission } from "../../controllers/adminDispute.controller";
import { chatDocumentUpload, chatImageUpload } from "../../middlewares/upload.middleware";
import { uploadAdminDocument, uploadAdminImage } from "../../controllers/disputeDirectEvidence.controller";

const router = Router();

/* ================= ADMIN ACTIONS NAMESPACE ================= */

router.use("/actions", adminActionsRoutes);

/* ================= ADMIN DASHBOARD ================= */

router.get(
  "/dashboard",
  protect,
  authorizeRoles("admin"),
  (_req, res) => {
    res.json({ message: "Welcome Admin" });
  }
);

/* ================= PROVIDER SIMULATOR ================= */

router.post(
  "/provider-simulator/payouts/:providerPayoutId/status",
  protect,
  authorizeRoles("admin"),
  simulatePayoutStatus,
);

router.get("/audit-logs", protect, authorizeRoles("admin"), getAuditLogs);
router.get("/governance/targets/:userId", protect, authorizeRoles("admin"), getAdminGovernanceTargetController);

/* ================= PAYOUT DESTINATION VERIFICATION ================= */

router.post(
  "/payout-destinations/:destinationReference/verification",
  protect,
  authorizeRoles("admin"),
  applyPayoutDestinationVerificationDecision,
);

/* ================= USER MANAGEMENT ================= */

router.patch(
  "/users/:id/suspend",
  protect,
  authorizeRoles("admin"),
  suspendUserThroughAdminAction
);

router.patch(
  "/users/:id/activate",
  protect,
  authorizeRoles("admin"),
  activateUserThroughAdminAction
);

router.patch(
  "/users/:id/ban",
  protect,
  authorizeRoles("admin"),
  banUserThroughAdminAction
);

/* ================= CREATOR PROFILE LIFECYCLE ================= */

router.post(
  "/creator/:creatorProfileId/approve",
  protect,
  authorizeRoles("admin"),
  approveCreator
);

router.post(
  "/creator/:creatorProfileId/reject",
  protect,
  authorizeRoles("admin"),
  rejectCreator
);

/* ================= CREATOR APPLICATION GOVERNANCE ================= */

/**
 * GET /api/v1/admin/creator-applications?status=submitted
 */
router.get(
  "/creator-applications",
  protect,
  authorizeRoles("admin"),
  listCreatorApplications
);

/**
 * PATCH /api/v1/admin/creator-applications/:applicationId/approve
 */
router.patch(
  "/creator-applications/:applicationId/approve",
  protect,
  authorizeRoles("admin"),
  approveCreatorApplication
);

/**
 * PATCH /api/v1/admin/creator-applications/:applicationId/reject
 */
router.patch(
  "/creator-applications/:applicationId/reject",
  protect,
  authorizeRoles("admin"),
  rejectCreatorApplication
);

/**
 * DELETE /api/v1/admin/creator-applications/:applicationId
 */
router.delete(
  "/creator-applications/:applicationId",
  protect,
  authorizeRoles("admin"),
  deleteCreatorApplication
);

/* ================= TRUST / ABUSE ================= */

router.patch(
  "/users/:id/reset-trust",
  protect,
  authorizeRoles("admin"),
  resetUserTrustThroughAdminAction
);

/* ================= BOOKING OVERRIDES ================= */

router.patch(
  "/bookings/:bookingId/cancel",
  protect,
  authorizeRoles("admin"),
  adminCancelBooking
);

/* ================= DISPUTE RESOLUTION ================= */

router.get("/disputes", protect, authorizeRoles("admin"), listAdminDisputes);

router.patch("/disputes/:disputeId/input-access", protect, authorizeRoles("admin"), setAdminDisputeInputAccess);
router.post("/disputes/:disputeId/findings", protect, authorizeRoles("admin"), addAdminDisputeFinding);
router.post("/disputes/:disputeId/finalize", protect, authorizeRoles("admin"), finalizeAdminDispute);
router.post("/disputes/:disputeId/requests", protect, authorizeRoles("admin"), createAdminDisputeRequest);
router.post("/disputes/:disputeId/share", protect, authorizeRoles("admin"), shareAdminDisputeSubmission);
router.get("/disputes/:disputeId/investigation", protect, authorizeRoles("admin"), getAdminDisputeInvestigation);
router.post("/disputes/:disputeId/evidence/images", protect, authorizeRoles("admin"), chatImageUpload.single("file"), uploadAdminImage);
router.post("/disputes/:disputeId/evidence/documents", protect, authorizeRoles("admin"), chatDocumentUpload.single("file"), uploadAdminDocument);

router.patch(
  "/disputes/:disputeId/resolve",
  protect,
  authorizeRoles("admin"),
  resolveDispute
);

/* ================= DISPUTE ESCALATIONS ================= */

router.get(
  "/disputes/escalated",
  protect,
  authorizeRoles("admin"),
  getEscalatedDisputes
);

router.get("/disputes/:disputeId", protect, authorizeRoles("admin"), getAdminDispute);

/* ================= APPEALS ================= */

router.post(
  "/appeals/:appealId/decide",
  protect,
  authorizeRoles("admin"),
  decideAppeal
);

/* ================= FEATURE FLAG TELEMETRY ================= */

router.use(
  "/feature-flag-events",
  featureFlagTelemetryRoutes
);

/* ================= SYSTEM DASHBOARD ================= */

router.use(
  "/system/feature-flags",
  featureFlagDashboardRoutes
);

export default router;
