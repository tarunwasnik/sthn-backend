"use strict";
//backend/src/middlewares/operationsMode.middleware.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.operationsModeOnly = void 0;
const adminMode_service_1 = require("../services/adminMode.service");
/**
 * Enforces OPERATIONS admin mode
 * Used for all /admin/operations routes
 */
const operationsModeOnly = async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        // Phase 31 truth
        if (user.role !== "admin") {
            return res.status(403).json({ message: "Admin access required" });
        }
        const mode = await (0, adminMode_service_1.getAdminMode)(user.id);
        if (mode !== "OPERATIONS") {
            return res.status(403).json({
                message: "OPERATIONS mode required",
                redirectTo: "/admin/entry",
            });
        }
        next();
    }
    catch (err) {
        return res.status(403).json({
            message: err.message || "OPERATIONS mode enforcement failed",
        });
    }
};
exports.operationsModeOnly = operationsModeOnly;
