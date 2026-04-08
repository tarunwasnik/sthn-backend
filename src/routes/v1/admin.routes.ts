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

/* ================= USER MANAGEMENT ================= */

router.patch(
  "/users/:id/suspend",
  protect,
  authorizeRoles("admin"),
  suspendUser
);

router.patch(
  "/users/:id/activate",
  protect,
  authorizeRoles("admin"),
  activateUser
);

router.patch(
  "/users/:id/ban",
  protect,
  authorizeRoles("admin"),
  banUser
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
  resetUserTrust
);

/* ================= BOOKING OVERRIDES ================= */

router.patch(
  "/bookings/:bookingId/cancel",
  protect,
  authorizeRoles("admin"),
  adminCancelBooking
);

/* ================= DISPUTE RESOLUTION ================= */

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