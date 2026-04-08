"use strict";
//backend/src/routes/v1/creatorCancelBooking.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const role_middleware_1 = require("../../middlewares/role.middleware");
const roles_1 = require("../../constants/roles");
const creatorCancelBooking_controller_1 = require("../../controllers/creatorCancelBooking.controller");
const router = (0, express_1.Router)();
router.post("/cancel-booking", auth_middleware_1.protect, (0, role_middleware_1.requireRole)(roles_1.ROLES.CREATOR), creatorCancelBooking_controller_1.cancelBookingByCreator);
exports.default = router;
