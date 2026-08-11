"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminCreatorWithdrawalOperationalController = exports.AdminCreatorWithdrawalOperationalController = void 0;
const mongoose_1 = require("mongoose");
const creatorWithdrawalOperationalAction_enum_1 = require("../enums/financial/creatorWithdrawalOperationalAction.enum");
const creatorWithdrawalOperationalClassification_enum_1 = require("../enums/financial/creatorWithdrawalOperationalClassification.enum");
const creatorWithdrawalOperationalSeverity_enum_1 = require("../enums/financial/creatorWithdrawalOperationalSeverity.enum");
const creatorWithdrawalReconciliationStatus_enum_1 = require("../enums/financial/creatorWithdrawalReconciliationStatus.enum");
const creatorWithdrawalFinalizationRetry_service_1 = require("../services/financial/creatorWithdrawalFinalizationRetry.service");
const creatorWithdrawalReconciliation_service_1 = require("../services/financial/creatorWithdrawalReconciliation.service");
const creatorWithdrawalRepair_service_1 = require("../services/financial/creatorWithdrawalRepair.service");
const object = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
class AdminCreatorWithdrawalOperationalController {
    async inspect(req, res, next) {
        try {
            if (!req.user)
                return res.status(401).json({ success: false,
                    message: "Unauthorized" });
            if (req.body && Object.keys(req.body).length)
                return res.status(400).json({
                    success: false, message: "Request body is not allowed.",
                });
            const data = await creatorWithdrawalReconciliation_service_1.creatorWithdrawalReconciliationService.inspect(req.params.withdrawalReference, req.user.id);
            return res.status(200).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    async list(req, res, next) {
        try {
            if (!req.user)
                return res.status(401).json({ success: false,
                    message: "Unauthorized" });
            const status = typeof req.query.status === "string" &&
                Object.values(creatorWithdrawalReconciliationStatus_enum_1.CreatorWithdrawalReconciliationStatus).includes(req.query.status)
                ? req.query.status : undefined;
            const classification = typeof req.query.classification === "string" &&
                Object.values(creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification).includes(req.query.classification)
                ? req.query.classification : undefined;
            const severity = typeof req.query.severity === "string" &&
                Object.values(creatorWithdrawalOperationalSeverity_enum_1.CreatorWithdrawalOperationalSeverity).includes(req.query.severity)
                ? req.query.severity : undefined;
            if ((req.query.status !== undefined && !status) ||
                (req.query.classification !== undefined && !classification) ||
                (req.query.severity !== undefined && !severity)) {
                return res.status(400).json({ success: false,
                    message: "Invalid reconciliation filter." });
            }
            const creatorReference = typeof req.query.creatorReference === "string"
                ? req.query.creatorReference : undefined;
            if (creatorReference && !mongoose_1.Types.ObjectId.isValid(creatorReference)) {
                return res.status(400).json({ success: false,
                    message: "Invalid Creator reference." });
            }
            const dateFrom = req.query.dateFrom === undefined ? undefined
                : new Date(String(req.query.dateFrom));
            const dateTo = req.query.dateTo === undefined ? undefined
                : new Date(String(req.query.dateTo));
            if ((dateFrom && Number.isNaN(dateFrom.valueOf())) ||
                (dateTo && Number.isNaN(dateTo.valueOf())) ||
                (dateFrom && dateTo && dateFrom > dateTo)) {
                return res.status(400).json({ success: false,
                    message: "Invalid reconciliation date range." });
            }
            const retryReady = req.query.retryReady === undefined ? undefined
                : req.query.retryReady === "true" ? true
                    : req.query.retryReady === "false" ? false : null;
            if (retryReady === null)
                return res.status(400).json({ success: false,
                    message: "Invalid retry-ready filter." });
            const data = await creatorWithdrawalReconciliation_service_1.creatorWithdrawalReconciliationService.list({
                page: req.query.page, limit: req.query.limit, status, classification,
                severity,
                withdrawalReference: typeof req.query.withdrawalReference === "string"
                    ? req.query.withdrawalReference.trim() || undefined : undefined,
                providerRequestReference: typeof req.query.providerRequestReference === "string"
                    ? req.query.providerRequestReference.trim() || undefined : undefined,
                creatorId: creatorReference ? new mongoose_1.Types.ObjectId(creatorReference) : undefined,
                dateFrom, dateTo, retryReady: retryReady ?? undefined,
            });
            return res.status(200).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    async retry(req, res, next) {
        try {
            if (!req.user)
                return res.status(401).json({ success: false,
                    message: "Unauthorized" });
            if (req.body && Object.keys(req.body).length)
                return res.status(400).json({
                    success: false, message: "Request body is not allowed.",
                });
            const data = await creatorWithdrawalFinalizationRetry_service_1.creatorWithdrawalFinalizationRetryService.retry(req.params.reconciliationReference, req.user.id);
            return res.status(200).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    async repair(req, res, next) {
        try {
            if (!req.user)
                return res.status(401).json({ success: false,
                    message: "Unauthorized" });
            if (!object(req.body) || Object.keys(req.body).length !== 1 ||
                ![creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RESTORE_FINALIZATION_LINKS,
                    creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RESTORE_TERMINAL_AUDIT].includes(req.body.action)) {
                return res.status(400).json({ success: false,
                    message: "Invalid withdrawal repair action." });
            }
            const data = await creatorWithdrawalRepair_service_1.creatorWithdrawalRepairService.repair(req.params.reconciliationReference, req.body.action, req.user.id);
            return res.status(200).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    async updateStatus(req, res, next) {
        try {
            if (!req.user)
                return res.status(401).json({ success: false,
                    message: "Unauthorized" });
            if (!object(req.body) || Object.keys(req.body).some((key) => !["action", "resolutionCode", "resolutionNote"].includes(key)) ||
                ![creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.ACKNOWLEDGE, creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RESOLVE].includes(req.body.action) ||
                typeof req.body.resolutionCode !== "string" ||
                !req.body.resolutionCode.trim() ||
                req.body.resolutionCode.trim().length > 100 ||
                (req.body.resolutionNote !== undefined &&
                    (typeof req.body.resolutionNote !== "string" ||
                        req.body.resolutionNote.trim().length > 500))) {
                return res.status(400).json({ success: false,
                    message: "Invalid reconciliation status action." });
            }
            const data = await creatorWithdrawalReconciliation_service_1.creatorWithdrawalReconciliationService.updateStatus({
                reconciliationReference: req.params.reconciliationReference,
                action: req.body.action,
                resolutionCode: req.body.resolutionCode.trim(),
                resolutionNote: typeof req.body.resolutionNote === "string"
                    ? req.body.resolutionNote.trim() || undefined : undefined,
                adminUserId: req.user.id,
            });
            return res.status(200).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.AdminCreatorWithdrawalOperationalController = AdminCreatorWithdrawalOperationalController;
exports.adminCreatorWithdrawalOperationalController = new AdminCreatorWithdrawalOperationalController();
