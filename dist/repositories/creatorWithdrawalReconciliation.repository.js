"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.creatorWithdrawalReconciliationRepository = exports.CreatorWithdrawalReconciliationRepository = void 0;
const creatorWithdrawalOperationalAction_enum_1 = require("../enums/financial/creatorWithdrawalOperationalAction.enum");
const creatorWithdrawalOperationalClassification_enum_1 = require("../enums/financial/creatorWithdrawalOperationalClassification.enum");
const creatorWithdrawalReconciliationStatus_enum_1 = require("../enums/financial/creatorWithdrawalReconciliationStatus.enum");
const creatorWithdrawalReconciliation_model_1 = require("../models/creatorWithdrawalReconciliation.model");
const AUTHORITY = "+reconciliationKey +withdrawalRequestId +providerRequestId " +
    "+creatorId +creatorUserId +walletId +snapshot +snapshotFingerprint " +
    "+acknowledgedBy +resolvedBy";
class CreatorWithdrawalReconciliationRepository {
    findByReference(reference, session) {
        return creatorWithdrawalReconciliation_model_1.CreatorWithdrawalReconciliation.findOne({
            reconciliationReference: reference,
        }).select(AUTHORITY).session(session ?? null).exec();
    }
    findByWithdrawalReference(reference, session) {
        return creatorWithdrawalReconciliation_model_1.CreatorWithdrawalReconciliation.findOne({
            withdrawalReference: reference,
        }).select(AUTHORITY).session(session ?? null).exec();
    }
    upsertObservation(input, session) {
        return creatorWithdrawalReconciliation_model_1.CreatorWithdrawalReconciliation.findOneAndUpdate({
            withdrawalRequestId: input.withdrawalRequestId,
        }, {
            $set: {
                providerRequestId: input.providerRequestId,
                providerRequestReference: input.providerRequestReference,
                classification: input.classification,
                severity: input.severity,
                issueCodes: input.issueCodes,
                recommendedAction: input.recommendedAction,
                allowedActions: input.allowedActions,
                snapshot: input.snapshot,
                snapshotFingerprint: input.snapshotFingerprint,
                lastInspectedAt: input.inspectedAt,
            },
            $setOnInsert: {
                reconciliationReference: input.reconciliationReference,
                reconciliationKey: input.reconciliationKey,
                withdrawalRequestId: input.withdrawalRequestId,
                withdrawalReference: input.withdrawalReference,
                creatorId: input.creatorId,
                creatorUserId: input.creatorUserId,
                walletId: input.walletId,
                destinationReference: input.destinationReference,
                status: creatorWithdrawalReconciliationStatus_enum_1.CreatorWithdrawalReconciliationStatus.OPEN,
                retryCount: 0,
                maxRetryCount: input.maxRetryCount,
                detectedAt: input.inspectedAt,
            },
            $inc: { version: 1 },
        }, { new: true, upsert: true, runValidators: true, session })
            .select(AUTHORITY).exec();
    }
    async list(input) {
        const filter = {};
        if (input.status)
            filter.status = input.status;
        if (input.classification)
            filter.classification = input.classification;
        if (input.severity)
            filter.severity = input.severity;
        if (input.withdrawalReference)
            filter.withdrawalReference = input.withdrawalReference;
        if (input.providerRequestReference)
            filter.providerRequestReference = input.providerRequestReference;
        if (input.creatorId)
            filter.creatorId = input.creatorId;
        if (input.retryReady) {
            filter.classification = { $in: [
                    creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.FINALIZATION_PENDING_SUCCESS,
                    creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.FINALIZATION_PENDING_FAILURE,
                ] };
            filter.status = { $in: [
                    creatorWithdrawalReconciliationStatus_enum_1.CreatorWithdrawalReconciliationStatus.OPEN,
                    creatorWithdrawalReconciliationStatus_enum_1.CreatorWithdrawalReconciliationStatus.RETRY_SCHEDULED,
                ] };
            filter.$expr = { $lt: ["$retryCount", "$maxRetryCount"] };
        }
        if (input.dateFrom || input.dateTo)
            filter.createdAt = {
                ...(input.dateFrom ? { $gte: input.dateFrom } : {}),
                ...(input.dateTo ? { $lte: input.dateTo } : {}),
            };
        const [items, total] = await Promise.all([
            creatorWithdrawalReconciliation_model_1.CreatorWithdrawalReconciliation.find(filter)
                .sort({ createdAt: -1, _id: -1 })
                .skip((input.page - 1) * input.limit).limit(input.limit).exec(),
            creatorWithdrawalReconciliation_model_1.CreatorWithdrawalReconciliation.countDocuments(filter),
        ]);
        return { items, total };
    }
    beginRetry(input, session) {
        return creatorWithdrawalReconciliation_model_1.CreatorWithdrawalReconciliation.findOneAndUpdate({
            reconciliationReference: input.reference,
            snapshotFingerprint: input.fingerprint,
            classification: input.classification,
            retryCount: input.expectedRetryCount,
            status: { $in: [creatorWithdrawalReconciliationStatus_enum_1.CreatorWithdrawalReconciliationStatus.OPEN,
                    creatorWithdrawalReconciliationStatus_enum_1.CreatorWithdrawalReconciliationStatus.RETRY_SCHEDULED] },
            $expr: { $lt: ["$retryCount", "$maxRetryCount"] },
        }, { $set: {
                status: creatorWithdrawalReconciliationStatus_enum_1.CreatorWithdrawalReconciliationStatus.IN_PROGRESS,
                lastRetryAt: input.at,
                lastRetryCode: creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RETRY_FINALIZATION,
            }, $unset: { nextRetryAt: 1 }, $inc: { retryCount: 1, version: 1 } }, { new: true, runValidators: true, session }).select(AUTHORITY).exec();
    }
    completeRetry(input, session) {
        return creatorWithdrawalReconciliation_model_1.CreatorWithdrawalReconciliation.findOneAndUpdate({
            reconciliationReference: input.reference,
            status: creatorWithdrawalReconciliationStatus_enum_1.CreatorWithdrawalReconciliationStatus.IN_PROGRESS,
            retryCount: input.retryCount,
        }, { $set: {
                status: creatorWithdrawalReconciliationStatus_enum_1.CreatorWithdrawalReconciliationStatus.OPEN,
                classification: input.classification,
                severity: input.severity,
                snapshot: input.snapshot,
                snapshotFingerprint: input.snapshotFingerprint,
                issueCodes: input.issueCodes,
                allowedActions: [creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.INSPECT,
                    creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.ACKNOWLEDGE,
                    creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RESOLVE],
                recommendedAction: creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RESOLVE,
                lastRetryCode: input.resultCode,
                lastInspectedAt: new Date(),
            }, $inc: { version: 1 } }, { new: true, runValidators: true, session })
            .select(AUTHORITY).exec();
    }
    failRetry(input, session) {
        return creatorWithdrawalReconciliation_model_1.CreatorWithdrawalReconciliation.findOneAndUpdate({
            reconciliationReference: input.reference,
            status: creatorWithdrawalReconciliationStatus_enum_1.CreatorWithdrawalReconciliationStatus.IN_PROGRESS,
            retryCount: input.retryCount,
        }, { $set: {
                status: input.nextRetryAt
                    ? creatorWithdrawalReconciliationStatus_enum_1.CreatorWithdrawalReconciliationStatus.RETRY_SCHEDULED
                    : creatorWithdrawalReconciliationStatus_enum_1.CreatorWithdrawalReconciliationStatus.FAILED,
                lastRetryCode: input.resultCode,
                ...(input.nextRetryAt ? { nextRetryAt: input.nextRetryAt } : {}),
            }, $inc: { version: 1 } }, { new: true, runValidators: true, session })
            .select(AUTHORITY).exec();
    }
    updateAfterRepair(input, session) {
        return creatorWithdrawalReconciliation_model_1.CreatorWithdrawalReconciliation.findOneAndUpdate({
            reconciliationReference: input.reference,
            snapshotFingerprint: input.expectedFingerprint,
            status: { $ne: creatorWithdrawalReconciliationStatus_enum_1.CreatorWithdrawalReconciliationStatus.RESOLVED },
        }, { $set: {
                classification: input.classification, severity: input.severity,
                snapshot: input.snapshot, snapshotFingerprint: input.snapshotFingerprint,
                issueCodes: input.issueCodes, lastInspectedAt: new Date(),
                allowedActions: [creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.INSPECT,
                    creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.ACKNOWLEDGE,
                    creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RESOLVE],
                recommendedAction: creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RESOLVE,
            }, $inc: { version: 1 } }, { new: true, runValidators: true, session })
            .select(AUTHORITY).exec();
    }
    transitionStatus(input, session) {
        const acknowledged = input.status ===
            creatorWithdrawalReconciliationStatus_enum_1.CreatorWithdrawalReconciliationStatus.ACKNOWLEDGED;
        return creatorWithdrawalReconciliation_model_1.CreatorWithdrawalReconciliation.findOneAndUpdate({
            reconciliationReference: input.reference,
            status: { $in: input.expectedStatuses },
        }, { $set: acknowledged ? {
                status: input.status, acknowledgedAt: input.at,
                acknowledgedBy: input.actorId,
            } : {
                status: input.status, resolvedAt: input.at, resolvedBy: input.actorId,
                resolutionCode: input.code, ...(input.note ? { resolutionNote: input.note } : {}),
            }, $unset: { nextRetryAt: 1 }, $inc: { version: 1 } }, { new: true, runValidators: true, session }).select(AUTHORITY).exec();
    }
}
exports.CreatorWithdrawalReconciliationRepository = CreatorWithdrawalReconciliationRepository;
exports.creatorWithdrawalReconciliationRepository = new CreatorWithdrawalReconciliationRepository();
