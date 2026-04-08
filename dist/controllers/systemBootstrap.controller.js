"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.systemBootstrapController = void 0;
/**
 * GET /admin/system/bootstrap
 * Confirms SYSTEM dashboard access
 */
const systemBootstrapController = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        return res.status(200).json({
            systemReady: true,
            version: "v1",
            permissions: [],
        });
    }
    catch (err) {
        return res.status(500).json({
            message: err.message || "System bootstrap failed",
        });
    }
};
exports.systemBootstrapController = systemBootstrapController;
