"use strict";
//backend/src/controllers/chatDocument.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadDocument = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const cloudinary_1 = __importDefault(require("../config/cloudinary"));
const chat_model_1 = require("../models/chat.model");
const booking_model_1 = require("../models/booking.model");
const downloadDocument = async (req, res) => {
    try {
        const user = req.user;
        const { messageId } = req.params;
        if (!user) {
            return res.status(401).json({
                message: "Unauthorized",
            });
        }
        if (!mongoose_1.default.Types.ObjectId.isValid(messageId)) {
            return res.status(400).json({
                message: "Invalid messageId",
            });
        }
        const chat = await chat_model_1.Chat.findById(messageId);
        if (!chat) {
            return res.status(404).json({
                message: "Message not found",
            });
        }
        if (chat.type !== "document" ||
            !chat.attachment) {
            return res.status(404).json({
                message: "Document not found",
            });
        }
        const booking = await booking_model_1.Booking.findById(chat.bookingId);
        if (!booking) {
            return res.status(404).json({
                message: "Booking not found",
            });
        }
        const actorId = new mongoose_1.default.Types.ObjectId(user.id);
        const isUser = booking.userId.equals(actorId);
        const isCreator = booking.creatorId.equals(actorId);
        if (!isUser &&
            !isCreator) {
            return res.status(403).json({
                message: "Access denied",
            });
        }
        const downloadUrl = cloudinary_1.default.url(chat.attachment.publicId, {
            resource_type: "raw",
            type: "upload",
            flags: "attachment",
        });
        return res.redirect(downloadUrl);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({
            message: "Failed to download document",
        });
    }
};
exports.downloadDocument = downloadDocument;
