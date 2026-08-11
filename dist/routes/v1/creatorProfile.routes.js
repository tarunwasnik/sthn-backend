"use strict";
//backend/src/routes/v1/creatorProfile.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const creatorProfile_controller_1 = require("../../controllers/creatorProfile.controller");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const router = (0, express_1.Router)();
router.get("/profile", auth_middleware_1.protect, creatorProfile_controller_1.getMyCreatorProfile);
router.patch("/profile", auth_middleware_1.protect, creatorProfile_controller_1.updateMyCreatorProfile);
exports.default = router;
