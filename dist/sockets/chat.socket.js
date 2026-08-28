"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitIdentityChanged = exports.getOnlineUsers = exports.isUserOnline = exports.chatSocket = exports.personalRoom = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = __importDefault(require("../models/User"));
const booking_model_1 = require("../models/booking.model");
const chat_model_1 = require("../models/chat.model");
const onlineUsers = new Map();
let socketServer = null;
const bookingRoom = (bookingId) => `booking:${bookingId}`;
const personalRoom = (userId) => `user:${userId}`;
exports.personalRoom = personalRoom;
const acknowledge = (callback, result) => {
    if (typeof callback === "function")
        callback(result);
};
const isCurrentUserAllowed = async (userId) => {
    const user = await User_1.default.findById(userId).select("status").lean();
    return Boolean(user && user.status !== "suspended" && user.status !== "banned");
};
const participantBooking = async (userId, bookingId) => {
    if (typeof bookingId !== "string" || !mongoose_1.default.Types.ObjectId.isValid(bookingId))
        return null;
    return booking_model_1.Booking.findOne({ _id: bookingId, $or: [{ userId }, { creatorId: userId }] })
        .select("_id status userId creatorId")
        .lean();
};
const canUseBookingRoom = async (socket, bookingId, options = {}) => {
    const userId = socket.data.userId;
    if (!userId || !(await isCurrentUserAllowed(userId)))
        return null;
    const booking = await participantBooking(userId, bookingId);
    if (!booking)
        return null;
    const id = String(booking._id);
    if (options.requireJoinedRoom && !socket.rooms.has(bookingRoom(id)))
        return null;
    if (options.rejectTerminal && (booking.status === "CANCELLED" || booking.status === "COMPLETED"))
        return null;
    return { booking, bookingId: id, userId };
};
const participantBookings = (userId) => booking_model_1.Booking.find({
    $or: [{ userId }, { creatorId: userId }],
}).select("_id userId creatorId").lean();
const emitPresenceForUser = async (io, userId, online) => {
    const bookings = await participantBookings(userId);
    for (const booking of bookings) {
        io.to(bookingRoom(String(booking._id))).emit("presence:update", { userId, online });
    }
};
const chatSocket = (io) => {
    socketServer = io;
    io.use(async (socket, next) => {
        const token = socket.handshake.auth?.token;
        if (typeof token !== "string" || !token)
            return next(new Error("Unauthorized"));
        try {
            const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
            if (!decoded.id || !mongoose_1.default.Types.ObjectId.isValid(decoded.id))
                return next(new Error("Unauthorized"));
            const user = await User_1.default.findById(decoded.id).select("_id status").lean();
            if (!user || user.status === "suspended" || user.status === "banned")
                return next(new Error("Unauthorized"));
            socket.data.userId = String(user._id);
            next();
        }
        catch {
            next(new Error("Unauthorized"));
        }
    });
    io.on("connection", (socket) => {
        const userId = socket.data.userId;
        // Personal-room membership is derived only from the verified socket
        // identity established by the authentication middleware.
        socket.join((0, exports.personalRoom)(userId));
        const existingSockets = onlineUsers.get(userId);
        const becameOnline = !existingSockets;
        if (existingSockets)
            existingSockets.add(socket.id);
        else
            onlineUsers.set(userId, new Set([socket.id]));
        if (becameOnline)
            void emitPresenceForUser(io, userId, true);
        socket.on("presence:get", async () => {
            if (!(await isCurrentUserAllowed(userId)))
                return;
            const bookings = await participantBookings(userId);
            const visibleOnlineUsers = new Set();
            for (const booking of bookings) {
                const counterpartId = String(booking.userId) === userId ? String(booking.creatorId) : String(booking.userId);
                if (onlineUsers.has(counterpartId))
                    visibleOnlineUsers.add(counterpartId);
            }
            socket.emit("presence:init", [...visibleOnlineUsers]);
        });
        socket.on("join-booking", async (bookingId, callback) => {
            const authorized = await canUseBookingRoom(socket, bookingId);
            if (!authorized)
                return acknowledge(callback, { ok: false, code: "ACCESS_DENIED" });
            socket.join(bookingRoom(authorized.bookingId));
            acknowledge(callback, { ok: true });
        });
        socket.on("leave-booking", (bookingId, callback) => {
            if (typeof bookingId !== "string" || !mongoose_1.default.Types.ObjectId.isValid(bookingId)) {
                return acknowledge(callback, { ok: false, code: "INVALID_BOOKING" });
            }
            socket.leave(bookingRoom(bookingId));
            acknowledge(callback, { ok: true });
        });
        const relayTyping = async (bookingId, event) => {
            const authorized = await canUseBookingRoom(socket, bookingId, { requireJoinedRoom: true, rejectTerminal: true });
            if (!authorized)
                return;
            socket.to(bookingRoom(authorized.bookingId)).emit(event, {
                bookingId: authorized.bookingId,
                userId: authorized.userId,
            });
        };
        socket.on("chat:typing", async (payload = {}) => relayTyping(payload.bookingId, "chat:typing"));
        socket.on("chat:stop-typing", async (payload = {}) => relayTyping(payload.bookingId, "chat:stop-typing"));
        socket.on("chat:delivered", async (payload = {}) => {
            const authorized = await canUseBookingRoom(socket, payload.bookingId, { requireJoinedRoom: true, rejectTerminal: true });
            if (!authorized || typeof payload.messageId !== "string" || !mongoose_1.default.Types.ObjectId.isValid(payload.messageId))
                return;
            const message = await chat_model_1.Chat.exists({ _id: payload.messageId, bookingId: authorized.bookingId });
            if (!message)
                return;
            socket.to(bookingRoom(authorized.bookingId)).emit("chat:delivered", {
                bookingId: authorized.bookingId,
                messageId: payload.messageId,
                userId: authorized.userId,
            });
        });
        socket.on("disconnect", () => {
            const sockets = onlineUsers.get(userId);
            if (!sockets)
                return;
            sockets.delete(socket.id);
            if (sockets.size === 0) {
                onlineUsers.delete(userId);
                void emitPresenceForUser(io, userId, false);
            }
        });
    });
};
exports.chatSocket = chatSocket;
const isUserOnline = (userId) => onlineUsers.has(userId);
exports.isUserOnline = isUserOnline;
const getOnlineUsers = () => Array.from(onlineUsers.keys());
exports.getOnlineUsers = getOnlineUsers;
const emitIdentityChanged = (userId, payload = {}) => {
    if (!socketServer)
        return;
    const sockets = onlineUsers.get(userId);
    if (!sockets)
        return;
    for (const socketId of sockets) {
        socketServer.to(socketId).emit("identity:changed", { userId, timestamp: Date.now(), ...payload });
    }
};
exports.emitIdentityChanged = emitIdentityChanged;
