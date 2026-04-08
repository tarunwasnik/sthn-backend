"use strict";
//backend/src/services/softWarning.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitSoftWarning = void 0;
const emitSoftWarning = (io, bookingId, offenderId, severity) => {
    io.to(`booking:${bookingId}`).emit("chat:warning", {
        offenderId,
        severity,
        message: severity === "HIGH"
            ? "Repeated policy violations detected. This conversation is being reviewed."
            : "Please avoid sharing contact information outside the platform.",
    });
};
exports.emitSoftWarning = emitSoftWarning;
