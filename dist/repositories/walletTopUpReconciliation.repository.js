"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletTopUpReconciliationRepository = exports.WalletTopUpReconciliationRepository = void 0;
const walletTopUpReconciliation_model_1 = require("../models/walletTopUpReconciliation.model");
const walletTopUpReconciliationStatus_enum_1 = require("../enums/financial/walletTopUpReconciliationStatus.enum");
class WalletTopUpReconciliationRepository {
    findByReference(reference) {
        return walletTopUpReconciliation_model_1.WalletTopUpReconciliation.findOne({ reconciliationReference: reference })
            .select("+snapshot +fingerprint +reconciliationKey +userId +walletId +providerFundingId +resolvedBy")
            .exec();
    }
    findByTopUpRequestId(topUpRequestId) {
        return walletTopUpReconciliation_model_1.WalletTopUpReconciliation.findOne({ topUpRequestId })
            .select("+snapshot +fingerprint +reconciliationKey +userId +walletId +providerFundingId +resolvedBy")
            .exec();
    }
    async upsertObservation(input) {
        return walletTopUpReconciliation_model_1.WalletTopUpReconciliation.findOneAndUpdate({ topUpRequestId: input.topUpRequestId }, {
            $set: {
                providerFundingId: input.providerFundingId,
                providerFundingReference: input.providerFundingReference,
                classification: input.classification,
                status: input.status,
                severity: input.severity,
                detectedIssues: input.detectedIssues,
                lastInspectedAt: input.lastInspectedAt,
                recommendedAction: input.recommendedAction,
                allowedActions: input.allowedActions,
                snapshot: input.snapshot,
                fingerprint: input.fingerprint,
            },
            $setOnInsert: {
                reconciliationReference: input.reconciliationReference,
                reconciliationKey: input.reconciliationKey,
                topUpRequestId: input.topUpRequestId,
                topUpReference: input.topUpReference,
                userId: input.userId,
                walletId: input.walletId,
                detectedAt: input.detectedAt,
                retryCount: 0,
                maxRetryCount: input.maxRetryCount,
            },
            $inc: { version: 1 },
        }, { new: true, upsert: true, runValidators: true }).select("+snapshot +fingerprint +reconciliationKey +userId +walletId +providerFundingId +resolvedBy").exec();
    }
    async list(input) {
        const filter = {};
        if (input.status)
            filter.status = input.status;
        if (input.classification)
            filter.classification = input.classification;
        if (input.severity)
            filter.severity = input.severity;
        if (input.topUpReference)
            filter.topUpReference = input.topUpReference;
        if (input.providerFundingReference)
            filter.providerFundingReference = input.providerFundingReference;
        if (input.dateFrom || input.dateTo) {
            filter.createdAt = {
                ...(input.dateFrom ? { $gte: input.dateFrom } : {}),
                ...(input.dateTo ? { $lte: input.dateTo } : {}),
            };
        }
        const [items, total] = await Promise.all([
            walletTopUpReconciliation_model_1.WalletTopUpReconciliation.find(filter)
                .sort({ createdAt: -1, _id: -1 })
                .skip((input.page - 1) * input.limit)
                .limit(input.limit)
                .exec(),
            walletTopUpReconciliation_model_1.WalletTopUpReconciliation.countDocuments(filter),
        ]);
        return { items, total };
    }
    beginRetry(input) {
        return walletTopUpReconciliation_model_1.WalletTopUpReconciliation.findOneAndUpdate({
            reconciliationReference: input.reconciliationReference,
            fingerprint: input.fingerprint,
            classification: input.classification,
            retryCount: input.retryCount,
            status: { $in: [walletTopUpReconciliationStatus_enum_1.WalletTopUpReconciliationStatus.OPEN, walletTopUpReconciliationStatus_enum_1.WalletTopUpReconciliationStatus.RETRY_SCHEDULED] },
            $expr: { $lt: ["$retryCount", "$maxRetryCount"] },
        }, {
            $set: {
                status: walletTopUpReconciliationStatus_enum_1.WalletTopUpReconciliationStatus.IN_PROGRESS,
                lastRetryAt: input.at,
                lastRetryCode: input.action,
            },
            $unset: { nextRetryAt: 1 },
            $inc: { retryCount: 1, version: 1 },
        }, { new: true, runValidators: true }).select("+snapshot +fingerprint +reconciliationKey +userId +walletId +providerFundingId +resolvedBy").exec();
    }
    completeRetry(input) {
        return walletTopUpReconciliation_model_1.WalletTopUpReconciliation.findOneAndUpdate({
            reconciliationReference: input.reconciliationReference,
            status: walletTopUpReconciliationStatus_enum_1.WalletTopUpReconciliationStatus.IN_PROGRESS,
            retryCount: input.retryCount,
        }, {
            $set: {
                status: input.status,
                lastRetryCode: input.resultCode,
                ...(input.nextRetryAt ? { nextRetryAt: input.nextRetryAt } : {}),
            },
            $unset: input.nextRetryAt ? {} : { nextRetryAt: 1 },
            $inc: { version: 1 },
        }, { new: true, runValidators: true }).exec();
    }
    updateResolution(input) {
        return walletTopUpReconciliation_model_1.WalletTopUpReconciliation.findOneAndUpdate({
            reconciliationReference: input.reconciliationReference,
            fingerprint: input.fingerprint,
            status: { $in: input.expectedStatuses },
        }, {
            $set: {
                status: input.status,
                resolutionAction: input.action,
                resolutionCode: input.code,
                ...(input.note ? { resolutionNote: input.note } : {}),
                resolvedAt: input.at,
                resolvedBy: input.actorId,
            },
            $unset: { nextRetryAt: 1 },
            $inc: { version: 1 },
        }, { new: true, runValidators: true }).exec();
    }
}
exports.WalletTopUpReconciliationRepository = WalletTopUpReconciliationRepository;
exports.walletTopUpReconciliationRepository = new WalletTopUpReconciliationRepository();
