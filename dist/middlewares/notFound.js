"use strict";
//backend/src/middlewares/notFound.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFound = void 0;
const notFound = (req, res, next) => {
    res.status(404).json({
        message: `Route not found: ${req.originalUrl}`,
    });
};
exports.notFound = notFound;
