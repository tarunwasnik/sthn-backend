//backend/src/routes/index.ts

import { Router } from "express";
import authRoutes from "./auth.routes";
import v1Routes from "./v1";
import controlPlaneRoutes from "./controlPlane.routes";
import systemRoutes from "./system.routes";
import operationsRoutes from "./operations.routes";
import { register, login } from "../controllers/auth.controller";
import publicRoutes from "./public.routes"
const router = Router();

router.use("/auth", authRoutes);
// mount AFTER auth routes, BEFORE v1/admin
router.use("/public", publicRoutes);

router.use("/v1", v1Routes);

// Admin Control Plane
router.use("/admin/control-plane", controlPlaneRoutes);

// System Dashboard (Phase 31.3)
router.use("/admin/system", systemRoutes);

// Operations Dashboard (Phase 31.4)
router.use("/admin/operations", operationsRoutes);

// ✅ REGISTER
router.post("/register", register);

// ✅ LOGIN
router.post("/login", login);



export default router;