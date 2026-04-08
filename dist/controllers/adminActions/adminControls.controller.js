"use strict";
//backend/src/controllers/adminActions/adminControls.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.expireControl = exports.createControl = exports.previewControlDecision = exports.getControlById = exports.getControlHistory = exports.getActiveControls = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const adminAsyncHandler_1 = require("../../middlewares/adminAsyncHandler");
const adminResponse_1 = require("../../utils/adminResponse");
const adminControl_model_1 = require("../../models/adminControl.model");
const adminActionLog_model_1 = __importDefault(require("../../models/adminActionLog.model"));
const adminControlEvaluator_1 = require("../../utils/adminControlEvaluator");
/**
 * ---------------------------------------------
 * GET /admin/actions/controls/active
 * ---------------------------------------------
 */
exports.getActiveControls = (0, adminAsyncHandler_1.adminAsyncHandler)(async (_req, res) => {
    const now = new Date();
    const controls = await adminControl_model_1.AdminControl.find({
        $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
    }).sort({ createdAt: -1 });
    res.json((0, adminResponse_1.adminResponse)({ data: controls }));
});
/**
 * ---------------------------------------------
 * GET /admin/actions/controls/history
 * ---------------------------------------------
 */
exports.getControlHistory = (0, adminAsyncHandler_1.adminAsyncHandler)(async (req, res) => {
    const { scope, createdBy, from, to } = req.query;
    const filter = {};
    if (scope)
        filter.scope = scope;
    if (createdBy) {
        if (!mongoose_1.default.Types.ObjectId.isValid(createdBy)) {
            throw new Error("Invalid createdBy id");
        }
        filter.createdBy = new mongoose_1.default.Types.ObjectId(createdBy);
    }
    if (from || to) {
        filter.createdAt = {};
        if (from) {
            const d = new Date(from);
            if (Number.isNaN(d.getTime()))
                throw new Error("Invalid from date");
            filter.createdAt.$gte = d;
        }
        if (to) {
            const d = new Date(to);
            if (Number.isNaN(d.getTime()))
                throw new Error("Invalid to date");
            filter.createdAt.$lte = d;
        }
    }
    const controls = await adminControl_model_1.AdminControl.find(filter).sort({ createdAt: -1 });
    res.json((0, adminResponse_1.adminResponse)({ data: controls }));
});
/**
 * ---------------------------------------------
 * GET /admin/actions/controls/:id
 * ---------------------------------------------
 */
exports.getControlById = (0, adminAsyncHandler_1.adminAsyncHandler)(async (req, res) => {
    const { id } = req.params;
    if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
        throw new Error("Invalid control id");
    }
    const control = await adminControl_model_1.AdminControl.findById(id);
    if (!control) {
        throw new Error("Control not found");
    }
    res.json((0, adminResponse_1.adminResponse)({ data: control }));
});
/**
 * ---------------------------------------------
 * POST /admin/actions/controls/preview
 * ---------------------------------------------
 *
 * Phase 30 – Option B
 * Live control effectiveness preview.
 *
 * Read-only.
 * Uses the same evaluator as dispatcher.
 */
exports.previewControlDecision = (0, adminAsyncHandler_1.adminAsyncHandler)(async (req, res) => {
    const { actionKey, riskLevel, dryRun } = req.body;
    if (!actionKey) {
        throw new Error("actionKey is required");
    }
    if (!riskLevel ||
        !["low", "medium", "high", "critical"].includes(riskLevel)) {
        throw new Error("Invalid riskLevel");
    }
    const activeControls = await adminControl_model_1.AdminControl.find({});
    const decision = (0, adminControlEvaluator_1.evaluateAdminControls)(activeControls, {
        actionKey,
        riskLevel,
        dryRun: !!dryRun,
    });
    res.json((0, adminResponse_1.adminResponse)({
        data: decision,
    }));
});
/**
 * ---------------------------------------------
 * POST /admin/actions/controls
 * ---------------------------------------------
 */
exports.createControl = (0, adminAsyncHandler_1.adminAsyncHandler)(async (req, res) => {
    const adminId = req.user.id;
    const { scope, mode, actionKey, appliesTo, expiresAt, reason } = req.body;
    const now = new Date();
    const allowedScopes = ["GLOBAL", "ACTION", "EMERGENCY"];
    if (!allowedScopes.includes(scope)) {
        throw new Error("Invalid control scope");
    }
    if (!mode)
        throw new Error("mode is required");
    if (!reason || typeof reason !== "string" || !reason.trim()) {
        throw new Error("reason is required");
    }
    if (scope === "GLOBAL") {
        if (actionKey || appliesTo) {
            throw new Error("GLOBAL controls must not define actionKey or appliesTo");
        }
    }
    if (scope === "ACTION") {
        if (!actionKey) {
            throw new Error("actionKey is required for ACTION scope");
        }
        if (appliesTo) {
            throw new Error("ACTION controls must not define appliesTo");
        }
    }
    if (scope === "EMERGENCY") {
        if (!appliesTo) {
            throw new Error("appliesTo is required for EMERGENCY scope");
        }
        if (actionKey) {
            throw new Error("EMERGENCY controls must not define actionKey");
        }
        if (!expiresAt) {
            throw new Error("EMERGENCY controls must define expiresAt");
        }
    }
    let parsedExpiresAt;
    if (expiresAt) {
        parsedExpiresAt = new Date(expiresAt);
        if (Number.isNaN(parsedExpiresAt.getTime())) {
            throw new Error("expiresAt is invalid");
        }
        if (parsedExpiresAt <= now) {
            throw new Error("expiresAt must be in the future");
        }
        const MAX_CONTROL_TTL_DAYS = 7;
        const maxExpiry = new Date(now.getTime() + MAX_CONTROL_TTL_DAYS * 24 * 60 * 60 * 1000);
        if (parsedExpiresAt > maxExpiry) {
            throw new Error(`expiresAt exceeds maximum allowed TTL of ${MAX_CONTROL_TTL_DAYS} days`);
        }
    }
    if (scope === "EMERGENCY") {
        const existing = await adminControl_model_1.AdminControl.findOne({
            scope: "EMERGENCY",
            appliesTo,
            $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
        });
        if (existing) {
            throw new Error("An active emergency control already exists for this scope");
        }
    }
    let control;
    try {
        control = await adminControl_model_1.AdminControl.create({
            scope,
            mode,
            actionKey,
            appliesTo,
            expiresAt: parsedExpiresAt,
            reason: reason.trim(),
            createdBy: adminId,
        });
        await adminActionLog_model_1.default.create({
            adminId: new mongoose_1.default.Types.ObjectId(adminId),
            actionKey: "ADMIN_CONTROL_CREATE",
            actionLabel: "Create admin control",
            actionVersion: 1,
            targetType: "AdminControl",
            targetId: control._id,
            params: {
                scope,
                mode,
                actionKey,
                appliesTo,
                expiresAt: parsedExpiresAt,
            },
            reason: reason.trim(),
            status: "SUCCESS",
            result: { controlId: control._id },
        });
    }
    catch (err) {
        await adminActionLog_model_1.default.create({
            adminId: new mongoose_1.default.Types.ObjectId(adminId),
            actionKey: "ADMIN_CONTROL_CREATE",
            actionLabel: "Create admin control",
            actionVersion: 1,
            targetType: "AdminControl",
            targetId: new mongoose_1.default.Types.ObjectId(adminId),
            params: {
                scope,
                mode,
                actionKey,
                appliesTo,
                expiresAt: parsedExpiresAt,
                targetCreated: false,
            },
            reason: reason?.toString?.() || "",
            status: "FAILED",
            error: {
                message: err.message,
                stack: err.stack,
            },
        });
        throw err;
    }
    res.json((0, adminResponse_1.adminResponse)({ data: control }));
});
/**
 * ---------------------------------------------
 * POST /admin/actions/controls/:id/expire
 * ---------------------------------------------
 */
exports.expireControl = (0, adminAsyncHandler_1.adminAsyncHandler)(async (req, res) => {
    const adminId = req.user.id;
    const { id } = req.params;
    if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
        throw new Error("Invalid control id");
    }
    const now = new Date();
    let control;
    try {
        control = await adminControl_model_1.AdminControl.findOneAndUpdate({
            _id: id,
            $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
        }, {
            $set: { expiresAt: now },
        }, { new: true });
        if (!control) {
            throw new Error("Control already expired or does not exist");
        }
        await adminActionLog_model_1.default.create({
            adminId: new mongoose_1.default.Types.ObjectId(adminId),
            actionKey: "ADMIN_CONTROL_EXPIRE",
            actionLabel: "Expire admin control",
            actionVersion: 1,
            targetType: "AdminControl",
            targetId: new mongoose_1.default.Types.ObjectId(id),
            params: {},
            reason: "Expired via admin UX",
            status: "SUCCESS",
            result: { expiredAt: now },
        });
    }
    catch (err) {
        await adminActionLog_model_1.default.create({
            adminId: new mongoose_1.default.Types.ObjectId(adminId),
            actionKey: "ADMIN_CONTROL_EXPIRE",
            actionLabel: "Expire admin control",
            actionVersion: 1,
            targetType: "AdminControl",
            targetId: new mongoose_1.default.Types.ObjectId(id),
            params: {},
            reason: "Expired via admin UX",
            status: "FAILED",
            error: {
                message: err.message,
                stack: err.stack,
            },
        });
        throw err;
    }
    res.json((0, adminResponse_1.adminResponse)({ data: control }));
});
