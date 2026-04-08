"use strict";
//backend/src/middlewares/role.middleware.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = void 0;
const requireRole = (role) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: "Not authenticated" });
        }
        if (req.user.role !== role) {
            return res.status(403).json({ message: "Access denied" });
        }
        next();
    };
};
exports.requireRole = requireRole;
