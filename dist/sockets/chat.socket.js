"use strict";
// backend/src/sockets/chat.socket.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitIdentityChanged = exports.getOnlineUsers = exports.isUserOnline = exports.chatSocket = void 0;
/* ======================================================
   ONLINE USERS
   userId -> Set<socketId>
====================================================== */
const onlineUsers = new Map();
let socketServer = null;
/* ======================================================
   CHAT SOCKET
====================================================== */
const chatSocket = (io) => {
    socketServer = io;
    io.on("connection", (socket) => {
        console.log("🟢 SOCKET CONNECTED:", socket.id);
        /* ======================================================
             USER ONLINE
          ====================================================== */
        socket.on("user-online", (userId) => {
            console.log("🟢 USER ONLINE:", userId, socket.id);
            socket.data.userId = userId;
            const existingSockets = onlineUsers.get(userId);
            if (existingSockets) {
                existingSockets.add(socket.id);
            }
            else {
                onlineUsers.set(userId, new Set([socket.id]));
            }
            /* ==========================================
                   BROADCAST ONLINE STATUS
                ========================================== */
            io.emit("presence:update", {
                userId,
                online: true,
            });
            console.log("ONLINE USERS:", Array.from(onlineUsers.keys()));
        });
        /* ======================================================
             PRESENCE REQUEST
          ====================================================== */
        socket.on("presence:get", () => {
            console.log("📡 PRESENCE REQUEST:", socket.id);
            socket.emit("presence:init", Array.from(onlineUsers.keys()));
        });
        /* ======================================================
             CHAT ROOMS
          ====================================================== */
        socket.on("join-booking", (bookingId) => {
            console.log("📥 JOIN ROOM:", bookingId);
            socket.join(`booking:${bookingId}`);
        });
        socket.on("leave-booking", (bookingId) => {
            console.log("📤 LEAVE ROOM:", bookingId);
            socket.leave(`booking:${bookingId}`);
        });
        /* ======================================================
       TYPING
    ====================================================== */
        socket.on("chat:typing", ({ bookingId, userId }) => {
            socket.to(`booking:${bookingId}`).emit("chat:typing", {
                bookingId,
                userId,
            });
        });
        socket.on("chat:stop-typing", ({ bookingId, userId }) => {
            socket.to(`booking:${bookingId}`).emit("chat:stop-typing", {
                bookingId,
                userId,
            });
        });
        /* ======================================================
       DELIVERED
    ====================================================== */
        socket.on("chat:delivered", ({ bookingId, messageId, userId, }) => {
            console.log("SERVER DELIVERED", bookingId, messageId, userId);
            io.to(`booking:${bookingId}`).emit("chat:delivered", {
                bookingId,
                messageId,
                userId,
            });
        });
        /* ======================================================
             DISCONNECT
          ====================================================== */
        socket.on("disconnect", () => {
            console.log("🔴 SOCKET DISCONNECTED:", socket.id);
            const userId = socket.data.userId;
            if (!userId) {
                return;
            }
            const sockets = onlineUsers.get(userId);
            if (!sockets) {
                return;
            }
            sockets.delete(socket.id);
            /* ==========================================
                   LAST SOCKET CLOSED
                ========================================== */
            if (sockets.size === 0) {
                onlineUsers.delete(userId);
                console.log("⚫ USER OFFLINE:", userId);
                io.emit("presence:update", {
                    userId,
                    online: false,
                });
            }
            console.log("ONLINE USERS:", Array.from(onlineUsers.keys()));
        });
    });
};
exports.chatSocket = chatSocket;
/* ======================================================
   HELPERS
====================================================== */
const isUserOnline = (userId) => {
    return onlineUsers.has(userId);
};
exports.isUserOnline = isUserOnline;
const getOnlineUsers = () => {
    return Array.from(onlineUsers.keys());
};
exports.getOnlineUsers = getOnlineUsers;
const emitIdentityChanged = (userId, payload = {}) => {
    if (!socketServer)
        return;
    const sockets = onlineUsers.get(userId);
    if (!sockets)
        return;
    for (const socketId of sockets) {
        socketServer.to(socketId).emit("identity:changed", {
            userId,
            timestamp: Date.now(),
            ...payload,
        });
    }
};
exports.emitIdentityChanged = emitIdentityChanged;
