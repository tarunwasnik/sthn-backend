"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminWalletConversionOperationalController = exports.AdminWalletConversionOperationalController = void 0;
const walletConversionRepairAction_enum_1 = require("../enums/financial/walletConversionRepairAction.enum");
const WalletConversionOperationalError_1 = require("../errors/financial/WalletConversionOperationalError");
const walletConversionReconciliation_repository_1 = require("../repositories/walletConversionReconciliation.repository");
const walletConversionReconciliation_service_1 = require("../services/financial/walletConversionReconciliation.service");
const walletConversionRepair_service_1 = require("../services/financial/walletConversionRepair.service");
const walletConversionRetry_service_1 = require("../services/financial/walletConversionRetry.service");
const empty = (body) => body === undefined ||
    (typeof body === "object" && body !== null && !Array.isArray(body) &&
        Object.keys(body).length === 0);
class AdminWalletConversionOperationalController {
    async conversionReference(reconciliationReference) {
        const authority = await walletConversionReconciliation_repository_1.walletConversionReconciliationRepository
            .findByReference(reconciliationReference);
        if (!authority)
            throw new WalletConversionOperationalError_1.WalletConversionOperationalError("Wallet conversion reconciliation was not found.", "WALLET_CONVERSION_OPERATIONAL_RECONCILIATION_NOT_FOUND");
        return authority.conversionReference;
    }
    async reconcile(req, res, next) {
        try {
            if (!req.user)
                return void res.status(401).json({ success: false,
                    message: "Unauthorized" });
            if (!empty(req.body))
                return void res.status(400).json({ success: false,
                    message: "Reconciliation request body is not allowed." });
            const data = await walletConversionReconciliation_service_1.walletConversionReconciliationService.reconcile(req.params.conversionReference, req.user.id);
            res.json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    async retry(req, res, next) {
        try {
            if (!req.user)
                return void res.status(401).json({ success: false,
                    message: "Unauthorized" });
            if (!empty(req.body))
                return void res.status(400).json({ success: false,
                    message: "Retry request body is not allowed." });
            const reference = await this.conversionReference(req.params.reconciliationReference);
            const data = await walletConversionRetry_service_1.walletConversionRetryService.retry(reference, req.user.id);
            res.json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    async repair(req, res, next) {
        try {
            if (!req.user)
                return void res.status(401).json({ success: false,
                    message: "Unauthorized" });
            if (typeof req.body !== "object" || req.body === null ||
                Array.isArray(req.body) || Object.keys(req.body).length !== 1 ||
                !Object.values(walletConversionRepairAction_enum_1.WalletConversionRepairAction).includes(req.body.action)) {
                return void res.status(400).json({ success: false,
                    message: "Invalid Wallet conversion repair action." });
            }
            const reference = await this.conversionReference(req.params.reconciliationReference);
            const data = await walletConversionRepair_service_1.walletConversionRepairService.repair(reference, req.body.action, req.user.id);
            res.json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.AdminWalletConversionOperationalController = AdminWalletConversionOperationalController;
exports.adminWalletConversionOperationalController = new AdminWalletConversionOperationalController();
