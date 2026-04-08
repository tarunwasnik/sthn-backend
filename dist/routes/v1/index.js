"use strict";
//backend/src/routes/v1/index.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const admin_routes_1 = __importDefault(require("./admin.routes"));
const user_routes_1 = __importDefault(require("./user.routes"));
const profile_routes_1 = __importDefault(require("../profile.routes"));
const profileVerification_routes_1 = __importDefault(require("./profileVerification.routes"));
const creatorApplication_routes_1 = __importDefault(require("./creatorApplication.routes"));
const creator_dashboard_routes_1 = __importDefault(require("./creator.dashboard.routes"));
const creator_secure_routes_1 = __importDefault(require("./creator.secure.routes"));
const creator_availability_routes_1 = __importDefault(require("./creator.availability.routes"));
const creatorBookingDecision_routes_1 = __importDefault(require("./creatorBookingDecision.routes"));
const creatorCancelBooking_routes_1 = __importDefault(require("./creatorCancelBooking.routes"));
const booking_routes_1 = __importDefault(require("./booking.routes"));
const userCancelBooking_routes_1 = __importDefault(require("./userCancelBooking.routes"));
const dispute_routes_1 = __importDefault(require("./dispute.routes"));
const chat_routes_1 = __importDefault(require("./chat.routes"));
const admin_dashboard_routes_1 = __importDefault(require("./admin.dashboard.routes"));
const admin_actions_routes_1 = __importDefault(require("./admin.actions.routes"));
const controlPlane_featureFlags_routes_1 = __importDefault(require("./controlPlane.featureFlags.routes"));
const router = (0, express_1.Router)();
/* ================= ADMIN ================= */
router.use("/admin/profile-verification", profileVerification_routes_1.default);
router.use("/admin/actions", admin_actions_routes_1.default);
router.use("/admin/dashboard", admin_dashboard_routes_1.default);
router.use("/admin", admin_routes_1.default);
/* ================= USERS ================= */
router.use("/users", user_routes_1.default);
router.use("/profile", profile_routes_1.default);
/* ================= BOOKINGS ================= */
router.use("/bookings", booking_routes_1.default);
router.use("/bookings", userCancelBooking_routes_1.default);
router.use("/bookings/creator", creatorCancelBooking_routes_1.default); // ✅ IMPORTANT
/* ================= DISPUTES ================= */
router.use("/disputes", dispute_routes_1.default);
/* ================= CREATORS ================= */
router.use("/creator-applications", creatorApplication_routes_1.default);
router.use("/creator", creator_secure_routes_1.default);
router.use("/creator", creator_dashboard_routes_1.default);
router.use("/creator", creator_availability_routes_1.default);
router.use("/creator", creatorBookingDecision_routes_1.default);
/* ================= CHAT ================= */
router.use("/chat", chat_routes_1.default);
router.use("/control-plane/feature-flags", controlPlane_featureFlags_routes_1.default);
exports.default = router;
