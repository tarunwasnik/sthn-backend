"use strict";
//backend/src/sockets/chat.socket.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatSocket = void 0;
/**
 * Chat socket handler
 * Each bookingId is a private room
 */
const chatSocket = (io) => {
    io.on("connection", (socket) => {
        socket.on("join-booking", (bookingId) => {
            socket.join(`booking:${bookingId}`);
        });
        socket.on("leave-booking", (bookingId) => {
            socket.leave(`booking:${bookingId}`);
        });
    });
};
exports.chatSocket = chatSocket;
