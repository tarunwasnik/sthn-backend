"use strict";
//backend/src/middlewares/adminAsyncHandler.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminAsyncHandler = void 0;
const adminError_1 = require("../utils/adminError");
const adminAsyncHandler = (fn) => async (req, res, next) => {
    try {
        await fn(req, res, next);
    }
    catch (err) {
        res.status(500).json((0, adminError_1.adminError)(err?.message || "Admin dashboard error", "ADMIN_INTERNAL_ERROR"));
    }
};
exports.adminAsyncHandler = adminAsyncHandler;
