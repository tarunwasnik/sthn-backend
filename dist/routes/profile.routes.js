"use strict";
// backend/src/routes/profile.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const upload_middleware_1 = require("../middlewares/upload.middleware");
const profile_controller_1 = require("../controllers/profile.controller");
const router = (0, express_1.Router)();
router.get("/me", auth_middleware_1.protect, profile_controller_1.getMyProfile);
router.post("/me", auth_middleware_1.protect, upload_middleware_1.upload.array("profilePhotos", 6), // 🔥 IMPORTANT
profile_controller_1.upsertProfile);
exports.default = router;
