"use strict";
// backend/src/routes/v1/admin.routes.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const authorize_middleware_1 = require("../../middlewares/authorize.middleware");
const admin_controller_1 = require("../../controllers/admin.controller");
const adminCreatorApproval_controller_1 = require("../../controllers/adminCreatorApproval.controller");
const admin_actions_routes_1 = __importDefault(require("./admin.actions.routes"));
const featureFlagTelemetry_routes_1 = __importDefault(require("./featureFlagTelemetry.routes"));
const featureFlagDashboard_routes_1 = __importDefault(require("./featureFlagDashboard.routes"));
const router = (0, express_1.Router)();
/* ================= ADMIN ACTIONS NAMESPACE ================= */
router.use("/actions", admin_actions_routes_1.default);
/* ================= ADMIN DASHBOARD ================= */
router.get("/dashboard", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), (_req, res) => {
    res.json({ message: "Welcome Admin" });
});
/* ================= USER MANAGEMENT ================= */
router.patch("/users/:id/suspend", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), admin_controller_1.suspendUser);
router.patch("/users/:id/activate", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), admin_controller_1.activateUser);
router.patch("/users/:id/ban", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), admin_controller_1.banUser);
/* ================= CREATOR PROFILE LIFECYCLE ================= */
router.post("/creator/:creatorProfileId/approve", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), admin_controller_1.approveCreator);
router.post("/creator/:creatorProfileId/reject", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), admin_controller_1.rejectCreator);
/* ================= CREATOR APPLICATION GOVERNANCE ================= */
/**
 * GET /api/v1/admin/creator-applications?status=submitted
 */
router.get("/creator-applications", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), adminCreatorApproval_controller_1.listCreatorApplications);
/**
 * PATCH /api/v1/admin/creator-applications/:applicationId/approve
 */
router.patch("/creator-applications/:applicationId/approve", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), adminCreatorApproval_controller_1.approveCreatorApplication);
/**
 * PATCH /api/v1/admin/creator-applications/:applicationId/reject
 */
router.patch("/creator-applications/:applicationId/reject", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), adminCreatorApproval_controller_1.rejectCreatorApplication);
/**
 * DELETE /api/v1/admin/creator-applications/:applicationId
 */
router.delete("/creator-applications/:applicationId", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), adminCreatorApproval_controller_1.deleteCreatorApplication);
/* ================= TRUST / ABUSE ================= */
router.patch("/users/:id/reset-trust", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), admin_controller_1.resetUserTrust);
/* ================= BOOKING OVERRIDES ================= */
router.patch("/bookings/:bookingId/cancel", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), admin_controller_1.adminCancelBooking);
/* ================= DISPUTE RESOLUTION ================= */
router.patch("/disputes/:disputeId/resolve", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), admin_controller_1.resolveDispute);
/* ================= DISPUTE ESCALATIONS ================= */
router.get("/disputes/escalated", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), admin_controller_1.getEscalatedDisputes);
/* ================= APPEALS ================= */
router.post("/appeals/:appealId/decide", auth_middleware_1.protect, (0, authorize_middleware_1.authorizeRoles)("admin"), admin_controller_1.decideAppeal);
/* ================= FEATURE FLAG TELEMETRY ================= */
router.use("/feature-flag-events", featureFlagTelemetry_routes_1.default);
/* ================= SYSTEM DASHBOARD ================= */
router.use("/system/feature-flags", featureFlagDashboard_routes_1.default);
exports.default = router;
