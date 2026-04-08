"use strict";
//backend/src/routes/v1/chat.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const chat_controller_1 = require("../../controllers/chat.controller");
const router = (0, express_1.Router)();
router.post("/:bookingId/messages", auth_middleware_1.protect, chat_controller_1.sendMessage);
router.get("/:bookingId/messages", auth_middleware_1.protect, chat_controller_1.getChatHistory);
router.post("/:bookingId/seen", auth_middleware_1.protect, chat_controller_1.markChatAsSeen);
/* ================= NEW ================= */
router.get("/conversations", auth_middleware_1.protect, chat_controller_1.getConversations);
exports.default = router;
