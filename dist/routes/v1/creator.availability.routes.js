"use strict";
//backend/src/routes/v1/creator.availability.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const creator_middleware_1 = require("../../middlewares/creator.middleware");
const creatorAvailability_controller_1 = require("../../controllers/creatorAvailability.controller");
const router = (0, express_1.Router)();
router.post("/availability", auth_middleware_1.protect, creator_middleware_1.requireActiveCreator, creatorAvailability_controller_1.createAvailability);
router.get("/availability", auth_middleware_1.protect, creator_middleware_1.requireActiveCreator, creatorAvailability_controller_1.getCreatorAvailabilities);
router.delete("/availability/:availabilityId", auth_middleware_1.protect, creator_middleware_1.requireActiveCreator, creatorAvailability_controller_1.cancelAvailability);
router.get("/availability/:availabilityId/slots", auth_middleware_1.protect, creator_middleware_1.requireActiveCreator, creatorAvailability_controller_1.getAvailabilitySlots);
router.patch("/slots/:slotId/disable", auth_middleware_1.protect, creator_middleware_1.requireActiveCreator, creatorAvailability_controller_1.disableSlot);
router.patch("/slots/:slotId/enable", auth_middleware_1.protect, creator_middleware_1.requireActiveCreator, creatorAvailability_controller_1.enableSlot);
router.delete("/slots/:slotId", auth_middleware_1.protect, creator_middleware_1.requireActiveCreator, creatorAvailability_controller_1.deleteSlot);
exports.default = router;
