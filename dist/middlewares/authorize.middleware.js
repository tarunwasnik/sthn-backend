"use strict";
//backend/src/middlewares/authorize.middelware.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorizeRoles = void 0;
const authorizeRoles = (...allowedRoles) => (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ message: "Forbidden" });
    }
    next();
};
exports.authorizeRoles = authorizeRoles;
