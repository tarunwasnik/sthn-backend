"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletConversionReconciliationService = exports.WalletConversionReconciliationService = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const walletConversionOperational_response_dto_1 = require("../../dtos/wallet/walletConversionOperational.response.dto");
const walletConversionAuditAction_enum_1 = require("../../enums/financial/walletConversionAuditAction.enum");
const walletConversionOperationalClassification_enum_1 = require("../../enums/financial/walletConversionOperationalClassification.enum");
const walletConversionOperationalIssue_enum_1 = require("../../enums/financial/walletConversionOperationalIssue.enum");
const walletConversionRepairAction_enum_1 = require("../../enums/financial/walletConversionRepairAction.enum");
const walletConversionRequestStatus_enum_1 = require("../../enums/financial/walletConversionRequestStatus.enum");
const WalletConversionOperationalError_1 = require("../../errors/financial/WalletConversionOperationalError");
const walletConversionAudit_model_1 = require("../../models/walletConversionAudit.model");
const walletConversionAudit_repository_1 = require("../../repositories/walletConversionAudit.repository");
const walletConversionReconciliation_repository_1 = require("../../repositories/walletConversionReconciliation.repository");
const idempotency_util_1 = require("../../utils/financial/idempotency.util");
const walletConversionOperationalIdentity_util_1 = require("../../utils/financial/walletConversionOperationalIdentity.util");
const walletConversionOperationalInspection_service_1 = require("./walletConversionOperationalInspection.service");
class WalletConversionReconciliationService {
    constructor(options = {}) {
        this.options = options;
        this.now = options.now ?? (() => new Date());
    }
    async inject(stage) {
        await this.options.failureInjector?.(stage);
    }
    allowedActions(inspection, authority) {
        if (authority.retryPerformed || authority.repairPerformed)
            return [];
        const only = (issue) => inspection.issues.length === 1 &&
            inspection.issues[0] === issue;
        if (inspection.classification === walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.REPLAY_REQUIRED &&
            inspection.request.status === walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.APPROVED &&
            inspection.graph && inspection.request.accountingReference &&
            inspection.request.accountingTransactionReference &&
            inspection.request.completedAt &&
            only(walletConversionOperationalIssue_enum_1.WalletConversionOperationalIssue.ACCOUNTING_COMPLETION_REPLAY_REQUIRED))
            return ["RETRY"];
        if (inspection.request.status !== walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.COMPLETED ||
            !inspection.graph)
            return [];
        if (inspection.classification === walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.MISSING_AUDIT &&
            only(walletConversionOperationalIssue_enum_1.WalletConversionOperationalIssue.TERMINAL_AUDIT_MISSING)) {
            return [walletConversionRepairAction_enum_1.WalletConversionRepairAction.RESTORE_MISSING_AUDIT];
        }
        if (inspection.classification !== walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.REPLAY_REQUIRED)
            return [];
        if (only(walletConversionOperationalIssue_enum_1.WalletConversionOperationalIssue.LEDGER_REFERENCES_MISSING)) {
            return [walletConversionRepairAction_enum_1.WalletConversionRepairAction.RESTORE_LEDGER_REFERENCES];
        }
        if (only(walletConversionOperationalIssue_enum_1.WalletConversionOperationalIssue.PROJECTION_REFERENCES_MISSING)) {
            return [walletConversionRepairAction_enum_1.WalletConversionRepairAction.RESTORE_PROJECTION_REFERENCES];
        }
        if (only(walletConversionOperationalIssue_enum_1.WalletConversionOperationalIssue.ACCOUNTING_REFERENCES_MISSING)) {
            return [walletConversionRepairAction_enum_1.WalletConversionRepairAction.RESTORE_ACCOUNTING_REFERENCES];
        }
        return [];
    }
    async reconcile(conversionReference, adminUserId, transactionAttempt = 0) {
        const inspection = await walletConversionOperationalInspection_service_1.walletConversionOperationalInspectionService
            .inspect(conversionReference);
        const identity = (0, walletConversionOperationalIdentity_util_1.deriveWalletConversionReconciliationIdentity)(inspection.request.conversionReference);
        const replay = await walletConversionReconciliation_repository_1.walletConversionReconciliationRepository
            .findByConversionReference(inspection.request.conversionReference);
        const replayAudit = replay ? await walletConversionAudit_model_1.WalletConversionAudit.find({
            conversionReference: inspection.request.conversionReference,
            action: walletConversionAuditAction_enum_1.WalletConversionAuditAction.RECONCILED,
        }).select("+auditKey +adminActorId") : [];
        if (replay && replayAudit.length === 1 &&
            replayAudit[0].reconciliationReference === replay.reconciliationReference &&
            replayAudit[0].adminActorId?.equals(replay.inspectedBy) &&
            replay.classification === inspection.classification &&
            replay.severity === inspection.severity &&
            JSON.stringify(replay.issues) === JSON.stringify(inspection.issues)) {
            return (0, walletConversionOperational_response_dto_1.toWalletConversionOperationalResponseDto)(replay, this.allowedActions(inspection, replay));
        }
        const session = await mongoose_1.default.startSession();
        try {
            let result = null;
            await session.withTransaction(async () => {
                const at = this.now();
                result = await walletConversionReconciliation_repository_1.walletConversionReconciliationRepository.upsertInspection({
                    ...identity,
                    conversionRequestId: inspection.request._id,
                    conversionReference: inspection.request.conversionReference,
                    classification: inspection.classification,
                    severity: inspection.severity, issues: inspection.issues,
                    inspectedBy: new mongoose_1.Types.ObjectId(adminUserId), inspectedAt: at,
                }, session);
                await this.inject("AFTER_RECONCILIATION");
                await this.inject("BEFORE_AUDIT");
                await walletConversionAudit_repository_1.walletConversionAuditRepository.createOnce({
                    auditKey: (0, idempotency_util_1.createIdempotencyFingerprint)(walletConversionAuditAction_enum_1.WalletConversionAuditAction.RECONCILED, inspection.request.conversionKey),
                    action: walletConversionAuditAction_enum_1.WalletConversionAuditAction.RECONCILED,
                    conversionReference: inspection.request.conversionReference,
                    sourceCurrency: inspection.request.sourceCurrency,
                    targetCurrency: inspection.request.targetCurrency,
                    sourceAmount: inspection.request.sourceAmount,
                    targetAmount: inspection.request.targetAmount,
                    fxSnapshotReference: inspection.request.fxSnapshotReference,
                    fxEffectiveDate: inspection.request.fxEffectiveDate,
                    requestedAt: inspection.request.requestedAt,
                    adminActorId: new mongoose_1.Types.ObjectId(adminUserId),
                    reconciliationReference: identity.reconciliationReference,
                    classification: inspection.classification,
                    severity: inspection.severity, issues: inspection.issues,
                    retryPerformed: false, repairPerformed: false,
                }, session);
                await this.inject("BEFORE_COMMIT");
            });
            if (!result)
                throw new WalletConversionOperationalError_1.WalletConversionOperationalError("Wallet conversion reconciliation did not commit.", "WALLET_CONVERSION_OPERATIONAL_TRANSACTION_CONFLICT");
            return (0, walletConversionOperational_response_dto_1.toWalletConversionOperationalResponseDto)(result, this.allowedActions(inspection, result));
        }
        catch (error) {
            if (error instanceof WalletConversionOperationalError_1.WalletConversionOperationalError)
                throw error;
            if ([11000, 112, 251].includes(error?.code) && transactionAttempt < 5) {
                const winner = await walletConversionReconciliation_repository_1.walletConversionReconciliationRepository
                    .findByConversionReference(inspection.request.conversionReference);
                if (winner)
                    return (0, walletConversionOperational_response_dto_1.toWalletConversionOperationalResponseDto)(winner, this.allowedActions(inspection, winner));
                return this.reconcile(conversionReference, adminUserId, transactionAttempt + 1);
            }
            throw new WalletConversionOperationalError_1.WalletConversionOperationalError("Wallet conversion reconciliation transaction failed.", "WALLET_CONVERSION_OPERATIONAL_TRANSACTION_CONFLICT", error);
        }
        finally {
            await session.endSession();
        }
    }
    async validateReplay(conversionReference) {
        const inspection = await walletConversionOperationalInspection_service_1.walletConversionOperationalInspectionService
            .inspect(conversionReference);
        const authority = await walletConversionReconciliation_repository_1.walletConversionReconciliationRepository
            .findByConversionReference(inspection.request.conversionReference);
        if (!authority)
            throw new WalletConversionOperationalError_1.WalletConversionOperationalError("Wallet conversion reconciliation was not found.", "WALLET_CONVERSION_OPERATIONAL_RECONCILIATION_NOT_FOUND");
        const identity = (0, walletConversionOperationalIdentity_util_1.deriveWalletConversionReconciliationIdentity)(inspection.request.conversionReference);
        const audits = await walletConversionAudit_model_1.WalletConversionAudit.find({
            conversionReference: inspection.request.conversionReference,
            action: walletConversionAuditAction_enum_1.WalletConversionAuditAction.RECONCILED,
        }).select("+auditKey +adminActorId");
        if (authority.reconciliationReference !== identity.reconciliationReference ||
            authority.reconciliationKey !== identity.reconciliationKey ||
            !authority.conversionRequestId.equals(inspection.request._id) ||
            authority.conversionReference !== inspection.request.conversionReference ||
            authority.classification !== inspection.classification ||
            authority.severity !== inspection.severity ||
            JSON.stringify(authority.issues) !== JSON.stringify(inspection.issues) ||
            audits.length !== 1 || audits[0].auditKey !==
            (0, idempotency_util_1.createIdempotencyFingerprint)(walletConversionAuditAction_enum_1.WalletConversionAuditAction.RECONCILED, inspection.request.conversionKey) ||
            audits[0].reconciliationReference !== authority.reconciliationReference ||
            !audits[0].adminActorId?.equals(authority.inspectedBy)) {
            throw new WalletConversionOperationalError_1.WalletConversionOperationalError("Wallet conversion reconciliation replay conflicts.", "WALLET_CONVERSION_OPERATIONAL_REPLAY_CONFLICT");
        }
        return (0, walletConversionOperational_response_dto_1.toWalletConversionOperationalResponseDto)(authority, this.allowedActions(inspection, authority));
    }
}
exports.WalletConversionReconciliationService = WalletConversionReconciliationService;
exports.walletConversionReconciliationService = new WalletConversionReconciliationService();
