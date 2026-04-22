//backend/src/routes/v1/index.ts

import { Router } from "express";

import adminRoutes from "./admin.routes";
import userRoutes from "./user.routes";
import profileRoutes from "../profile.routes";
import profileVerificationRoutes from "./profileVerification.routes";

import creatorApplicationRoutes from "./creatorApplication.routes";
import creatorProfileRoutes from "./creatorProfile.routes";
import creatorDashboardRoutes from "./creator.dashboard.routes";
import creatorSecureRoutes from "./creator.secure.routes";
import creatorAvailabilityRoutes from "./creator.availability.routes";
import creatorBookingDecisionRoutes from "./creatorBookingDecision.routes";
import creatorCancelBookingRoutes from "./creatorCancelBooking.routes";

import bookingRoutes from "./booking.routes";
import userCancelBookingRoutes from "./userCancelBooking.routes";
import disputeRoutes from "./dispute.routes";
import chatRoutes from "./chat.routes";

import adminDashboardRoutes from "./admin.dashboard.routes";
import adminActionsRoutes from "./admin.actions.routes";
import controlPlaneFeatureFlagsRoutes from "./controlPlane.featureFlags.routes";

const router = Router();

/* ================= ADMIN ================= */
router.use("/admin/profile-verification", profileVerificationRoutes);
router.use("/admin/actions", adminActionsRoutes);
router.use("/admin/dashboard", adminDashboardRoutes);
router.use("/admin", adminRoutes);

/* ================= USERS ================= */
router.use("/users", userRoutes);
router.use("/profile", profileRoutes);

/* ================= BOOKINGS ================= */
router.use("/bookings", bookingRoutes);
router.use("/bookings", userCancelBookingRoutes);
router.use("/bookings/creator", creatorCancelBookingRoutes); // ✅ IMPORTANT

/* ================= DISPUTES ================= */
router.use("/disputes", disputeRoutes);

/* ================= CREATORS ================= */
router.use("/creator-applications", creatorApplicationRoutes);
router.use("/creator", creatorProfileRoutes);
router.use("/creator", creatorSecureRoutes);
router.use("/creator", creatorDashboardRoutes);
router.use("/creator", creatorAvailabilityRoutes);
router.use("/creator", creatorBookingDecisionRoutes);

/* ================= CHAT ================= */
router.use("/chat", chatRoutes);

router.use(
  "/control-plane/feature-flags",
  controlPlaneFeatureFlagsRoutes
);

export default router;