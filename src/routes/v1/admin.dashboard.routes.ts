//backend/src/routes/v1/admin.dashboard.routes.ts


import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware";
import { authorizeRoles } from "../../middlewares/authorize.middleware";

import { getOverviewStats } from "../../controllers/adminDashboard/adminStats.controller";
import { getAllBookings,getBookingTrends,getBookingStatusBreakdown } from "../../controllers/adminDashboard/adminBookings.controller";
import { getAllUsers } from "../../controllers/adminDashboard/adminUsers.controller";
import { getAllCreators,getCreatorPerformance } from "../../controllers/adminDashboard/adminCreators.controller";
import { getAllPayments } from "../../controllers/adminDashboard/adminPayments.controller";
import { getAdminOverview } from "../../controllers/adminDashboard/adminOverview.controller";
import { getHighRiskCreators } from "../../controllers/adminDashboard/adminRisk.controller";

const router = Router();

/**
 * Admin Dashboard routes
 * READ-ONLY visibility endpoints
 */

// 1️⃣ JWT authentication
router.use(protect);

// 2️⃣ Admin-only access
router.use(authorizeRoles("admin"));

/* ===== Dashboard ===== */
router.get("/stats", getOverviewStats);
router.get("/bookings", getAllBookings);
router.get("/users", getAllUsers);
router.get("/creators", getAllCreators);
router.get("/payments", getAllPayments);
router.get("/bookings/trends", getBookingTrends);
router.get("/bookings/status-breakdown", getBookingStatusBreakdown);
router.get("/creators/performance", getCreatorPerformance);
import { getRiskSummary } from "../../controllers/adminDashboard/adminRiskSummary.controller";

/**
 * Dashboard overview KPIs
 */
router.get("/overview", getAdminOverview);

/**
 * High-risk creators (admin risk visibility)
 */
router.get("/creators/high-risk", getHighRiskCreators);

/**
 * Risk summary (alert counts)
 */
router.get("/creators/risk-summary", getRiskSummary);

export default router;