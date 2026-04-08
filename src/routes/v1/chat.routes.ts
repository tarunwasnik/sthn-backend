//backend/src/routes/v1/chat.routes.ts

import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware";
import {
  sendMessage,
  getChatHistory,
  markChatAsSeen,
  getConversations,
} from "../../controllers/chat.controller";

const router = Router();

router.post(
  "/:bookingId/messages",
  protect,
  sendMessage
);

router.get(
  "/:bookingId/messages",
  protect,
  getChatHistory
);

router.post(
  "/:bookingId/seen",
  protect,
  markChatAsSeen
);

/* ================= NEW ================= */
router.get(
  "/conversations",
  protect,
  getConversations
);

export default router;