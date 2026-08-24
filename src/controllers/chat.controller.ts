//backend/src/controllers/chat.controller.ts

import { Request, Response } from "express";
import mongoose from "mongoose";
import { UserProfile } from "../models/userProfile.model";
import { CreatorProfile } from "../models/creatorProfile.model";
import { Booking } from "../models/booking.model";
import { Chat } from "../models/chat.model";
import { Slot } from "../models/slot.model"; // ✅ ADDED
import { moderateMessage } from "../services/aiModeration.service";
import { applyAbuseScore } from "../services/abuseScore.service";
import { classifySeverity } from "../services/moderationSeverity.service";
import { ModerationQueue } from "../models/moderationQueue.model";
import { emitSoftWarning } from "../services/softWarning.service";
import { uploadToCloudinary } from "../utils/uploadToCloudinary";
import { personalRoom } from "../sockets/chat.socket";
// Resolve the Socket.IO export only when a controller executes. Importing it at
// module evaluation time creates a server → routes → controller → server cycle.
const getIo = () => require("../server").io as typeof import("../server").io;

const isTerminalChatBooking = (status: string) => status === "CANCELLED" || status === "COMPLETED";
const terminalChatReadOnly = (res: Response) => res.status(409).json({ code: "CHAT_READ_ONLY", message: "This booking conversation is read-only." });

const emitRecipientConversationUpdate = (
  booking: { userId: unknown; creatorId: unknown },
  senderId: unknown,
  chat: { _id: unknown; bookingId: unknown; senderId: unknown; message: string; createdAt: Date },
) => {
  const sender = String(senderId);
  const bookingUserId = String(booking.userId);
  const bookingCreatorId = String(booking.creatorId);
  const recipientId = sender === bookingUserId ? bookingCreatorId : bookingUserId;

  // The recipient comes exclusively from the persisted booking relationship.
  // Do not emit a sender's own message as inbox/unread activity.
  if (recipientId === sender) return;

  getIo().to(personalRoom(recipientId)).emit("chat:conversation-update", {
    bookingId: chat.bookingId,
    messageId: chat._id,
    senderId: chat.senderId,
    message: chat.message,
    createdAt: chat.createdAt,
  });
};

/* ======================================================
   SEND MESSAGE (UPDATED WITH TIME CHECK)
====================================================== */
export const sendMessage = async (req: Request, res: Response) => {
  const user = req.user;
  const { bookingId } = req.params;
  const { message, type = "text", location, replyTo } = req.body;

  const allowedTypes = ["text", "location"];

  if (!allowedTypes.includes(type)) {
    return res.status(400).json({
      message: "Invalid message type",
    });
  }

  if (!user) return res.status(401).json({ message: "Unauthorized" });

  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
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
    if (
      !location ||
      typeof location.latitude !== "number" ||
      typeof location.longitude !== "number" ||
      !location.name ||
      !location.address
    ) {
      return res.status(400).json({
        message: "Valid meeting location is required",
      });
    }
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    return res.status(404).json({ message: "Booking not found" });
  }

  const actorId = new mongoose.Types.ObjectId(user.id);
  const isUser = booking.userId.equals(actorId);
  const isCreator = booking.creatorId.equals(actorId);

  if (!isUser && !isCreator) {
    return res.status(403).json({ message: "Access denied" });
  }

  if (isTerminalChatBooking(booking.status)) return terminalChatReadOnly(res);
  if (booking.status !== "CONFIRMED") {
    return res.status(400).json({
      message: "Chat allowed only for confirmed bookings",
    });
  }

  let replyMessage: any = null;

  if (replyTo) {
    if (!mongoose.Types.ObjectId.isValid(replyTo)) {
      return res.status(400).json({
        message: "Invalid reply message",
      });
    }

    replyMessage = await Chat.findOne({
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

  const slots = await Slot.find({
    _id: { $in: booking.slotIds },
  }).lean();

  if (!slots || slots.length === 0) {
    return res.status(400).json({
      message: "No slots found for booking",
    });
  }

  // Get latest endTime among all slots
  const latestEndTime = Math.max(
    ...slots.map((s) => new Date(s.endTime).getTime()),
  );

  const currentTime = Date.now();

  if (currentTime > latestEndTime) {
    return res.status(400).json({
      message: "Chat is closed. Booking time has ended.",
    });
  }

  /* ======================================================
     EXISTING LOGIC (UNCHANGED)
  ====================================================== */

  const moderation =
    type === "text"
      ? await moderateMessage(message)
      : {
          flags: [],
          hasContactIntent: false,
        };

  let abuseScore: number = 0;

  if (moderation.hasContactIntent) {
    abuseScore = await applyAbuseScore(
      isUser ? booking.userId : booking.creatorId,
      booking.hasInteracted
        ? "USER_CANCEL_AFTER_INTERACTION"
        : "USER_CANCEL_EARLY",
    );
  }

  const severityResult = classifySeverity(moderation.flags, abuseScore);

  if (severityResult.severity !== "LOW") {
    emitSoftWarning(getIo(), bookingId, actorId.toString(), severityResult.severity);
  }

  let moderationQueueId: mongoose.Types.ObjectId | null = null;

  if (severityResult.severity === "HIGH") {
    const entry = await ModerationQueue.create({
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

  const chat = await Chat.create({
    bookingId,
    senderId: actorId,
    senderRole: isUser ? "USER" : "CREATOR",

    type,

    message: type === "location" ? "📍 Meeting Location" : message,

    location:
      type === "location"
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
    await ModerationQueue.findByIdAndUpdate(moderationQueueId, {
      chatId: chat._id,
    });
  }

  getIo().to(`booking:${bookingId}`).emit("chat:message", {
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

  emitRecipientConversationUpdate(booking, actorId, chat);

  return res.status(201).json({ chat });
};

/* ======================================================
   Documents Message
====================================================== */

export const sendDocumentMessage = async (req: Request, res: Response) => {
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

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({
        message: "Invalid bookingId",
      });
    }

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(404).json({
        message: "Booking not found",
      });
    }

    const actorId = new mongoose.Types.ObjectId(user.id);

    const isUser = booking.userId.equals(actorId);
    const isCreator = booking.creatorId.equals(actorId);

    if (!isUser && !isCreator) {
      return res.status(403).json({
        message: "Access denied",
      });
    }

    if (isTerminalChatBooking(booking.status)) return terminalChatReadOnly(res);
    if (booking.status !== "CONFIRMED") {
      return res.status(400).json({
        message: "Chat allowed only for confirmed bookings",
      });
    }

    let replyMessage: any = null;

    if (replyTo) {
      if (!mongoose.Types.ObjectId.isValid(replyTo)) {
        return res.status(400).json({
          message: "Invalid reply message",
        });
      }

      replyMessage = await Chat.findOne({
        _id: replyTo,
        bookingId,
      }).lean();

      if (!replyMessage) {
        return res.status(404).json({
          message: "Reply message not found",
        });
      }
    }

    const slots = await Slot.find({
      _id: { $in: booking.slotIds },
    }).lean();

    if (!slots.length) {
      return res.status(400).json({
        message: "No slots found for booking",
      });
    }

    const latestEndTime = Math.max(
      ...slots.map((slot) => new Date(slot.endTime).getTime()),
    );

    if (Date.now() > latestEndTime) {
      return res.status(400).json({
        message: "Chat is closed. Booking time has ended.",
      });
    }

    const uploaded = await uploadToCloudinary(
      req.file.buffer,
      "chat_documents",
      "raw",
    );

    if (!booking.hasInteracted) {
      booking.hasInteracted = true;
      booking.interactionStartedAt = new Date();
      await booking.save();
    }

    const chat = await Chat.create({
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

    getIo().to(`booking:${bookingId}`).emit("chat:message", {
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

    emitRecipientConversationUpdate(booking, actorId, chat);

    return res.status(201).json({
      chat,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to upload document",
    });
  }
};

/* ======================================================
   IMAGE MESSAGE
====================================================== */

export const sendImageMessage = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const { bookingId } = req.params;
    const { replyTo } = req.body;

    if (!user) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const files = (req.files as Express.Multer.File[]) || [];

    if (!files.length) {
      return res.status(400).json({
        message: "At least one image is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({
        message: "Invalid bookingId",
      });
    }

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(404).json({
        message: "Booking not found",
      });
    }

    const actorId = new mongoose.Types.ObjectId(user.id);

    const isUser = booking.userId.equals(actorId);

    const isCreator = booking.creatorId.equals(actorId);

    if (!isUser && !isCreator) {
      return res.status(403).json({
        message: "Access denied",
      });
    }

    if (isTerminalChatBooking(booking.status)) return terminalChatReadOnly(res);
    if (booking.status !== "CONFIRMED") {
      return res.status(400).json({
        message: "Chat allowed only for confirmed bookings",
      });
    }

    let replyMessage: any = null;

    if (replyTo) {
      if (!mongoose.Types.ObjectId.isValid(replyTo)) {
        return res.status(400).json({
          message: "Invalid reply message",
        });
      }

      replyMessage = await Chat.findOne({
        _id: replyTo,
        bookingId,
      }).lean();

      if (!replyMessage) {
        return res.status(404).json({
          message: "Reply message not found",
        });
      }
    }

    const slots = await Slot.find({
      _id: {
        $in: booking.slotIds,
      },
    }).lean();

    if (!slots.length) {
      return res.status(400).json({
        message: "No slots found",
      });
    }

    const latestEndTime = Math.max(
      ...slots.map((slot) => new Date(slot.endTime).getTime()),
    );

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

    const groupId = new mongoose.Types.ObjectId().toString();

    const uploads = await Promise.all(
      files.map((file) =>
        uploadToCloudinary(file.buffer, "chat_images", "image"),
      ),
    );

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

    const chats = await Chat.insertMany(chatDocuments);

    getIo().to(`booking:${bookingId}`).emit("chat:image-group", {
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

    chats.forEach((chat) => {
      emitRecipientConversationUpdate(booking, actorId, chat);
    });

    return res.status(201).json({
      messages: chats,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to upload image",
    });
  }
};

/* ======================================================
   DELETE MESSAGE
====================================================== */
export const deleteMessage = async (req: Request, res: Response) => {
  const user = req.user;
  const { messageId } = req.params;

  if (!user) {
    return res.status(401).json({
      message: "Unauthorized",
    });
  }

  if (!mongoose.Types.ObjectId.isValid(messageId)) {
    return res.status(400).json({
      message: "Invalid messageId",
    });
  }

  const actorId = new mongoose.Types.ObjectId(user.id);

  const chat = await Chat.findById(messageId);

  if (!chat) {
    return res.status(404).json({
      message: "Message not found",
    });
  }

  const booking = await Booking.findById(chat.bookingId);
  if (!booking) return res.status(404).json({ message: "Booking not found" });
  if (!booking.userId.equals(actorId) && !booking.creatorId.equals(actorId)) return res.status(403).json({ message: "Access denied" });
  if (isTerminalChatBooking(booking.status)) return terminalChatReadOnly(res);

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

  getIo().to(`booking:${chat.bookingId}`).emit("chat:deleted", {
    messageId: chat._id,
    bookingId: chat.bookingId,
    deletedAt: chat.deletedAt,
  });

  return res.status(200).json({
    message: "Message deleted",
    chat,
  });
};

/* ======================================================
   REACT TO MESSAGE
====================================================== */
export const reactToMessage = async (req: Request, res: Response) => {
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

  const chat = await Chat.findById(messageId);

  if (!chat) {
    return res.status(404).json({
      message: "Message not found",
    });
  }

  const actorId = new mongoose.Types.ObjectId(user.id);
  const booking = await Booking.findById(chat.bookingId);
  if (!booking) return res.status(404).json({ message: "Booking not found" });
  if (!booking.userId.equals(actorId) && !booking.creatorId.equals(actorId)) return res.status(403).json({ message: "Access denied" });
  if (isTerminalChatBooking(booking.status)) return terminalChatReadOnly(res);

  const existingReaction = chat.reactions.find(
    (reaction) => reaction.userId.toString() === actorId.toString(),
  );

  if (!existingReaction) {
    chat.reactions.push({
      userId: actorId,
      emoji,
    } as any);
  } else if (existingReaction.emoji === emoji) {
    chat.reactions = chat.reactions.filter(
      (reaction) => reaction.userId.toString() !== actorId.toString(),
    );
  } else {
    existingReaction.emoji = emoji;
  }

  await chat.save();

  getIo().to(`booking:${chat.bookingId}`).emit("chat:reaction", {
    bookingId: chat.bookingId,
    messageId: chat._id,
    reactions: chat.reactions,
  });

  return res.status(200).json({
    message: "Reaction updated",
    reactions: chat.reactions,
  });
};

/* ======================================================
   GET CHAT HISTORY (UNCHANGED)
====================================================== */
export const getChatHistory = async (req: Request, res: Response) => {
  const user = req.user;
  const { bookingId } = req.params;

  if (!user) return res.status(401).json({ message: "Unauthorized" });

  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    return res.status(400).json({ message: "Invalid bookingId" });
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    return res.status(404).json({ message: "Booking not found" });
  }

  const actorId = new mongoose.Types.ObjectId(user.id);

  if (!booking.userId.equals(actorId) && !booking.creatorId.equals(actorId)) {
    return res.status(403).json({ message: "Access denied" });
  }

  const chats = await Chat.find({ bookingId }).sort({ createdAt: 1 }).lean();

  return res.status(200).json({ chats });
};

/* ======================================================
   MARK CHAT AS SEEN (UNCHANGED)
====================================================== */
export const markChatAsSeen = async (req: Request, res: Response) => {
  const user = req.user;
  const { bookingId } = req.params;

  if (!user) return res.status(401).json({ message: "Unauthorized" });

  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    return res.status(400).json({ message: "Invalid bookingId" });
  }

  const actorId = new mongoose.Types.ObjectId(user.id);
  const booking = await Booking.findById(bookingId);
  if (!booking) return res.status(404).json({ message: "Booking not found" });
  if (!booking.userId.equals(actorId) && !booking.creatorId.equals(actorId)) return res.status(403).json({ message: "Access denied" });
  if (isTerminalChatBooking(booking.status)) return terminalChatReadOnly(res);

  await Chat.updateMany(
    { bookingId, seenBy: { $ne: actorId } },
    { $push: { seenBy: actorId } },
  );

  getIo().to(`booking:${bookingId}`).emit("chat:seen", {
    bookingId,
    seenBy: actorId,
  });

  getIo().to(personalRoom(actorId.toString())).emit("chat:conversation-seen", {
    bookingId,
    seenBy: actorId,
  });

  return res.status(200).json({ message: "Messages marked as seen" });
};

/* ======================================================
   GET CONVERSATIONS (UPDATED)
====================================================== */
export const getConversations = async (req: Request, res: Response) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const actorId = new mongoose.Types.ObjectId(user.id);

  /* ======================================================
     GET BOOKINGS
  ====================================================== */

  const bookings = await Booking.find({
    status: { $in: ["CONFIRMED", "CANCELLED", "COMPLETED"] },
    $or: [{ userId: actorId }, { creatorId: actorId }],
  }).lean();

  const bookingIds = bookings.map((b: any) => b._id);

  if (bookingIds.length === 0) {
    return res.status(200).json({
      conversations: [],
    });
  }

  /* ======================================================
     LAST MESSAGE
  ====================================================== */

  const lastMessages = await Chat.aggregate([
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

  const unreadCounts = await Chat.aggregate([
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

  const creatorIds = bookings.map((b: any) => b.creatorId);

  const creators = await CreatorProfile.find({
    userId: { $in: creatorIds },
  }).lean();

  const creatorMap = new Map();

  creators.forEach((c: any) => {
    creatorMap.set(c.userId.toString(), c);
  });

  /* ======================================================
     USER PROFILES
  ====================================================== */

  const userIds = bookings.map((b: any) =>
    typeof b.userId === "object"
      ? b.userId._id.toString()
      : b.userId.toString(),
  );

  const userProfiles = await UserProfile.find({
    userId: { $in: userIds },
  })
    .select("userId username avatar profilePhotos")
    .lean();

  const userProfileMap = new Map();

  userProfiles.forEach((u: any) => {
    userProfileMap.set(u.userId.toString(), u);
  });

  /* ======================================================
   BUILD CONVERSATIONS
====================================================== */

  const conversations = bookings.map((booking: any) => {
    const lastMessage = lastMessageMap.get(booking._id.toString());

    const bookingUserId =
      typeof booking.userId === "object"
        ? booking.userId._id.toString()
        : booking.userId.toString();

    const bookingCreatorId =
      typeof booking.creatorId === "object"
        ? booking.creatorId._id.toString()
        : booking.creatorId.toString();

    const isUser = bookingUserId === actorId.toString();

    const otherUserId = isUser ? bookingCreatorId : bookingUserId;

    const otherUserProfile =
      creatorMap.get(otherUserId) || userProfileMap.get(otherUserId) || null;

    return {
      bookingId: booking._id,

      actorRole: isUser ? "USER" : "CREATOR",

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

  conversations.sort(
    (a: any, b: any) =>
      new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  );

  return res.status(200).json({
    conversations,
  });
};
