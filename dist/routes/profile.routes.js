"use strict";
// backend/src/routes/profile.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const profile_controller_1 = require("../controllers/profile.controller");
const router = (0, express_1.Router)();
/* ================= GET PROFILE ================= */
router.get("/me", auth_middleware_1.protect, profile_controller_1.getMyProfile);
/* ================= CREATE PROFILE ================= */
/**
 * First-time profile creation
 * Expects JSON (NOT FormData anymore)
 */
router.post("/me", auth_middleware_1.protect, profile_controller_1.upsertProfile);
/* ================= UPDATE PROFILE ================= */
/**
 * Editing profile (frontend already uploads to Cloudinary)
 */
router.patch("/me", auth_middleware_1.protect, profile_controller_1.updateMyProfile);
exports.default = router;
