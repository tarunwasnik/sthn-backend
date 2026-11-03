import { Router } from "express";

import { notificationController } from "../../controllers/notification.controller";
import { protect } from "../../middlewares/auth.middleware";
import { catchAsync } from "../../utils/catchAsync";

const router = Router();

router.get("/", protect, catchAsync(notificationController.getHistory));
router.get("/unread-count", protect, catchAsync(notificationController.getUnreadCount));
router.patch("/read-all", protect, catchAsync(notificationController.markAllRead));
router.patch("/:notificationId/read", protect, catchAsync(notificationController.markOneRead));

export default router;
