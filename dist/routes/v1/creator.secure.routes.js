"use strict";
//backend/src/routes/v1/creator.secure.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const creator_middleware_1 = require("../../middlewares/creator.middleware");
const creatorService_controller_1 = require("../../controllers/creatorService.controller");
const creatorBookingDetails_controller_1 = require("../../controllers/creatorBookingDetails.controller");
const router = (0, express_1.Router)();
/**
 * Test creator-only access
 */
router.get("/me", auth_middleware_1.protect, creator_middleware_1.requireActiveCreator, (req, res) => {
    res.json({
        message: "Creator access granted",
        creatorProfile: req.creatorProfile,
    });
});
/* ================= SERVICES (CREATOR DASHBOARD) ================= */
/**
 * Create service
 */
router.post("/services", auth_middleware_1.protect, creator_middleware_1.requireActiveCreator, creatorService_controller_1.createCreatorService);
/**
 * List my services
 */
router.get("/services", auth_middleware_1.protect, creator_middleware_1.requireActiveCreator, creatorService_controller_1.getMyServices);
/**
 * Update service
 */
router.patch("/services/:serviceId", auth_middleware_1.protect, creator_middleware_1.requireActiveCreator, creatorService_controller_1.updateCreatorService);
/**
 * Soft delete service
 */
router.delete("/services/:serviceId", auth_middleware_1.protect, creator_middleware_1.requireActiveCreator, creatorService_controller_1.deleteCreatorService);
router.get("/bookings/:id", auth_middleware_1.protect, creatorBookingDetails_controller_1.getCreatorBookingDetails);
exports.default = router;
