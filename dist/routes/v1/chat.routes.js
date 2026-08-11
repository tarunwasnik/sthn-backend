"use strict";
// backend/src/routes/v1/chat.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const upload_middleware_1 = require("../../middlewares/upload.middleware");
const chat_controller_1 = require("../../controllers/chat.controller");
const chatDocument_controller_1 = require("../../controllers/chatDocument.controller");
const router = (0, express_1.Router)();
/* ======================================================
   TEXT / LOCATION
====================================================== */
router.post("/:bookingId/messages", auth_middleware_1.protect, chat_controller_1.sendMessage);
/* ======================================================
   DOCUMENTS
====================================================== */
router.post("/:bookingId/documents", auth_middleware_1.protect, upload_middleware_1.chatDocumentUpload.single("file"), chat_controller_1.sendDocumentMessage);
/* ======================================================
   DOWNLOAD DOCUMENT
====================================================== */
router.get("/document/:messageId/download", auth_middleware_1.protect, chatDocument_controller_1.downloadDocument);
/* ======================================================
   IMAGES
====================================================== */
router.post("/:bookingId/images", auth_middleware_1.protect, upload_middleware_1.chatImageUpload.array("files", 20), chat_controller_1.sendImageMessage);
/* ======================================================
   HISTORY
====================================================== */
router.get("/:bookingId/messages", auth_middleware_1.protect, chat_controller_1.getChatHistory);
/* ======================================================
   SEEN
====================================================== */
router.post("/:bookingId/seen", auth_middleware_1.protect, chat_controller_1.markChatAsSeen);
/* ======================================================
   CONVERSATIONS
====================================================== */
router.get("/conversations", auth_middleware_1.protect, chat_controller_1.getConversations);
/* ======================================================
   DELETE
====================================================== */
router.delete("/message/:messageId", auth_middleware_1.protect, chat_controller_1.deleteMessage);
/* ======================================================
   REACTIONS
====================================================== */
router.post("/message/:messageId/react", auth_middleware_1.protect, chat_controller_1.reactToMessage);
exports.default = router;
