"use strict";
//backend/src/controllers/controlPlane.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ControlPlaneController = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const controlPlane_repository_1 = require("../services/controlPlane/controlPlane.repository");
const controlPlane_service_1 = require("../services/controlPlane/controlPlane.service");
const auditLog_model_1 = require("../models/auditLog.model");
class ControlPlaneController {
    /**
     * List active controls
     */
    static async listActiveControls(req, res) {
        const controls = await controlPlane_service_1.ControlPlaneService.listActiveControls();
        res.status(200).json({ data: controls });
    }
    /**
     * Create a control plane rule
     */
    static async createControl(req, res) {
        const { scope, target, enforcement, reason, expiresAt, } = req.body;
        const admin = req.admin;
        const isDryRun = req.headers["x-dry-run"] === "true";
        if (!admin) {
            return res.status(401).json({ error: "Admin context missing" });
        }
        if (isDryRun) {
            return res.status(200).json({
                dryRun: true,
                preview: {
                    scope,
                    target: target ?? null,
                    enforcement,
                    reason,
                    expiresAt,
                },
            });
        }
        const control = await controlPlane_repository_1.ControlPlaneRepository.createControl({
            scope,
            target: target ?? null,
            enforcement,
            reason,
            expiresAt,
            isActive: true,
            createdBy: {
                adminId: admin.id,
                email: admin.email,
            },
        });
        await auditLog_model_1.AuditLog.create({
            actorId: new mongoose_1.default.Types.ObjectId(admin.id),
            actorType: "ADMIN",
            action: "CONTROL_PLANE_CREATE",
            entityType: "CONTROL_PLANE",
            entityId: new mongoose_1.default.Types.ObjectId(control.id),
            after: {
                scope,
                target: target ?? null,
                enforcement,
                reason,
                expiresAt,
                isActive: true,
            },
        });
        res.status(201).json({ data: control });
    }
    /**
     * Deactivate a control plane rule
     */
    static async deactivateControl(req, res) {
        const { controlId } = req.params;
        const admin = req.admin;
        if (!admin) {
            return res.status(401).json({ error: "Admin context missing" });
        }
        await controlPlane_repository_1.ControlPlaneRepository.deactivateControl(controlId);
        await auditLog_model_1.AuditLog.create({
            actorId: new mongoose_1.default.Types.ObjectId(admin.id),
            actorType: "ADMIN",
            action: "CONTROL_PLANE_DEACTIVATE",
            entityType: "CONTROL_PLANE",
            entityId: new mongoose_1.default.Types.ObjectId(controlId),
            before: {
                isActive: true,
            },
            after: {
                isActive: false,
            },
        });
        res.status(200).json({ success: true });
    }
}
exports.ControlPlaneController = ControlPlaneController;
