"use strict";
//backend/src/middlewares/errorHandler.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const errorHandler = (err, req, res, next) => {
    console.error("🔥 GLOBAL ERROR HANDLER HIT 🔥");
    console.error("Error message:", err.message);
    console.error("Full error:", err);
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode).json({
        message: err.message || "Server error",
    });
};
exports.errorHandler = errorHandler;
