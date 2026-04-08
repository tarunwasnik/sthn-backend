"use strict";
// backend/src/middlewares/auth.middleware.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.protect = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = __importDefault(require("../models/User"));
const protect = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Not authorized" });
    }
    const token = authHeader.split(" ")[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        // Always trust DB for authoritative state
        const user = await User_1.default.findById(decoded.id).select("-password");
        if (!user) {
            return res.status(401).json({ message: "User not found" });
        }
        if (user.status === "suspended") {
            return res.status(403).json({
                message: "Account suspended. Contact support.",
            });
        }
        if (user.status === "banned") {
            return res.status(403).json({
                message: "Account permanently banned.",
            });
        }
        // Attach full lifecycle-aware user
        req.user = user;
        next();
    }
    catch (error) {
        return res.status(401).json({ message: "Invalid or expired token" });
    }
};
exports.protect = protect;
