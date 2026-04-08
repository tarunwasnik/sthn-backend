"use strict";
//backend/src/routes/auth.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("../controllers/auth.controller");
const authEntry_controller_1 = require("../controllers/authEntry.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
router.post("/register", auth_controller_1.register);
router.post("/login", auth_controller_1.login);
router.post("/google", auth_controller_1.googleLogin);
router.get("/entry", auth_middleware_1.protect, authEntry_controller_1.authEntry);
router.get("/me", auth_middleware_1.protect, auth_controller_1.getMe);
exports.default = router;
