//backend/src/routes/auth.routes.ts


import { Router } from "express";
import { register, login, googleLogin, getMe } from "../controllers/auth.controller";
import { authEntry } from "../controllers/authEntry.controller";
import { protect } from "../middlewares/auth.middleware";
import { throttleLogin, throttleRegistration } from "../middlewares/authThrottle.middleware";

const router = Router();

router.post("/register", throttleRegistration, register);
router.post("/login", throttleLogin, login);
router.post("/google", googleLogin);

router.get("/entry", protect, authEntry);
router.get("/me", protect, getMe);

export default router;
