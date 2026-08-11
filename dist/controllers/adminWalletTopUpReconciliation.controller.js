"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminWalletTopUpReconciliationController = exports.AdminWalletTopUpReconciliationController = void 0;
const walletTopUpOperationalAction_enum_1 = require("../enums/financial/walletTopUpOperationalAction.enum");
const walletTopUpReconciliationClassification_enum_1 = require("../enums/financial/walletTopUpReconciliationClassification.enum");
const walletTopUpReconciliationStatus_enum_1 = require("../enums/financial/walletTopUpReconciliationStatus.enum");
const walletTopUpReconciliationSeverity_enum_1 = require("../enums/financial/walletTopUpReconciliationSeverity.enum");
const walletTopUpReconciliation_service_1 = require("../services/financial/walletTopUpReconciliation.service");
const walletTopUpProviderFailure_service_1 = require("../services/financial/walletTopUpProviderFailure.service");
const walletTopUpRetry_service_1 = require("../services/financial/walletTopUpRetry.service");
const walletTopUpRepair_service_1 = require("../services/financial/walletTopUpRepair.service");
const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
class AdminWalletTopUpReconciliationController {
    async inspect(req, res, next) {
        try {
            if (!req.user)
                return res.status(401).json({ success: false, message: "Unauthorized" });
            const data = await walletTopUpReconciliation_service_1.walletTopUpReconciliationService.inspect(req.params.topUpReference, req.user.id);
            return res.status(200).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    async list(req, res, next) {
        try {
            if (!req.user)
                return res.status(401).json({ success: false, message: "Unauthorized" });
            const status = typeof req.query.status === "string" &&
                Object.values(walletTopUpReconciliationStatus_enum_1.WalletTopUpReconciliationStatus).includes(req.query.status) ? req.query.status : undefined;
            const classification = typeof req.query.classification === "string" &&
                Object.values(walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification).includes(req.query.classification) ? req.query.classification : undefined;
            const severity = typeof req.query.severity === "string" &&
                Object.values(walletTopUpReconciliationSeverity_enum_1.WalletTopUpReconciliationSeverity).includes(req.query.severity) ? req.query.severity : undefined;
            if ((req.query.status !== undefined && !status) ||
                (req.query.classification !== undefined && !classification) ||
                (req.query.severity !== undefined && !severity)) {
                return res.status(400).json({ success: false, message: "Invalid reconciliation filter." });
            }
            const dateFrom = req.query.dateFrom === undefined ? undefined : new Date(String(req.query.dateFrom));
            const dateTo = req.query.dateTo === undefined ? undefined : new Date(String(req.query.dateTo));
            if ((dateFrom && Number.isNaN(dateFrom.valueOf())) ||
                (dateTo && Number.isNaN(dateTo.valueOf())) ||
                (dateFrom && dateTo && dateFrom > dateTo)) {
                return res.status(400).json({ success: false, message: "Invalid reconciliation date range." });
            }
            const data = await walletTopUpReconciliation_service_1.walletTopUpReconciliationService.list({
                page: req.query.page,
                limit: req.query.limit,
                status,
                classification,
                severity,
                topUpReference: typeof req.query.topUpReference === "string"
                    ? req.query.topUpReference.trim() || undefined : undefined,
                providerFundingReference: typeof req.query.providerFundingReference === "string"
                    ? req.query.providerFundingReference.trim() || undefined : undefined,
                dateFrom,
                dateTo,
            });
            return res.status(200).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    async finalizeProviderFailure(req, res, next) {
        try {
            if (!req.user)
                return res.status(401).json({ success: false, message: "Unauthorized" });
            if (req.body && Object.keys(req.body).length) {
                return res.status(400).json({ success: false, message: "Request body is not allowed." });
            }
            const data = await walletTopUpProviderFailure_service_1.walletTopUpProviderFailureService.finalize(req.params.topUpReference, req.user.id);
            return res.status(200).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    async retry(req, res, next) {
        try {
            if (!req.user)
                return res.status(401).json({ success: false, message: "Unauthorized" });
            if (!isObject(req.body) || Object.keys(req.body).some((key) => key !== "action") ||
                ![walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.RETRY_ACCOUNTING, walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.RETRY_COMPLETION]
                    .includes(req.body.action)) {
                return res.status(400).json({ success: false, message: "Invalid retry action." });
            }
            const data = await walletTopUpRetry_service_1.walletTopUpRetryService.retry(req.params.reconciliationReference, req.body.action, req.user.id);
            return res.status(200).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    async repair(req, res, next) {
        try {
            if (!req.user)
                return res.status(401).json({ success: false, message: "Unauthorized" });
            if (!isObject(req.body) || Object.keys(req.body).some((key) => key !== "action") ||
                ![
                    walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.REPAIR_REQUEST_LINKS,
                    walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.REPAIR_LEDGER_LINK,
                    walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.REPAIR_PROJECTION_LINK,
                ].includes(req.body.action)) {
                return res.status(400).json({ success: false, message: "Invalid repair action." });
            }
            const data = await walletTopUpRepair_service_1.walletTopUpRepairService.repair(req.params.reconciliationReference, req.body.action, req.user.id);
            return res.status(200).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    async updateStatus(req, res, next) {
        try {
            if (!req.user)
                return res.status(401).json({ success: false, message: "Unauthorized" });
            if (!isObject(req.body) ||
                Object.keys(req.body).some((key) => !["action", "resolutionCode", "resolutionNote"].includes(key)) ||
                ![walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.ACKNOWLEDGE_CORRUPTION,
                    walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.RESOLVE_RECONCILIATION]
                    .includes(req.body.action) ||
                typeof req.body.resolutionCode !== "string" ||
                !req.body.resolutionCode.trim() || req.body.resolutionCode.trim().length > 100 ||
                (req.body.resolutionNote !== undefined &&
                    (typeof req.body.resolutionNote !== "string" ||
                        req.body.resolutionNote.trim().length > 500))) {
                return res.status(400).json({ success: false, message: "Invalid reconciliation status action." });
            }
            const data = await walletTopUpReconciliation_service_1.walletTopUpReconciliationService.updateStatus({
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
exports.AdminWalletTopUpReconciliationController = AdminWalletTopUpReconciliationController;
exports.adminWalletTopUpReconciliationController = new AdminWalletTopUpReconciliationController();
