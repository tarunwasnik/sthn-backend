"use strict";
//backend/src/controllers/chat.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConversations = exports.markChatAsSeen = exports.getChatHistory = exports.reactToMessage = exports.deleteMessage = exports.sendImageMessage = exports.sendDocumentMessage = exports.sendMessage = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const userProfile_model_1 = require("../models/userProfile.model");
const creatorProfile_model_1 = require("../models/creatorProfile.model");
const booking_model_1 = require("../models/booking.model");
const chat_model_1 = require("../models/chat.model");
const slot_model_1 = require("../models/slot.model"); // ✅ ADDED
const aiModeration_service_1 = require("../services/aiModeration.service");
const abuseScore_service_1 = require("../services/abuseScore.service");
const moderationSeverity_service_1 = require("../services/moderationSeverity.service");
const moderationQueue_model_1 = require("../models/moderationQueue.model");
const softWarning_service_1 = require("../services/softWarning.service");
const uploadToCloudinary_1 = require("../utils/uploadToCloudinary");
const server_1 = require("../server");
/* ======================================================
   SEND MESSAGE (UPDATED WITH TIME CHECK)
====================================================== */
const sendMessage = async (req, res) => {
    const user = req.user;
    const { bookingId } = req.params;
    const { message, type = "text", location, replyTo } = req.body;
    const allowedTypes = ["text", "location"];
    if (!allowedTypes.includes(type)) {
        return res.status(400).json({
            message: "Invalid message type",
        });
    }
    if (!user)
        return res.status(401).json({ message: "Unauthorized" });
    if (!mongoose_1.default.Types.ObjectId.isValid(bookingId)) {
        return res.status(400).json({ message: "Invalid bookingId" });
    }
    if (type === "text") {
        if (!message || !message.trim()) {
            return res.status(400).json({
                message: "Message cannot be empty",
            });
        }
    }
    if (type === "location") {
        if (!location ||
            typeof location.latitude !== "number" ||
            typeof location.longitude !== "number" ||
            !location.name ||
            !location.address) {
            return res.status(400).json({
                message: "Valid meeting location is required",
            });
        }
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
    let replyMessage = null;
    if (replyTo) {
        if (!mongoose_1.default.Types.ObjectId.isValid(replyTo)) {
            return res.status(400).json({
                message: "Invalid reply message",
            });
        }
        replyMessage = await chat_model_1.Chat.findOne({
            _id: replyTo,
            bookingId,
        }).lean();
        if (!replyMessage) {
            return res.status(404).json({
                message: "Reply message not found",
            });
        }
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
    const moderation = type === "text"
        ? await (0, aiModeration_service_1.moderateMessage)(message)
        : {
            flags: [],
            hasContactIntent: false,
        };
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
        type,
        message: type === "location" ? "📍 Meeting Location" : message,
        location: type === "location"
            ? {
                latitude: location.latitude,
                longitude: location.longitude,
                name: location.name,
                address: location.address,
                placeId: location.placeId,
            }
            : undefined,
        replyTo: replyMessage
            ? {
                messageId: replyMessage._id,
                senderId: replyMessage.senderId,
                senderRole: replyMessage.senderRole,
                type: replyMessage.type,
                message: replyMessage.message,
                attachment: replyMessage.attachment
                    ? {
                        url: replyMessage.attachment.url,
                        fileName: replyMessage.attachment.fileName,
                        mimeType: replyMessage.attachment.mimeType,
                        resourceType: replyMessage.attachment.resourceType,
                    }
                    : undefined,
            }
            : undefined,
        seenBy: [actorId],
        aiFlags: moderation.flags,
    });
    if (moderationQueueId) {
        await moderationQueue_model_1.ModerationQueue.findByIdAndUpdate(moderationQueueId, {
            chatId: chat._id,
        });
    }
    server_1.io.to(`booking:${bookingId}`).emit("chat:message", {
        _id: chat._id,
        bookingId: chat.bookingId,
        senderId: chat.senderId,
        senderRole: chat.senderRole,
        type: chat.type,
        message: chat.message,
        location: chat.location,
        replyTo: chat.replyTo,
        seenBy: chat.seenBy,
        createdAt: chat.createdAt,
    });
    return res.status(201).json({ chat });
};
exports.sendMessage = sendMessage;
/* ======================================================
   Documents Message
====================================================== */
const sendDocumentMessage = async (req, res) => {
    try {
        const user = req.user;
        const { bookingId } = req.params;
        const { replyTo } = req.body;
        if (!user) {
            return res.status(401).json({
                message: "Unauthorized",
            });
        }
        if (!req.file) {
            return res.status(400).json({
                message: "Document is required",
            });
        }
        if (!mongoose_1.default.Types.ObjectId.isValid(bookingId)) {
            return res.status(400).json({
                message: "Invalid bookingId",
            });
        }
        const booking = await booking_model_1.Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({
                message: "Booking not found",
            });
        }
        const actorId = new mongoose_1.default.Types.ObjectId(user.id);
        const isUser = booking.userId.equals(actorId);
        const isCreator = booking.creatorId.equals(actorId);
        if (!isUser && !isCreator) {
            return res.status(403).json({
                message: "Access denied",
            });
        }
        if (booking.status !== "CONFIRMED") {
            return res.status(400).json({
                message: "Chat allowed only for confirmed bookings",
            });
        }
        let replyMessage = null;
        if (replyTo) {
            if (!mongoose_1.default.Types.ObjectId.isValid(replyTo)) {
                return res.status(400).json({
                    message: "Invalid reply message",
                });
            }
            replyMessage = await chat_model_1.Chat.findOne({
                _id: replyTo,
                bookingId,
            }).lean();
            if (!replyMessage) {
                return res.status(404).json({
                    message: "Reply message not found",
                });
            }
        }
        const slots = await slot_model_1.Slot.find({
            _id: { $in: booking.slotIds },
        }).lean();
        if (!slots.length) {
            return res.status(400).json({
                message: "No slots found for booking",
            });
        }
        const latestEndTime = Math.max(...slots.map((slot) => new Date(slot.endTime).getTime()));
        if (Date.now() > latestEndTime) {
            return res.status(400).json({
                message: "Chat is closed. Booking time has ended.",
            });
        }
        const uploaded = await (0, uploadToCloudinary_1.uploadToCloudinary)(req.file.buffer, "chat_documents", "raw");
        if (!booking.hasInteracted) {
            booking.hasInteracted = true;
            booking.interactionStartedAt = new Date();
            await booking.save();
        }
        const chat = await chat_model_1.Chat.create({
            bookingId,
            senderId: actorId,
            senderRole: isUser ? "USER" : "CREATOR",
            type: "document",
            message: req.file.originalname,
            attachment: {
                url: uploaded.secure_url,
                publicId: uploaded.public_id,
                fileName: uploaded.original_filename,
                originalFileName: req.file.originalname,
                mimeType: req.file.mimetype,
                fileSize: req.file.size,
                resourceType: "raw",
            },
            replyTo: replyMessage
                ? {
                    messageId: replyMessage._id,
                    senderId: replyMessage.senderId,
                    senderRole: replyMessage.senderRole,
                    type: replyMessage.type,
                    message: replyMessage.message,
                    attachment: replyMessage.attachment
                        ? {
                            url: replyMessage.attachment.url,
                            fileName: replyMessage.attachment.fileName,
                            mimeType: replyMessage.attachment.mimeType,
                            resourceType: replyMessage.attachment.resourceType,
                        }
                        : undefined,
                }
                : undefined,
            seenBy: [actorId],
            aiFlags: [],
        });
        server_1.io.to(`booking:${bookingId}`).emit("chat:message", {
            _id: chat._id,
            bookingId: chat.bookingId,
            senderId: chat.senderId,
            senderRole: chat.senderRole,
            type: chat.type,
            message: chat.message,
            attachment: chat.attachment,
            replyTo: chat.replyTo,
            seenBy: chat.seenBy,
            createdAt: chat.createdAt,
        });
        return res.status(201).json({
            chat,
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Failed to upload document",
        });
    }
};
exports.sendDocumentMessage = sendDocumentMessage;
/* ======================================================
   IMAGE MESSAGE
====================================================== */
const sendImageMessage = async (req, res) => {
    try {
        const user = req.user;
        const { bookingId } = req.params;
        const { replyTo } = req.body;
        if (!user) {
            return res.status(401).json({
                message: "Unauthorized",
            });
        }
        const files = req.files || [];
        if (!files.length) {
            return res.status(400).json({
                message: "At least one image is required",
            });
        }
        if (!mongoose_1.default.Types.ObjectId.isValid(bookingId)) {
            return res.status(400).json({
                message: "Invalid bookingId",
            });
        }
        const booking = await booking_model_1.Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({
                message: "Booking not found",
            });
        }
        const actorId = new mongoose_1.default.Types.ObjectId(user.id);
        const isUser = booking.userId.equals(actorId);
        const isCreator = booking.creatorId.equals(actorId);
        if (!isUser && !isCreator) {
            return res.status(403).json({
                message: "Access denied",
            });
        }
        if (booking.status !== "CONFIRMED") {
            return res.status(400).json({
                message: "Chat allowed only for confirmed bookings",
            });
        }
        let replyMessage = null;
        if (replyTo) {
            if (!mongoose_1.default.Types.ObjectId.isValid(replyTo)) {
                return res.status(400).json({
                    message: "Invalid reply message",
                });
            }
            replyMessage = await chat_model_1.Chat.findOne({
                _id: replyTo,
                bookingId,
            }).lean();
            if (!replyMessage) {
                return res.status(404).json({
                    message: "Reply message not found",
                });
            }
        }
        const slots = await slot_model_1.Slot.find({
            _id: {
                $in: booking.slotIds,
            },
        }).lean();
        if (!slots.length) {
            return res.status(400).json({
                message: "No slots found",
            });
        }
        const latestEndTime = Math.max(...slots.map((slot) => new Date(slot.endTime).getTime()));
        if (Date.now() > latestEndTime) {
            return res.status(400).json({
                message: "Chat is closed. Booking time has ended.",
            });
        }
        if (!booking.hasInteracted) {
            booking.hasInteracted = true;
            booking.interactionStartedAt = new Date();
            await booking.save();
        }
        const groupId = new mongoose_1.default.Types.ObjectId().toString();
        const uploads = await Promise.all(files.map((file) => (0, uploadToCloudinary_1.uploadToCloudinary)(file.buffer, "chat_images", "image")));
        const chatDocuments = files.map((file, index) => {
            const uploaded = uploads[index];
            return {
                bookingId,
                senderId: actorId,
                senderRole: isUser ? "USER" : "CREATOR",
                type: "image",
                message: file.originalname,
                groupId,
                attachment: {
                    url: uploaded.secure_url,
                    publicId: uploaded.public_id,
                    fileName: uploaded.original_filename,
                    originalFileName: file.originalname,
                    mimeType: file.mimetype,
                    fileSize: file.size,
                    resourceType: "image",
                },
                replyTo: replyMessage
                    ? {
                        messageId: replyMessage._id,
                        senderId: replyMessage.senderId,
                        senderRole: replyMessage.senderRole,
                        type: replyMessage.type,
                        message: replyMessage.message,
                        attachment: replyMessage.attachment
                            ? {
                                url: replyMessage.attachment.url,
                                fileName: replyMessage.attachment.fileName,
                                mimeType: replyMessage.attachment.mimeType,
                                resourceType: replyMessage.attachment.resourceType,
                            }
                            : undefined,
                    }
                    : undefined,
                seenBy: [actorId],
                aiFlags: [],
            };
        });
        const chats = await chat_model_1.Chat.insertMany(chatDocuments);
        server_1.io.to(`booking:${bookingId}`).emit("chat:image-group", {
            bookingId,
            messages: chats.map((chat) => ({
                _id: chat._id,
                bookingId: chat.bookingId,
                senderId: chat.senderId,
                senderRole: chat.senderRole,
                type: chat.type,
                message: chat.message,
                groupId: chat.groupId,
                replyTo: chat.replyTo,
                attachment: chat.attachment,
                seenBy: chat.seenBy,
                aiFlags: chat.aiFlags,
                createdAt: chat.createdAt,
                updatedAt: chat.updatedAt,
            })),
        });
        return res.status(201).json({
            messages: chats,
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Failed to upload image",
        });
    }
};
exports.sendImageMessage = sendImageMessage;
/* ======================================================
   DELETE MESSAGE
====================================================== */
const deleteMessage = async (req, res) => {
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
    const actorId = new mongoose_1.default.Types.ObjectId(user.id);
    const chat = await chat_model_1.Chat.findById(messageId);
    if (!chat) {
        return res.status(404).json({
            message: "Message not found",
        });
    }
    // Only sender can delete
    if (!chat.senderId.equals(actorId)) {
        return res.status(403).json({
            message: "You can only delete your own messages",
        });
    }
    // Already deleted
    if (chat.isDeleted) {
        return res.status(400).json({
            message: "Message already deleted",
        });
    }
    // 15 minute limit
    const FIFTEEN_MINUTES = 15 * 60 * 1000;
    const messageAge = Date.now() - new Date(chat.createdAt).getTime();
    if (messageAge > FIFTEEN_MINUTES) {
        return res.status(400).json({
            message: "Messages can only be deleted within 15 minutes",
        });
    }
    chat.isDeleted = true;
    chat.deletedAt = new Date();
    await chat.save();
    server_1.io.to(`booking:${chat.bookingId}`).emit("chat:deleted", {
        messageId: chat._id,
        bookingId: chat.bookingId,
        deletedAt: chat.deletedAt,
    });
    return res.status(200).json({
        message: "Message deleted",
        chat,
    });
};
exports.deleteMessage = deleteMessage;
/* ======================================================
   REACT TO MESSAGE
====================================================== */
const reactToMessage = async (req, res) => {
    const user = req.user;
    const { messageId } = req.params;
    const { emoji } = req.body;
    if (!user) {
        return res.status(401).json({
            message: "Unauthorized",
        });
    }
    if (!emoji) {
        return res.status(400).json({
            message: "Emoji is required",
        });
    }
    const chat = await chat_model_1.Chat.findById(messageId);
    if (!chat) {
        return res.status(404).json({
            message: "Message not found",
        });
    }
    const actorId = new mongoose_1.default.Types.ObjectId(user.id);
    const existingReaction = chat.reactions.find((reaction) => reaction.userId.toString() === actorId.toString());
    if (!existingReaction) {
        chat.reactions.push({
            userId: actorId,
            emoji,
        });
    }
    else if (existingReaction.emoji === emoji) {
        chat.reactions = chat.reactions.filter((reaction) => reaction.userId.toString() !== actorId.toString());
    }
    else {
        existingReaction.emoji = emoji;
    }
    await chat.save();
    server_1.io.to(`booking:${chat.bookingId}`).emit("chat:reaction", {
        bookingId: chat.bookingId,
        messageId: chat._id,
        reactions: chat.reactions,
    });
    return res.status(200).json({
        message: "Reaction updated",
        reactions: chat.reactions,
    });
};
exports.reactToMessage = reactToMessage;
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
    if (!booking.userId.equals(actorId) && !booking.creatorId.equals(actorId)) {
        return res.status(403).json({ message: "Access denied" });
    }
    const chats = await chat_model_1.Chat.find({ bookingId }).sort({ createdAt: 1 }).lean();
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
    return res.status(200).json({ message: "Messages marked as seen" });
};
exports.markChatAsSeen = markChatAsSeen;
/* ======================================================
   GET CONVERSATIONS (UPDATED)
====================================================== */
const getConversations = async (req, res) => {
    const user = req.user;
    if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    const actorId = new mongoose_1.default.Types.ObjectId(user.id);
    /* ======================================================
       GET BOOKINGS
    ====================================================== */
    const bookings = await booking_model_1.Booking.find({
        status: "CONFIRMED",
        $or: [{ userId: actorId }, { creatorId: actorId }],
    }).lean();
    const bookingIds = bookings.map((b) => b._id);
    if (bookingIds.length === 0) {
        return res.status(200).json({
            conversations: [],
        });
    }
    /* ======================================================
       LAST MESSAGE
    ====================================================== */
    const lastMessages = await chat_model_1.Chat.aggregate([
        {
            $match: {
                bookingId: { $in: bookingIds },
            },
        },
        {
            $sort: {
                bookingId: 1,
                createdAt: -1,
            },
        },
        {
            $group: {
                _id: "$bookingId",
                message: { $first: "$message" },
                createdAt: {
                    $first: "$createdAt",
                },
            },
        },
    ]);
    const lastMessageMap = new Map();
    lastMessages.forEach((m) => {
        lastMessageMap.set(m._id.toString(), m);
    });
    /* ======================================================
       UNREAD COUNTS
    ====================================================== */
    const unreadCounts = await chat_model_1.Chat.aggregate([
        {
            $match: {
                bookingId: {
                    $in: bookingIds,
                },
                senderId: {
                    $ne: actorId,
                },
                seenBy: {
                    $ne: actorId,
                },
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
    /* ======================================================
       CREATOR PROFILES
    ====================================================== */
    const creatorIds = bookings.map((b) => b.creatorId);
    const creators = await creatorProfile_model_1.CreatorProfile.find({
        userId: { $in: creatorIds },
    }).lean();
    const creatorMap = new Map();
    creators.forEach((c) => {
        creatorMap.set(c.userId.toString(), c);
    });
    /* ======================================================
       USER PROFILES
    ====================================================== */
    const userIds = bookings.map((b) => typeof b.userId === "object"
        ? b.userId._id.toString()
        : b.userId.toString());
    const userProfiles = await userProfile_model_1.UserProfile.find({
        userId: { $in: userIds },
    }).lean();
    const userProfileMap = new Map();
    userProfiles.forEach((u) => {
        userProfileMap.set(u.userId.toString(), u);
    });
    /* ======================================================
     BUILD CONVERSATIONS
  ====================================================== */
    const conversations = bookings.map((booking) => {
        const lastMessage = lastMessageMap.get(booking._id.toString());
        const bookingUserId = typeof booking.userId === "object"
            ? booking.userId._id.toString()
            : booking.userId.toString();
        const bookingCreatorId = typeof booking.creatorId === "object"
            ? booking.creatorId._id.toString()
            : booking.creatorId.toString();
        const isUser = bookingUserId === actorId.toString();
        const otherUserId = isUser ? bookingCreatorId : bookingUserId;
        const otherUserProfile = creatorMap.get(otherUserId) || userProfileMap.get(otherUserId) || null;
        return {
            bookingId: booking._id,
            service: {
                _id: booking.serviceId,
                title: booking.serviceTitle || "Service",
            },
            lastMessage: lastMessage?.message || "",
            lastMessageAt: lastMessage?.createdAt || booking.createdAt,
            otherUser: {
                _id: otherUserId,
                profile: otherUserProfile,
            },
            unreadCount: unreadMap.get(booking._id.toString()) || 0,
        };
    });
    /* ======================================================
     SORT LATEST FIRST
  ====================================================== */
    conversations.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
    return res.status(200).json({
        conversations,
    });
};
exports.getConversations = getConversations;
