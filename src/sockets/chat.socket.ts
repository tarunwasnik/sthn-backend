//backend/src/sockets/chat.socket.ts


import { Server, Socket } from "socket.io";

/**
 * Chat socket handler
 * Each bookingId is a private room
 */
export const chatSocket = (io: Server): void => {
  io.on("connection", (socket: Socket) => {
    socket.on("join-booking", (bookingId: string) => {
      socket.join(`booking:${bookingId}`);
    });

    socket.on("leave-booking", (bookingId: string) => {
      socket.leave(`booking:${bookingId}`);
    });
  });
};