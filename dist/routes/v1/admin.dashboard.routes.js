"use strict";
//backend/src/routes/v1/admin.dashboard.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const authorize_middleware_1 = require("../../middlewares/authorize.middleware");
const adminStats_controller_1 = require("../../controllers/adminDashboard/adminStats.controller");
const adminBookings_controller_1 = require("../../controllers/adminDashboard/adminBookings.controller");
const adminUsers_controller_1 = require("../../controllers/adminDashboard/adminUsers.controller");
const adminCreators_controller_1 = require("../../controllers/adminDashboard/adminCreators.controller");
const adminPayments_controller_1 = require("../../controllers/adminDashboard/adminPayments.controller");
const adminOverview_controller_1 = require("../../controllers/adminDashboard/adminOverview.controller");
const adminRisk_controller_1 = require("../../controllers/adminDashboard/adminRisk.controller");
const router = (0, express_1.Router)();
/**
 * Admin Dashboard routes
 * READ-ONLY visibility endpoints
 */
// 1️⃣ JWT authentication
router.use(auth_middleware_1.protect);
// 2️⃣ Admin-only access
router.use((0, authorize_middleware_1.authorizeRoles)("admin"));
/* ===== Dashboard ===== */
router.get("/stats", adminStats_controller_1.getOverviewStats);
router.get("/bookings", adminBookings_controller_1.getAllBookings);
router.get("/users", adminUsers_controller_1.getAllUsers);
router.get("/creators", adminCreators_controller_1.getAllCreators);
router.get("/payments", adminPayments_controller_1.getAllPayments);
router.get("/bookings/trends", adminBookings_controller_1.getBookingTrends);
router.get("/bookings/status-breakdown", adminBookings_controller_1.getBookingStatusBreakdown);
router.get("/creators/performance", adminCreators_controller_1.getCreatorPerformance);
const adminRiskSummary_controller_1 = require("../../controllers/adminDashboard/adminRiskSummary.controller");
/**
 * Dashboard overview KPIs
 */
router.get("/overview", adminOverview_controller_1.getAdminOverview);
/**
 * High-risk creators (admin risk visibility)
 */
router.get("/creators/high-risk", adminRisk_controller_1.getHighRiskCreators);
/**
 * Risk summary (alert counts)
 */
router.get("/creators/risk-summary", adminRiskSummary_controller_1.getRiskSummary);
exports.default = router;
