"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.systemModeOnly = void 0;
const adminMode_service_1 = require("../services/adminMode.service");
/**
 * Enforces SYSTEM admin mode
 * Used for all /admin/system routes
 */
const systemModeOnly = async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        // Role check (Phase 31 truth)
        if (user.role !== "admin") {
            return res.status(403).json({ message: "Admin access required" });
        }
        const mode = await (0, adminMode_service_1.getAdminMode)(user.id);
        if (mode !== "SYSTEM") {
            return res.status(403).json({
                message: "SYSTEM mode required",
                redirectTo: "/admin/entry",
            });
        }
        next();
    }
    catch (err) {
        return res.status(403).json({
            message: err.message || "SYSTEM mode enforcement failed",
        });
    }
};
exports.systemModeOnly = systemModeOnly;
