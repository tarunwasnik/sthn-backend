"use strict";
//backend/src/controllers/operationsBootstrap.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.operationsBootstrapController = void 0;
/**
 * GET /admin/operations/bootstrap
 * Confirms OPERATIONS dashboard access
 */
const operationsBootstrapController = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        return res.status(200).json({
            operationsReady: true,
            version: "v1",
            capabilities: [],
        });
    }
    catch (err) {
        return res.status(500).json({
            message: err.message || "Operations bootstrap failed",
        });
    }
};
exports.operationsBootstrapController = operationsBootstrapController;
