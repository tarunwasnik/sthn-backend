// backend/src/sockets/chat.socket.ts

import { Server, Socket } from "socket.io";

/* ======================================================
   ONLINE USERS
   userId -> Set<socketId>
====================================================== */

const onlineUsers = new Map<
  string,
  Set<string>
>();

/* ======================================================
   CHAT SOCKET
====================================================== */

export const chatSocket = (
  io: Server
): void => {

  io.on(
    "connection",
    (socket: Socket) => {

      console.log(
        "🟢 SOCKET CONNECTED:",
        socket.id
      );

      /* ======================================================
         USER ONLINE
      ====================================================== */

      socket.on(
        "user-online",
        (userId: string) => {

          console.log(
            "🟢 USER ONLINE:",
            userId,
            socket.id
          );

          socket.data.userId =
            userId;

          const existingSockets =
            onlineUsers.get(
              userId
            );

          if (
            existingSockets
          ) {

            existingSockets.add(
              socket.id
            );

          } else {

            onlineUsers.set(
              userId,
              new Set([
                socket.id,
              ])
            );

          }

          /* ==========================================
             BROADCAST ONLINE STATUS
          ========================================== */

          io.emit(
            "presence:update",
            {
              userId,
              online: true,
            }
          );

          console.log(
            "ONLINE USERS:",
            Array.from(
              onlineUsers.keys()
            )
          );
        }
      );

      /* ======================================================
         PRESENCE REQUEST
      ====================================================== */

      socket.on(
        "presence:get",
        () => {

          console.log(
            "📡 PRESENCE REQUEST:",
            socket.id
          );

          socket.emit(
            "presence:init",
            Array.from(
              onlineUsers.keys()
            )
          );

        }
      );

      /* ======================================================
         CHAT ROOMS
      ====================================================== */

      socket.on(
        "join-booking",
        (bookingId: string) => {

          console.log(
            "📥 JOIN ROOM:",
            bookingId
          );

          socket.join(
            `booking:${bookingId}`
          );
        }
      );

      socket.on(
        "leave-booking",
        (bookingId: string) => {

          console.log(
            "📤 LEAVE ROOM:",
            bookingId
          );

          socket.leave(
            `booking:${bookingId}`
          );
        }
      );

/* ======================================================
   TYPING
====================================================== */

socket.on(
  "chat:typing",
  ({
    bookingId,
    userId,
  }: {
    bookingId: string;
    userId: string;
  }) => {

    socket.to(
      `booking:${bookingId}`
    ).emit(
      "chat:typing",
      {
        bookingId,
        userId,
      }
    );
  }
);

socket.on(
  "chat:stop-typing",
  ({
    bookingId,
    userId,
  }: {
    bookingId: string;
    userId: string;
  }) => {

    socket.to(
      `booking:${bookingId}`
    ).emit(
      "chat:stop-typing",
      {
        bookingId,
        userId,
      }
    );
  }
);


      /* ======================================================
         DISCONNECT
      ====================================================== */

      socket.on(
        "disconnect",
        () => {

          console.log(
            "🔴 SOCKET DISCONNECTED:",
            socket.id
          );

          const userId =
            socket.data.userId;

          if (!userId) {
            return;
          }

          const sockets =
            onlineUsers.get(
              userId
            );

          if (!sockets) {
            return;
          }

          sockets.delete(
            socket.id
          );

          /* ==========================================
             LAST SOCKET CLOSED
          ========================================== */

          if (
            sockets.size === 0
          ) {

            onlineUsers.delete(
              userId
            );

            console.log(
              "⚫ USER OFFLINE:",
              userId
            );

            io.emit(
              "presence:update",
              {
                userId,
                online: false,
              }
            );
          }

          console.log(
            "ONLINE USERS:",
            Array.from(
              onlineUsers.keys()
            )
          );
        }
      );
    }
  );
};

/* ======================================================
   HELPERS
====================================================== */

export const isUserOnline = (
  userId: string
): boolean => {

  return onlineUsers.has(
    userId
  );
};

export const getOnlineUsers =
  (): string[] => {

    return Array.from(
      onlineUsers.keys()
    );
  };