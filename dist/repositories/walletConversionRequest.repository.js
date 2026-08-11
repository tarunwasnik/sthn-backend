"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletConversionRequestRepository = exports.WalletConversionRequestRepository = void 0;
const walletConversionRequestStatus_enum_1 = require("../enums/financial/walletConversionRequestStatus.enum");
const walletConversionRequest_model_1 = require("../models/walletConversionRequest.model");
const authorityFields = "+conversionKey +userId +sourceWalletId +targetWalletId " +
    "+fxSnapshotId +rateValue +rateScale +inverseRateValue +inverseRateScale " +
    "+sourceMinorUnits +targetMinorUnits +idempotencyKey +requestFingerprint " +
    "+decidedBy +providerMetadata +accountingKey +accountingFingerprint " +
    "+accountingTransactionReference +accountingTargetWalletId " +
    "+sourceProjectionReference +targetProjectionReference " +
    "+sourceWalletVersion +targetWalletVersion";
const displayRateFields = "+rateValue +rateScale +inverseRateValue +inverseRateScale";
class WalletConversionRequestRepository {
    findByReference(reference, session) {
        return walletConversionRequest_model_1.WalletConversionRequest.findOne({ conversionReference: reference })
            .select(authorityFields).session(session ?? null).exec();
    }
    findByUserAndReference(userId, reference) {
        return walletConversionRequest_model_1.WalletConversionRequest.findOne({ userId,
            conversionReference: reference }).select(authorityFields).exec();
    }
    findByUserAndIdempotencyKey(userId, idempotencyKey, session) {
        return walletConversionRequest_model_1.WalletConversionRequest.findOne({ userId, idempotencyKey })
            .select(authorityFields).session(session ?? null).exec();
    }
    findByKey(conversionKey, session) {
        return walletConversionRequest_model_1.WalletConversionRequest.findOne({ conversionKey })
            .select(authorityFields).session(session ?? null).exec();
    }
    async createPending(data, session) {
        const [created] = await walletConversionRequest_model_1.WalletConversionRequest.create([{
                ...data, status: walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.PENDING,
            }], { session });
        return created;
    }
    approvePending(input) {
        return walletConversionRequest_model_1.WalletConversionRequest.findOneAndUpdate({
            conversionReference: input.conversionReference,
            status: walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.PENDING,
        }, { $set: { status: walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.APPROVED,
                decidedBy: input.decidedBy, decidedAt: input.decidedAt },
            $unset: { rejectionCode: 1, rejectionReason: 1 } }, { new: true, session: input.session, runValidators: true })
            .select(authorityFields).exec();
    }
    rejectPending(input) {
        return walletConversionRequest_model_1.WalletConversionRequest.findOneAndUpdate({
            conversionReference: input.conversionReference,
            status: walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.PENDING,
        }, { $set: { status: walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.REJECTED,
                decidedBy: input.decidedBy, decidedAt: input.decidedAt,
                rejectionCode: input.rejectionCode,
                ...(input.rejectionReason ? { rejectionReason: input.rejectionReason } : {}) },
            $unset: input.rejectionReason ? {} : { rejectionReason: 1 } }, { new: true, session: input.session, runValidators: true })
            .select(authorityFields).exec();
    }
    synchronizeProviderTerminal(input) {
        return walletConversionRequest_model_1.WalletConversionRequest.findOneAndUpdate({
            conversionReference: input.conversionReference,
            status: walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.APPROVED,
            providerRequestReference: { $exists: false },
            providerExecutionReference: { $exists: false },
            providerStatus: { $exists: false },
        }, { $set: {
                providerRequestReference: input.providerRequestReference,
                providerExecutionReference: input.providerExecutionReference,
                providerStatus: input.providerStatus,
                providerOutcome: input.providerOutcome,
                providerProcessingAt: input.providerProcessingAt,
                providerCompletedAt: input.providerCompletedAt,
                ...(input.providerFailureCode
                    ? { providerFailureCode: input.providerFailureCode } : {}),
                providerMetadata: input.providerMetadata,
            } }, { new: true, runValidators: true, session: input.session })
            .select(authorityFields).exec();
    }
    completeApprovedWithAccounting(input) {
        return walletConversionRequest_model_1.WalletConversionRequest.findOneAndUpdate({
            conversionReference: input.conversionReference,
            status: walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.APPROVED,
            providerExecutionReference: input.providerExecutionReference,
            providerStatus: "SUCCEEDED", providerOutcome: "SUCCESS",
            accountingReference: { $exists: false },
            accountingTransactionReference: { $exists: false },
            completedAt: { $exists: false }, failedAt: { $exists: false },
        }, { $set: {
                status: walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.COMPLETED,
                accountingReference: input.accountingReference,
                accountingKey: input.accountingKey,
                accountingFingerprint: input.accountingFingerprint,
                accountingTransactionReference: input.accountingTransactionReference,
                accountingTargetWalletId: input.accountingTargetWalletId,
                sourceProjectionReference: input.sourceProjectionReference,
                targetProjectionReference: input.targetProjectionReference,
                sourceWalletVersion: input.sourceWalletVersion,
                targetWalletVersion: input.targetWalletVersion,
                completedAt: input.completedAt,
            } }, { new: true, runValidators: true, session: input.session })
            .select(authorityFields).exec();
    }
    failApprovedFromProvider(input) {
        return walletConversionRequest_model_1.WalletConversionRequest.findOneAndUpdate({
            conversionReference: input.conversionReference,
            status: walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.APPROVED,
            providerExecutionReference: input.providerExecutionReference,
            providerStatus: "FAILED", providerOutcome: "FAILURE",
            accountingReference: { $exists: false },
            accountingTransactionReference: { $exists: false },
            completedAt: { $exists: false }, failedAt: { $exists: false },
        }, { $set: { status: walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.FAILED,
                failedAt: input.failedAt } }, { new: true, runValidators: true, session: input.session })
            .select(authorityFields).exec();
    }
    retryCompleteCommittedAccounting(input) {
        return walletConversionRequest_model_1.WalletConversionRequest.findOneAndUpdate({
            conversionReference: input.conversionReference,
            status: walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.APPROVED,
            providerExecutionReference: input.providerExecutionReference,
            providerStatus: "SUCCEEDED", providerOutcome: "SUCCESS",
            accountingReference: input.accountingReference,
            accountingTransactionReference: input.accountingTransactionReference,
            completedAt: input.completedAt, failedAt: { $exists: false },
        }, { $set: { status: walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.COMPLETED } }, { new: true, runValidators: true, session: input.session })
            .select(authorityFields).exec();
    }
    restoreLedgerReferences(input) {
        return walletConversionRequest_model_1.WalletConversionRequest.findOneAndUpdate({
            conversionReference: input.conversionReference,
            status: walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.COMPLETED,
            accountingReference: input.accountingReference,
            accountingTransactionReference: { $exists: false },
        }, { $set: { accountingTransactionReference: input.accountingTransactionReference } }, { new: true, runValidators: true, session: input.session })
            .select(authorityFields).exec();
    }
    restoreProjectionReferences(input) {
        return walletConversionRequest_model_1.WalletConversionRequest.findOneAndUpdate({
            conversionReference: input.conversionReference,
            status: walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.COMPLETED,
            accountingReference: input.accountingReference,
            $or: [{ sourceProjectionReference: { $exists: false } },
                { targetProjectionReference: { $exists: false } }],
        }, { $set: { sourceProjectionReference: input.sourceProjectionReference,
                targetProjectionReference: input.targetProjectionReference } }, { new: true, runValidators: true, session: input.session })
            .select(authorityFields).exec();
    }
    restoreAccountingReferences(input) {
        return walletConversionRequest_model_1.WalletConversionRequest.findOneAndUpdate({
            conversionReference: input.conversionReference,
            status: walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.COMPLETED,
            $or: [{ accountingReference: { $exists: false } },
                { accountingKey: { $exists: false } },
                { accountingFingerprint: { $exists: false } },
                { accountingTargetWalletId: { $exists: false } },
                { sourceWalletVersion: { $exists: false } },
                { targetWalletVersion: { $exists: false } },
                { completedAt: { $exists: false } }],
        }, { $set: { accountingReference: input.accountingReference,
                accountingKey: input.accountingKey,
                accountingFingerprint: input.accountingFingerprint,
                accountingTargetWalletId: input.accountingTargetWalletId,
                sourceWalletVersion: input.sourceWalletVersion,
                targetWalletVersion: input.targetWalletVersion,
                completedAt: input.completedAt } }, { new: true, runValidators: true, session: input.session })
            .select(authorityFields).exec();
    }
    listByUser(userId, page, limit) {
        return walletConversionRequest_model_1.WalletConversionRequest.find({ userId }).select(displayRateFields)
            .sort({ requestedAt: -1, _id: -1 }).skip((page - 1) * limit)
            .limit(limit).exec();
    }
    findPendingByUser(userId, limit = 100) {
        return walletConversionRequest_model_1.WalletConversionRequest.find({ userId,
            status: walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.PENDING })
            .select(displayRateFields).sort({ requestedAt: -1, _id: -1 })
            .limit(limit).exec();
    }
    listForAdmin(filter, page, limit) {
        const query = {};
        if (filter.status)
            query.status = filter.status;
        if (filter.sourceCurrency)
            query.sourceCurrency = filter.sourceCurrency;
        if (filter.targetCurrency)
            query.targetCurrency = filter.targetCurrency;
        if (filter.conversionReference) {
            query.conversionReference = filter.conversionReference;
        }
        if (filter.requestedFrom || filter.requestedTo) {
            query.requestedAt = {
                ...(filter.requestedFrom ? { $gte: filter.requestedFrom } : {}),
                ...(filter.requestedTo ? { $lte: filter.requestedTo } : {}),
            };
        }
        return walletConversionRequest_model_1.WalletConversionRequest.find(query).select(displayRateFields)
            .sort({ requestedAt: 1, _id: 1 }).skip((page - 1) * limit)
            .limit(limit).exec();
    }
}
exports.WalletConversionRequestRepository = WalletConversionRequestRepository;
exports.walletConversionRequestRepository = new WalletConversionRequestRepository();
