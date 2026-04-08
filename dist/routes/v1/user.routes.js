"use strict";
// backend/src/routes/v1/user.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
console.log("🔥 user.routes.ts loaded");
const express_1 = require("express");
const user_controller_1 = require("../../controllers/user.controller");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const role_middleware_1 = require("../../middlewares/role.middleware");
const roles_1 = require("../../constants/roles");
const creatorAvailability_controller_1 = require("../../controllers/creatorAvailability.controller");
const router = (0, express_1.Router)();
/* =========================================================
   ✅ PUBLIC USER PROFILE (NEW)
========================================================= */
router.get("/:userId", user_controller_1.getUserPublicProfile);
/* =========================================================
   CREATOR SLOTS
========================================================= */
router.get("/creators/:creatorId/slots", creatorAvailability_controller_1.getAvailableSlotsForCreator);
/* =========================================================
   ADMIN USERS
========================================================= */
router.get("/", auth_middleware_1.protect, (0, role_middleware_1.requireRole)(roles_1.ROLES.ADMIN), user_controller_1.getUsers);
exports.default = router;
