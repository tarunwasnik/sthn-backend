"use strict";
//backend/src/routes/index.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_routes_1 = __importDefault(require("./auth.routes"));
const v1_1 = __importDefault(require("./v1"));
const controlPlane_routes_1 = __importDefault(require("./controlPlane.routes"));
const system_routes_1 = __importDefault(require("./system.routes"));
const operations_routes_1 = __importDefault(require("./operations.routes"));
const auth_controller_1 = require("../controllers/auth.controller");
const public_routes_1 = __importDefault(require("./public.routes"));
const router = (0, express_1.Router)();
router.use("/auth", auth_routes_1.default);
// mount AFTER auth routes, BEFORE v1/admin
router.use("/public", public_routes_1.default);
router.use("/v1", v1_1.default);
// Admin Control Plane
router.use("/admin/control-plane", controlPlane_routes_1.default);
// System Dashboard (Phase 31.3)
router.use("/admin/system", system_routes_1.default);
// Operations Dashboard (Phase 31.4)
router.use("/admin/operations", operations_routes_1.default);
// ✅ REGISTER
router.post("/register", auth_controller_1.register);
// ✅ LOGIN
router.post("/login", auth_controller_1.login);
exports.default = router;
