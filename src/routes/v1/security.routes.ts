import { Router } from "express";
import { changeMyPassword, listMySessions, logoutCurrentSession, revokeMyOtherSessions, revokeMySession } from "../../controllers/security.controller";
import { protect } from "../../middlewares/auth.middleware";
import { throttlePasswordChange } from "../../middlewares/authThrottle.middleware";
const router = Router();
router.get("/sessions", protect, listMySessions); router.post("/sessions/current/logout", protect, logoutCurrentSession); router.patch("/password", protect, throttlePasswordChange, changeMyPassword); router.delete("/sessions/others", protect, revokeMyOtherSessions); router.delete("/sessions/:sessionId", protect, revokeMySession);
export default router;
