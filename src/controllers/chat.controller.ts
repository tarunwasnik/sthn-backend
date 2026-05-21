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
import { io } from "../server";

/* ======================================================
   SEND MESSAGE (UPDATED WITH TIME CHECK)
====================================================== */
export const sendMessage = async (
  req: Request,
  res: Response
) => {
  const user = req.user;
  const { bookingId } = req.params;
  const { message } = req.body;

  if (!user) return res.status(401).json({ message: "Unauthorized" });

  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    return res.status(400).json({ message: "Invalid bookingId" });
  }

  if (!message || !message.trim()) {
    return res.status(400).json({ message: "Message cannot be empty" });
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

  if (booking.status !== "CONFIRMED") {
    return res.status(400).json({
      message: "Chat allowed only for confirmed bookings",
    });
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
    ...slots.map((s) => new Date(s.endTime).getTime())
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

  const moderation = await moderateMessage(message);

  let abuseScore: number = 0;

  if (moderation.hasContactIntent) {
    abuseScore = await applyAbuseScore(
      isUser ? booking.userId : booking.creatorId,
      booking.hasInteracted
        ? "USER_CANCEL_AFTER_INTERACTION"
        : "USER_CANCEL_EARLY"
    );
  }

  const severityResult = classifySeverity(
    moderation.flags,
    abuseScore
  );

  if (severityResult.severity !== "LOW") {
    emitSoftWarning(
      io,
      bookingId,
      actorId.toString(),
      severityResult.severity
    );
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
    message,
    seenBy: [actorId],
    aiFlags: moderation.flags,
  });

  if (moderationQueueId) {
    await ModerationQueue.findByIdAndUpdate(
      moderationQueueId,
      { chatId: chat._id }
    );
  }

  io.to(`booking:${bookingId}`).emit("chat:message", {
    _id: chat._id,
    bookingId: chat.bookingId,
    senderId: chat.senderId,
    senderRole: chat.senderRole,
    message: chat.message,
    createdAt: chat.createdAt,
  });

  return res.status(201).json({ chat });
};

/* ======================================================
   GET CHAT HISTORY (UNCHANGED)
====================================================== */
export const getChatHistory = async (
  req: Request,
  res: Response
) => {
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

  if (
    !booking.userId.equals(actorId) &&
    !booking.creatorId.equals(actorId)
  ) {
    return res.status(403).json({ message: "Access denied" });
  }

  const chats = await Chat.find({ bookingId })
    .sort({ createdAt: 1 })
    .lean();

  return res.status(200).json({ chats });
};

/* ======================================================
   MARK CHAT AS SEEN (UNCHANGED)
====================================================== */
export const markChatAsSeen = async (
  req: Request,
  res: Response
) => {
  const user = req.user;
  const { bookingId } = req.params;

  if (!user) return res.status(401).json({ message: "Unauthorized" });

  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    return res.status(400).json({ message: "Invalid bookingId" });
  }

  const actorId = new mongoose.Types.ObjectId(user.id);

  await Chat.updateMany(
    { bookingId, seenBy: { $ne: actorId } },
    { $push: { seenBy: actorId } }
  );

  io.to(`booking:${bookingId}`).emit("chat:seen", {
    bookingId,
    seenBy: actorId,
  });

  return res
    .status(200)
    .json({ message: "Messages marked as seen" });
};

/* ======================================================
   GET CONVERSATIONS (UPDATED)
====================================================== */
export const getConversations = async (
  req: Request,
  res: Response
) => {
  const user = req.user;

  if (!user) {
    return res
      .status(401)
      .json({ message: "Unauthorized" });
  }

  const actorId = new mongoose.Types.ObjectId(
    user.id
  );

  /* ======================================================
     GET BOOKINGS
  ====================================================== */

  const bookings = await Booking.find({
    status: "CONFIRMED",
    $or: [
      { userId: actorId },
      { creatorId: actorId },
    ],
  })
    .lean();

  const bookingIds = bookings.map(
    (b: any) => b._id
  );

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
    lastMessageMap.set(
      m._id.toString(),
      m
    );
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
    unreadMap.set(
      u._id.toString(),
      u.count
    );
  });

  /* ======================================================
     CREATOR PROFILES
  ====================================================== */

  const creatorIds = bookings.map(
    (b: any) => b.creatorId
  );

  const creators = await CreatorProfile.find({
    userId: { $in: creatorIds },
  }).lean();

  const creatorMap = new Map();

  creators.forEach((c: any) => {
    creatorMap.set(
      c.userId.toString(),
      c
    );
  });

  /* ======================================================
     USER PROFILES
  ====================================================== */

  const userIds = bookings.map
    ( (b: any) => 
      typeof b.userId === "object" 
      ? b.userId._id.toString() 
      : b.userId.toString() );

  const userProfiles = await UserProfile.find({
    userId: { $in: userIds },
  }).lean();

  const userProfileMap = new Map();

  userProfiles.forEach((u: any) => {
    userProfileMap.set(
      u.userId.toString(),
      u
    );
  });


/* ======================================================
   BUILD CONVERSATIONS
====================================================== */

const conversations = bookings
  .map((booking: any) => {
    const lastMessage =
      lastMessageMap.get(
        booking._id.toString()
      );

    if (!lastMessage) return null;

    const bookingUserId =
      typeof booking.userId === "object"
        ? booking.userId._id.toString()
        : booking.userId.toString();

    const bookingCreatorId =
      typeof booking.creatorId === "object"
        ? booking.creatorId._id.toString()
        : booking.creatorId.toString();

    const isUser =
      bookingUserId ===
      actorId.toString();

    const otherUserId = isUser
      ? bookingCreatorId
      : bookingUserId;

    /* ======================================================
       SAME STRUCTURE AS MY BOOKINGS
    ====================================================== */

    const otherUserProfile =
      creatorMap.get(otherUserId) ||
      userProfileMap.get(otherUserId) ||
      null;

    return {
  bookingId: booking._id,

  service: {
    _id: booking.serviceId,
    title:
      booking.serviceTitle ||
      "Service",
  },

  lastMessage:
    lastMessage.message,

  lastMessageAt:
    lastMessage.createdAt,

  otherUser: {
    _id: otherUserId,
    profile: otherUserProfile,
  },

  unreadCount:
    unreadMap.get(
      booking._id.toString()
    ) || 0,
};
  })
  .filter(Boolean);

/* ======================================================
   SORT LATEST FIRST
====================================================== */

conversations.sort(
  (a: any, b: any) =>
    new Date(
      b.lastMessageAt
    ).getTime() -
    new Date(
      a.lastMessageAt
    ).getTime()
);

return res.status(200).json({
  conversations,
});

};