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
exports.walletConversionRetryService = exports.WalletConversionRetryService = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const walletConversionOperational_response_dto_1 = require("../../dtos/wallet/walletConversionOperational.response.dto");
const walletConversionAuditAction_enum_1 = require("../../enums/financial/walletConversionAuditAction.enum");
const walletConversionOperationalClassification_enum_1 = require("../../enums/financial/walletConversionOperationalClassification.enum");
const walletConversionOperationalSeverity_enum_1 = require("../../enums/financial/walletConversionOperationalSeverity.enum");
const walletConversionRequestStatus_enum_1 = require("../../enums/financial/walletConversionRequestStatus.enum");
const WalletConversionOperationalError_1 = require("../../errors/financial/WalletConversionOperationalError");
const walletConversionAudit_model_1 = require("../../models/walletConversionAudit.model");
const walletConversionAudit_repository_1 = require("../../repositories/walletConversionAudit.repository");
const walletConversionReconciliation_repository_1 = require("../../repositories/walletConversionReconciliation.repository");
const walletConversionRequest_repository_1 = require("../../repositories/walletConversionRequest.repository");
const walletConversionRetryAttempt_repository_1 = require("../../repositories/walletConversionRetryAttempt.repository");
const idempotency_util_1 = require("../../utils/financial/idempotency.util");
const walletConversionOperationalIdentity_util_1 = require("../../utils/financial/walletConversionOperationalIdentity.util");
const walletConversionOperationalInspection_service_1 = require("./walletConversionOperationalInspection.service");
class WalletConversionRetryService {
    constructor(options = {}) {
        this.options = options;
        this.now = options.now ?? (() => new Date());
    }
    async inject(stage) {
        await this.options.failureInjector?.(stage);
    }
    async retry(conversionReference, adminUserId, transactionAttempt = 0) {
        const inspection = await walletConversionOperationalInspection_service_1.walletConversionOperationalInspectionService
            .inspect(conversionReference);
        const reconciliation = await walletConversionReconciliation_repository_1.walletConversionReconciliationRepository
            .findByConversionReference(inspection.request.conversionReference);
        if (!reconciliation)
            throw new WalletConversionOperationalError_1.WalletConversionOperationalError("Wallet conversion reconciliation was not found.", "WALLET_CONVERSION_OPERATIONAL_RECONCILIATION_NOT_FOUND");
        const retryIdentity = (0, walletConversionOperationalIdentity_util_1.deriveWalletConversionRetryIdentity)(inspection.request.conversionReference);
        const existing = await walletConversionRetryAttempt_repository_1.walletConversionRetryAttemptRepository.findByKey(retryIdentity.attemptKey);
        if (existing)
            return this.validateReplay(inspection.request.conversionReference);
        const graph = inspection.graph;
        if (inspection.classification !== walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.REPLAY_REQUIRED ||
            inspection.request.status !== walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.APPROVED ||
            !graph || !inspection.request.accountingReference ||
            !inspection.request.accountingTransactionReference ||
            !inspection.request.completedAt) {
            throw new WalletConversionOperationalError_1.WalletConversionOperationalError("Wallet conversion retry is not allowed.", "WALLET_CONVERSION_OPERATIONAL_RETRY_NOT_ALLOWED");
        }
        const session = await mongoose_1.default.startSession();
        try {
            let result = null;
            await session.withTransaction(async () => {
                const at = this.now();
                const completed = await walletConversionRequest_repository_1.walletConversionRequestRepository
                    .retryCompleteCommittedAccounting({
                    conversionReference: inspection.request.conversionReference,
                    providerExecutionReference: inspection.request.providerExecutionReference,
                    accountingReference: graph.identity.accountingReference,
                    accountingTransactionReference: graph.identity.accountingTransactionReference,
                    completedAt: inspection.request.completedAt, session,
                });
                if (!completed)
                    throw new WalletConversionOperationalError_1.WalletConversionOperationalError("Wallet conversion retry guard conflicted.", "WALLET_CONVERSION_OPERATIONAL_TRANSACTION_CONFLICT");
                await walletConversionRetryAttempt_repository_1.walletConversionRetryAttemptRepository.create({
                    ...retryIdentity,
                    reconciliationReference: reconciliation.reconciliationReference,
                    conversionReference: inspection.request.conversionReference,
                    performedBy: new mongoose_1.Types.ObjectId(adminUserId), status: "APPLIED", at,
                    performedAt: at,
                }, session);
                result = await walletConversionReconciliation_repository_1.walletConversionReconciliationRepository.markRetry({
                    reference: reconciliation.reconciliationReference,
                    expectedClassification: walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.REPLAY_REQUIRED,
                    classification: walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.HEALTHY, severity: walletConversionOperationalSeverity_enum_1.WalletConversionOperationalSeverity.INFO,
                    issues: [], inspectedAt: at,
                }, session);
                if (!result)
                    throw new WalletConversionOperationalError_1.WalletConversionOperationalError("Wallet conversion retry authority conflicted.", "WALLET_CONVERSION_OPERATIONAL_TRANSACTION_CONFLICT");
                await this.inject("AFTER_RETRY");
                await this.inject("BEFORE_AUDIT");
                await walletConversionAudit_repository_1.walletConversionAuditRepository.createOnce({
                    auditKey: (0, idempotency_util_1.createIdempotencyFingerprint)(walletConversionAuditAction_enum_1.WalletConversionAuditAction.RETRY, inspection.request.conversionKey),
                    action: walletConversionAuditAction_enum_1.WalletConversionAuditAction.RETRY,
                    conversionReference: inspection.request.conversionReference,
                    sourceCurrency: inspection.request.sourceCurrency,
                    targetCurrency: inspection.request.targetCurrency,
                    sourceAmount: inspection.request.sourceAmount,
                    targetAmount: inspection.request.targetAmount,
                    fxSnapshotReference: inspection.request.fxSnapshotReference,
                    fxEffectiveDate: inspection.request.fxEffectiveDate,
                    requestedAt: inspection.request.requestedAt,
                    adminActorId: new mongoose_1.Types.ObjectId(adminUserId),
                    reconciliationReference: reconciliation.reconciliationReference,
                    classification: walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.HEALTHY, severity: walletConversionOperationalSeverity_enum_1.WalletConversionOperationalSeverity.INFO,
                    issues: [], retryPerformed: true, repairPerformed: false,
                }, session);
                await this.inject("BEFORE_COMMIT");
            });
            if (!result)
                throw new WalletConversionOperationalError_1.WalletConversionOperationalError("Wallet conversion retry did not commit.", "WALLET_CONVERSION_OPERATIONAL_TRANSACTION_CONFLICT");
            return (0, walletConversionOperational_response_dto_1.toWalletConversionOperationalResponseDto)(result);
        }
        catch (error) {
            if (([11000, 112, 251].includes(error?.code) || error?.code ===
                "WALLET_CONVERSION_OPERATIONAL_TRANSACTION_CONFLICT") &&
                transactionAttempt < 5) {
                const winner = await walletConversionRetryAttempt_repository_1.walletConversionRetryAttemptRepository.findByKey(retryIdentity.attemptKey);
                if (winner)
                    return this.validateReplay(inspection.request.conversionReference);
                return this.retry(conversionReference, adminUserId, transactionAttempt + 1);
            }
            if (error instanceof WalletConversionOperationalError_1.WalletConversionOperationalError)
                throw error;
            throw new WalletConversionOperationalError_1.WalletConversionOperationalError("Wallet conversion retry transaction failed.", "WALLET_CONVERSION_OPERATIONAL_TRANSACTION_CONFLICT", error);
        }
        finally {
            await session.endSession();
        }
    }
    async validateReplay(conversionReference) {
        const inspection = await walletConversionOperationalInspection_service_1.walletConversionOperationalInspectionService
            .inspect(conversionReference);
        const reconciliation = await walletConversionReconciliation_repository_1.walletConversionReconciliationRepository
            .findByConversionReference(inspection.request.conversionReference);
        const identity = (0, walletConversionOperationalIdentity_util_1.deriveWalletConversionRetryIdentity)(inspection.request.conversionReference);
        const [attempt, audits] = await Promise.all([
            walletConversionRetryAttempt_repository_1.walletConversionRetryAttemptRepository.findByKey(identity.attemptKey),
            walletConversionAudit_model_1.WalletConversionAudit.find({
                conversionReference: inspection.request.conversionReference,
                action: walletConversionAuditAction_enum_1.WalletConversionAuditAction.RETRY,
            }).select("+adminActorId"),
        ]);
        if (!reconciliation || !attempt || audits.length !== 1 ||
            inspection.classification !== walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.HEALTHY ||
            inspection.request.status !== walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.COMPLETED ||
            !reconciliation.retryPerformed ||
            attempt.attemptReference !== identity.attemptReference ||
            attempt.reconciliationReference !==
                reconciliation.reconciliationReference ||
            attempt.conversionReference !== inspection.request.conversionReference ||
            attempt.status !== "APPLIED" || audits[0].retryPerformed !== true ||
            !audits[0].adminActorId?.equals(attempt.performedBy) ||
            audits[0].reconciliationReference !==
                reconciliation.reconciliationReference) {
            throw new WalletConversionOperationalError_1.WalletConversionOperationalError("Wallet conversion retry replay conflicts.", "WALLET_CONVERSION_OPERATIONAL_REPLAY_CONFLICT");
        }
        return (0, walletConversionOperational_response_dto_1.toWalletConversionOperationalResponseDto)(reconciliation);
    }
}
exports.WalletConversionRetryService = WalletConversionRetryService;
exports.walletConversionRetryService = new WalletConversionRetryService();
