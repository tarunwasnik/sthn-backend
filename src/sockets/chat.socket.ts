import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { Server, Socket } from "socket.io";

import User from "../models/User";
import { Booking } from "../models/booking.model";
import { Chat } from "../models/chat.model";

interface SocketJwtPayload { id: string; }
type SocketAcknowledgement = (result: { ok: boolean; code?: string }) => void;

const onlineUsers = new Map<string, Set<string>>();
let socketServer: Server | null = null;
const bookingRoom = (bookingId: string) => `booking:${bookingId}`;
export const personalRoom = (userId: string) => `user:${userId}`;

const acknowledge = (callback: unknown, result: { ok: boolean; code?: string }) => {
  if (typeof callback === "function") (callback as SocketAcknowledgement)(result);
};

const isCurrentUserAllowed = async (userId: string): Promise<boolean> => {
  const user = await User.findById(userId).select("status").lean();
  return Boolean(user && user.status !== "suspended" && user.status !== "banned");
};

const participantBooking = async (userId: string, bookingId: unknown) => {
  if (typeof bookingId !== "string" || !mongoose.Types.ObjectId.isValid(bookingId)) return null;
  return Booking.findOne({ _id: bookingId, $or: [{ userId }, { creatorId: userId }] })
    .select("_id status userId creatorId")
    .lean();
};

const canUseBookingRoom = async (
  socket: Socket,
  bookingId: unknown,
  options: { requireJoinedRoom?: boolean; rejectTerminal?: boolean } = {},
) => {
  const userId = socket.data.userId as string | undefined;
  if (!userId || !(await isCurrentUserAllowed(userId))) return null;
  const booking = await participantBooking(userId, bookingId);
  if (!booking) return null;
  const id = String(booking._id);
  if (options.requireJoinedRoom && !socket.rooms.has(bookingRoom(id))) return null;
  if (options.rejectTerminal && (booking.status === "CANCELLED" || booking.status === "COMPLETED")) return null;
  return { booking, bookingId: id, userId };
};

const participantBookings = (userId: string) => Booking.find({
  $or: [{ userId }, { creatorId: userId }],
}).select("_id userId creatorId").lean();

const emitPresenceForUser = async (io: Server, userId: string, online: boolean) => {
  const bookings = await participantBookings(userId);
  for (const booking of bookings) {
    io.to(bookingRoom(String(booking._id))).emit("presence:update", { userId, online });
  }
};

export const chatSocket = (io: Server): void => {
  socketServer = io;

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string" || !token) return next(new Error("Unauthorized"));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as SocketJwtPayload;
      if (!decoded.id || !mongoose.Types.ObjectId.isValid(decoded.id)) return next(new Error("Unauthorized"));
      const user = await User.findById(decoded.id).select("_id status").lean();
      if (!user || user.status === "suspended" || user.status === "banned") return next(new Error("Unauthorized"));
      socket.data.userId = String(user._id);
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const userId = socket.data.userId as string;
    // Personal-room membership is derived only from the verified socket
    // identity established by the authentication middleware.
    socket.join(personalRoom(userId));
    const existingSockets = onlineUsers.get(userId);
    const becameOnline = !existingSockets;
    if (existingSockets) existingSockets.add(socket.id);
    else onlineUsers.set(userId, new Set([socket.id]));
    if (becameOnline) void emitPresenceForUser(io, userId, true);

    socket.on("presence:get", async () => {
      if (!(await isCurrentUserAllowed(userId))) return;
      const bookings = await participantBookings(userId);
      const visibleOnlineUsers = new Set<string>();
      for (const booking of bookings) {
        const counterpartId = String(booking.userId) === userId ? String(booking.creatorId) : String(booking.userId);
        if (onlineUsers.has(counterpartId)) visibleOnlineUsers.add(counterpartId);
      }
      socket.emit("presence:init", [...visibleOnlineUsers]);
    });

    socket.on("join-booking", async (bookingId: unknown, callback?: SocketAcknowledgement) => {
      const authorized = await canUseBookingRoom(socket, bookingId);
      if (!authorized) return acknowledge(callback, { ok: false, code: "ACCESS_DENIED" });
      socket.join(bookingRoom(authorized.bookingId));
      acknowledge(callback, { ok: true });
    });

    socket.on("leave-booking", (bookingId: unknown, callback?: SocketAcknowledgement) => {
      if (typeof bookingId !== "string" || !mongoose.Types.ObjectId.isValid(bookingId)) {
        return acknowledge(callback, { ok: false, code: "INVALID_BOOKING" });
      }
      socket.leave(bookingRoom(bookingId));
      acknowledge(callback, { ok: true });
    });

    const relayTyping = async (bookingId: unknown, event: "chat:typing" | "chat:stop-typing") => {
      const authorized = await canUseBookingRoom(socket, bookingId, { requireJoinedRoom: true, rejectTerminal: true });
      if (!authorized) return;
      socket.to(bookingRoom(authorized.bookingId)).emit(event, {
        bookingId: authorized.bookingId,
        userId: authorized.userId,
      });
    };

    socket.on("chat:typing", async (payload: { bookingId?: unknown } = {}) => relayTyping(payload.bookingId, "chat:typing"));
    socket.on("chat:stop-typing", async (payload: { bookingId?: unknown } = {}) => relayTyping(payload.bookingId, "chat:stop-typing"));

    socket.on("chat:delivered", async (payload: { bookingId?: unknown; messageId?: unknown } = {}) => {
      const authorized = await canUseBookingRoom(socket, payload.bookingId, { requireJoinedRoom: true, rejectTerminal: true });
      if (!authorized || typeof payload.messageId !== "string" || !mongoose.Types.ObjectId.isValid(payload.messageId)) return;
      const message = await Chat.exists({ _id: payload.messageId, bookingId: authorized.bookingId });
      if (!message) return;
      socket.to(bookingRoom(authorized.bookingId)).emit("chat:delivered", {
        bookingId: authorized.bookingId,
        messageId: payload.messageId,
        userId: authorized.userId,
      });
    });

    socket.on("disconnect", () => {
      const sockets = onlineUsers.get(userId);
      if (!sockets) return;
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        onlineUsers.delete(userId);
        void emitPresenceForUser(io, userId, false);
      }
    });
  });
};

export const isUserOnline = (userId: string): boolean => onlineUsers.has(userId);
export const getOnlineUsers = (): string[] => Array.from(onlineUsers.keys());

export const emitIdentityChanged = (userId: string, payload: Record<string, unknown> = {}): void => {
  if (!socketServer) return;
  const sockets = onlineUsers.get(userId);
  if (!sockets) return;
  for (const socketId of sockets) {
    socketServer.to(socketId).emit("identity:changed", { userId, timestamp: Date.now(), ...payload });
  }
};
