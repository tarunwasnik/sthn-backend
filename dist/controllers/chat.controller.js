"use strict";
//backend/src/controllers/chat.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConversations = exports.markChatAsSeen = exports.getChatHistory = exports.sendMessage = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const booking_model_1 = require("../models/booking.model");
const chat_model_1 = require("../models/chat.model");
const slot_model_1 = require("../models/slot.model"); // ✅ ADDED
const aiModeration_service_1 = require("../services/aiModeration.service");
const abuseScore_service_1 = require("../services/abuseScore.service");
const moderationSeverity_service_1 = require("../services/moderationSeverity.service");
const moderationQueue_model_1 = require("../models/moderationQueue.model");
const softWarning_service_1 = require("../services/softWarning.service");
const server_1 = require("../server");
/* ======================================================
   SEND MESSAGE (UPDATED WITH TIME CHECK)
====================================================== */
const sendMessage = async (req, res) => {
    const user = req.user;
    const { bookingId } = req.params;
    const { message } = req.body;
    if (!user)
        return res.status(401).json({ message: "Unauthorized" });
    if (!mongoose_1.default.Types.ObjectId.isValid(bookingId)) {
        return res.status(400).json({ message: "Invalid bookingId" });
    }
    if (!message || !message.trim()) {
        return res.status(400).json({ message: "Message cannot be empty" });
    }
    const booking = await booking_model_1.Booking.findById(bookingId);
    if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
    }
    const actorId = new mongoose_1.default.Types.ObjectId(user.id);
    const isUser = booking.userId.equals(actorId);
    const isCreator = booking.creatorId.equals(actorId);
    if (!isUser && !isCreator) {
        return res.status(403).json({ message: "Access denied" });
    }
    if (booking.status !== "CONFIRMED") {
        return res.status(400).json({
            message: "Chat allowed only for confirmed bookings",
        });
    }
    /* ======================================================
       🔥 TIME VALIDATION (CRITICAL FIX)
    ====================================================== */
    const slots = await slot_model_1.Slot.find({
        _id: { $in: booking.slotIds },
    }).lean();
    if (!slots || slots.length === 0) {
        return res.status(400).json({
            message: "No slots found for booking",
        });
    }
    // Get latest endTime among all slots
    const latestEndTime = Math.max(...slots.map((s) => new Date(s.endTime).getTime()));
    const currentTime = Date.now();
    if (currentTime > latestEndTime) {
        return res.status(400).json({
            message: "Chat is closed. Booking time has ended.",
        });
    }
    /* ======================================================
       EXISTING LOGIC (UNCHANGED)
    ====================================================== */
    const moderation = await (0, aiModeration_service_1.moderateMessage)(message);
    let abuseScore = 0;
    if (moderation.hasContactIntent) {
        abuseScore = await (0, abuseScore_service_1.applyAbuseScore)(isUser ? booking.userId : booking.creatorId, booking.hasInteracted
            ? "USER_CANCEL_AFTER_INTERACTION"
            : "USER_CANCEL_EARLY");
    }
    const severityResult = (0, moderationSeverity_service_1.classifySeverity)(moderation.flags, abuseScore);
    if (severityResult.severity !== "LOW") {
        (0, softWarning_service_1.emitSoftWarning)(server_1.io, bookingId, actorId.toString(), severityResult.severity);
    }
    let moderationQueueId = null;
    if (severityResult.severity === "HIGH") {
        const entry = await moderationQueue_model_1.ModerationQueue.create({
            bookingId,
            offenderId: actorId,
            severity: severityResult.severity,
            reasons: severityResult.reasons,
        });
        moderationQueueId = entry._id;
    }
    if (!booking.hasInteracted) {
        booking.hasInteracted = true;
        booking.interactionStartedAt = new Date();
        await booking.save();
    }
    const chat = await chat_model_1.Chat.create({
        bookingId,
        senderId: actorId,
        senderRole: isUser ? "USER" : "CREATOR",
        message,
        seenBy: [actorId],
        aiFlags: moderation.flags,
    });
    if (moderationQueueId) {
        await moderationQueue_model_1.ModerationQueue.findByIdAndUpdate(moderationQueueId, { chatId: chat._id });
    }
    server_1.io.to(`booking:${bookingId}`).emit("chat:message", {
        _id: chat._id,
        bookingId: chat.bookingId,
        senderId: chat.senderId,
        senderRole: chat.senderRole,
        message: chat.message,
        createdAt: chat.createdAt,
    });
    return res.status(201).json({ chat });
};
exports.sendMessage = sendMessage;
/* ======================================================
   GET CHAT HISTORY (UNCHANGED)
====================================================== */
const getChatHistory = async (req, res) => {
    const user = req.user;
    const { bookingId } = req.params;
    if (!user)
        return res.status(401).json({ message: "Unauthorized" });
    if (!mongoose_1.default.Types.ObjectId.isValid(bookingId)) {
        return res.status(400).json({ message: "Invalid bookingId" });
    }
    const booking = await booking_model_1.Booking.findById(bookingId);
    if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
    }
    const actorId = new mongoose_1.default.Types.ObjectId(user.id);
    if (!booking.userId.equals(actorId) &&
        !booking.creatorId.equals(actorId)) {
        return res.status(403).json({ message: "Access denied" });
    }
    const chats = await chat_model_1.Chat.find({ bookingId })
        .sort({ createdAt: 1 })
        .lean();
    return res.status(200).json({ chats });
};
exports.getChatHistory = getChatHistory;
/* ======================================================
   MARK CHAT AS SEEN (UNCHANGED)
====================================================== */
const markChatAsSeen = async (req, res) => {
    const user = req.user;
    const { bookingId } = req.params;
    if (!user)
        return res.status(401).json({ message: "Unauthorized" });
    if (!mongoose_1.default.Types.ObjectId.isValid(bookingId)) {
        return res.status(400).json({ message: "Invalid bookingId" });
    }
    const actorId = new mongoose_1.default.Types.ObjectId(user.id);
    await chat_model_1.Chat.updateMany({ bookingId, seenBy: { $ne: actorId } }, { $push: { seenBy: actorId } });
    server_1.io.to(`booking:${bookingId}`).emit("chat:seen", {
        bookingId,
        seenBy: actorId,
    });
    return res
        .status(200)
        .json({ message: "Messages marked as seen" });
};
exports.markChatAsSeen = markChatAsSeen;
/* ======================================================
   GET CONVERSATIONS (UNCHANGED)
====================================================== */
const getConversations = async (req, res) => {
    const user = req.user;
    if (!user)
        return res.status(401).json({ message: "Unauthorized" });
    const actorId = new mongoose_1.default.Types.ObjectId(user.id);
    const bookings = await booking_model_1.Booking.find({
        status: "CONFIRMED",
        $or: [{ userId: actorId }, { creatorId: actorId }],
    }).lean();
    const bookingIds = bookings.map((b) => b._id);
    if (bookingIds.length === 0) {
        return res.status(200).json({ conversations: [] });
    }
    const lastMessages = await chat_model_1.Chat.aggregate([
        { $match: { bookingId: { $in: bookingIds } } },
        { $sort: { createdAt: -1 } },
        {
            $group: {
                _id: "$bookingId",
                message: { $first: "$message" },
                createdAt: { $first: "$createdAt" },
            },
        },
    ]);
    const lastMessageMap = new Map();
    lastMessages.forEach((m) => {
        lastMessageMap.set(m._id.toString(), m);
    });
    const unreadCounts = await chat_model_1.Chat.aggregate([
        {
            $match: {
                bookingId: { $in: bookingIds },
                seenBy: { $ne: actorId },
            },
        },
        {
            $group: {
                _id: "$bookingId",
                count: { $sum: 1 },
            },
        },
    ]);
    const unreadMap = new Map();
    unreadCounts.forEach((u) => {
        unreadMap.set(u._id.toString(), u.count);
    });
    const creatorIds = bookings.map((b) => b.creatorId);
    const creators = await mongoose_1.default
        .model("CreatorProfile")
        .find({ userId: { $in: creatorIds } })
        .lean();
    const creatorMap = new Map();
    creators.forEach((c) => {
        creatorMap.set(c.userId.toString(), c);
    });
    const conversations = bookings
        .map((booking) => {
        const lastMessage = lastMessageMap.get(booking._id.toString());
        if (!lastMessage)
            return null;
        const isUser = booking.userId.toString() === actorId.toString();
        let otherUser = {
            id: "",
            displayName: "Unknown",
            avatarUrl: null,
        };
        if (isUser) {
            const creator = creatorMap.get(booking.creatorId.toString());
            if (creator) {
                otherUser = {
                    id: creator.userId,
                    displayName: creator.displayName,
                    avatarUrl: creator.avatarUrl,
                };
            }
        }
        else {
            otherUser = {
                id: booking.userId,
                displayName: "User",
                avatarUrl: null,
            };
        }
        return {
            bookingId: booking._id,
            lastMessage: lastMessage.message,
            lastMessageAt: lastMessage.createdAt,
            otherUser,
            unreadCount: unreadMap.get(booking._id.toString()) || 0,
        };
    })
        .filter(Boolean);
    conversations.sort((a, b) => new Date(b.lastMessageAt).getTime() -
        new Date(a.lastMessageAt).getTime());
    return res.status(200).json({ conversations });
};
exports.getConversations = getConversations;
