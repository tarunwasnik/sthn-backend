// backend/src/routes/v1/chat.routes.ts

import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware";
import {
  chatDocumentUpload,
  chatImageUpload,
} from "../../middlewares/upload.middleware";
import {
  sendMessage,
  sendDocumentMessage,
  sendImageMessage,
  getChatHistory,
  markChatAsSeen,
  getConversations,
  deleteMessage,
  reactToMessage,
} from "../../controllers/chat.controller";
import { downloadDocument } from "../../controllers/chatDocument.controller";

const router = Router();

/* ======================================================
   TEXT / LOCATION
====================================================== */

router.post(
  "/:bookingId/messages",
  protect,
  sendMessage
);

/* ======================================================
   DOCUMENTS
====================================================== */

router.post(
  "/:bookingId/documents",
  protect,
  chatDocumentUpload.single("file"),
  sendDocumentMessage
);


/* ======================================================
   DOWNLOAD DOCUMENT
====================================================== */

router.get(
  "/document/:messageId/download",
  protect,
  downloadDocument
);


/* ======================================================
   IMAGES
====================================================== */

router.post(
  "/:bookingId/images",
  protect,
  chatImageUpload.single("file"),
  sendImageMessage
);

/* ======================================================
   HISTORY
====================================================== */

router.get(
  "/:bookingId/messages",
  protect,
  getChatHistory
);

/* ======================================================
   SEEN
====================================================== */

router.post(
  "/:bookingId/seen",
  protect,
  markChatAsSeen
);

/* ======================================================
   CONVERSATIONS
====================================================== */

router.get(
  "/conversations",
  protect,
  getConversations
);

/* ======================================================
   DELETE
====================================================== */

router.delete(
  "/message/:messageId",
  protect,
  deleteMessage
);

/* ======================================================
   REACTIONS
====================================================== */

router.post(
  "/message/:messageId/react",
  protect,
  reactToMessage
);

export default router;