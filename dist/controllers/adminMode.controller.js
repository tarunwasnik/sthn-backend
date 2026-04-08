"use strict";
//backen/src/controllers/adminMode.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.setAdminModeController = exports.getAdminModeController = void 0;
const adminMode_service_1 = require("../services/adminMode.service");
/**
 * GET /admin/mode
 * Returns current admin mode (SYSTEM | OPERATIONS | null)
 */
const getAdminModeController = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const mode = await (0, adminMode_service_1.getAdminMode)(user.id);
        return res.status(200).json({
            mode,
        });
    }
    catch (err) {
        return res.status(403).json({
            message: err.message || "Failed to fetch admin mode",
        });
    }
};
exports.getAdminModeController = getAdminModeController;
/**
 * POST /admin/mode
 * Body: { mode: "SYSTEM" | "OPERATIONS" }
 */
const setAdminModeController = async (req, res) => {
    try {
        const user = req.user;
        const { mode } = req.body;
        if (!user) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        if (!mode) {
            return res.status(400).json({ message: "Mode is required" });
        }
        const savedMode = await (0, adminMode_service_1.setAdminMode)(user.id, mode);
        return res.status(200).json({
            mode: savedMode,
            redirectTo: savedMode === "SYSTEM" ? "/admin/system" : "/admin/operations",
        });
    }
    catch (err) {
        return res.status(403).json({
            message: err.message || "Failed to set admin mode",
        });
    }
};
exports.setAdminModeController = setAdminModeController;
