//backend/src/services/softWarning.service.ts

import { Server } from "socket.io";

export const emitSoftWarning = (
  io: Server,
  bookingId: string,
  offenderId: string,
  severity: "LOW" | "MEDIUM" | "HIGH"
) => {
  io.to(`booking:${bookingId}`).emit("chat:warning", {
    offenderId,
    severity,
    message:
      severity === "HIGH"
        ? "Repeated policy violations detected. This conversation is being reviewed."
        : "Please avoid sharing contact information outside the platform.",
  });
};