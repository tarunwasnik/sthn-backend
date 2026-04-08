"use strict";
//backend/src/routes/v1/creatorApplication.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const creatorApplication_controller_1 = require("../../controllers/creatorApplication.controller");
const router = (0, express_1.Router)();
router.post("/", auth_middleware_1.protect, creatorApplication_controller_1.applyForCreator);
exports.default = router;
