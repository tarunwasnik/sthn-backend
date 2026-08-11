"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.creatorWithdrawalRequestRepository = exports.CreatorWithdrawalRequestRepository = void 0;
const creatorWithdrawalRequestStatus_enum_1 = require("../enums/financial/creatorWithdrawalRequestStatus.enum");
const creatorWithdrawalRequest_model_1 = require("../models/creatorWithdrawalRequest.model");
const AUTHORITY_FIELDS = "+withdrawalKey +requestFingerprint +ledgerTransactionReference " +
    "+ledgerEntryIds +isActiveObligation +finalizationOutcome " +
    "+finalizationKey +finalizationTransactionId " +
    "+finalizationLedgerEntryIds +finalizationProjectionOperationId " +
    "+finalizationProjectionOperationReference +finalizationFingerprint " +
    "+providerTerminalReference +providerFailureCode";
class CreatorWithdrawalRequestRepository {
    async createPending(data, session) {
        const [request] = await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.create([{
                ...data,
                status: creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.PENDING,
                reservedAmount: 0,
                isActiveObligation: true,
                version: 0,
            }], { session });
        return request;
    }
    findByKey(withdrawalKey, session) {
        return creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOne({ withdrawalKey })
            .select(AUTHORITY_FIELDS).session(session ?? null).exec();
    }
    findByReference(withdrawalReference, session) {
        return creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOne({ withdrawalReference })
            .select(AUTHORITY_FIELDS).session(session ?? null).exec();
    }
    findActiveByCreatorUser(creatorUserId, session) {
        return creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOne({
            creatorUserId,
            isActiveObligation: true,
        }).select(AUTHORITY_FIELDS).session(session ?? null).exec();
    }
    reserve(input, session) {
        return creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOneAndUpdate({
            _id: input.requestId,
            withdrawalKey: input.withdrawalKey,
            requestFingerprint: input.requestFingerprint,
            amount: input.amount,
            reservedAmount: 0,
            status: creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.PENDING,
            ledgerTransactionReference: { $exists: false },
            projectionReference: { $exists: false },
            ledgerEntryIds: { $size: 0 },
            isActiveObligation: true,
            version: input.expectedVersion,
        }, {
            $set: {
                reservedAmount: input.amount,
                status: creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.RESERVED,
                ledgerTransactionReference: input.ledgerTransactionReference,
                ledgerEntryIds: input.ledgerEntryIds,
                projectionReference: input.projectionReference,
                reservedAt: input.reservedAt,
            },
            $inc: { version: 1 },
        }, { new: true, runValidators: true, session })
            .select(AUTHORITY_FIELDS).exec();
    }
    linkProviderInitialization(input, session) {
        return creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOneAndUpdate({
            _id: input.requestId,
            withdrawalReference: input.withdrawalReference,
            status: creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.RESERVED,
            reservedAmount: { $gt: 0 },
            providerRequestReference: { $exists: false },
            version: input.expectedVersion,
        }, {
            $set: {
                providerRequestReference: input.providerRequestReference,
            },
            $inc: { version: 1 },
        }, { new: true, runValidators: true, session })
            .select(AUTHORITY_FIELDS).exec();
    }
    synchronizeProviderTerminal(input, session) {
        return creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOneAndUpdate({
            _id: input.requestId,
            withdrawalReference: input.withdrawalReference,
            status: creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.RESERVED,
            reservedAmount: { $gt: 0 },
            providerRequestReference: input.providerRequestReference,
            providerTerminalStatus: { $exists: false },
            version: input.expectedVersion,
        }, {
            $set: {
                providerTerminalStatus: input.providerTerminalStatus,
                providerProcessingAt: input.providerProcessingAt,
                providerSucceededAt: input.providerSucceededAt,
                providerFailedAt: input.providerFailedAt,
                providerExecutionMetadata: input.providerExecutionMetadata,
            },
            $inc: { version: 1 },
        }, { new: true, runValidators: true, session })
            .select(AUTHORITY_FIELDS).exec();
    }
    claimFinalizationIdentity(input, session) {
        return creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOneAndUpdate({
            _id: input.requestId,
            withdrawalReference: input.withdrawalReference,
            status: creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.RESERVED,
            reservedAmount: { $gt: 0 },
            providerRequestReference: input.providerRequestReference,
            providerTerminalStatus: input.providerTerminalStatus,
            finalizationReference: { $exists: false },
            finalizationKey: { $exists: false },
            finalizationTransactionId: { $exists: false },
            finalizationLedgerEntryIds: { $size: 0 },
            finalizationProjectionOperationId: { $exists: false },
            finalizationFingerprint: { $exists: false },
            version: input.expectedVersion,
        }, {
            $set: {
                finalizationOutcome: input.finalizationOutcome,
                finalizationReference: input.finalizationReference,
                finalizationKey: input.finalizationKey,
                finalizationTransactionId: input.finalizationTransactionId,
                finalizationProjectionOperationReference: input.finalizationProjectionOperationReference,
                finalizationFingerprint: input.finalizationFingerprint,
                providerTerminalReference: input.providerTerminalReference,
                providerFailureCode: input.providerFailureCode,
            },
            $inc: { version: 1 },
        }, { new: true, runValidators: true, session })
            .select(AUTHORITY_FIELDS).exec();
    }
    finalizeClaimed(input, session) {
        const completed = input.finalizationOutcome === "COMPLETED";
        return creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOneAndUpdate({
            _id: input.requestId,
            withdrawalReference: input.withdrawalReference,
            status: creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.RESERVED,
            reservedAmount: { $gt: 0 },
            finalizationKey: input.finalizationKey,
            finalizationFingerprint: input.finalizationFingerprint,
            finalizationOutcome: input.finalizationOutcome,
            finalizationLedgerEntryIds: { $size: 0 },
            finalizationProjectionOperationId: { $exists: false },
            version: input.expectedVersion,
        }, {
            $set: {
                status: completed
                    ? creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.COMPLETED
                    : creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.FAILED,
                reservedAmount: 0,
                isActiveObligation: false,
                finalizationLedgerEntryIds: input.finalizationLedgerEntryIds,
                finalizationProjectionOperationId: input.finalizationProjectionOperationId,
                finalizationProjectionOperationReference: input.finalizationProjectionOperationReference,
                ...(completed
                    ? { completedAt: input.terminalAt }
                    : { failedAt: input.terminalAt }),
            },
            $inc: { version: 1 },
        }, { new: true, runValidators: true, session })
            .select(AUTHORITY_FIELDS).exec();
    }
    restoreFinalizationLinks(input, session) {
        const allowed = new Set(Object.keys(input.values));
        if (!input.missingFields.length ||
            input.missingFields.some((field) => !allowed.has(field)))
            return null;
        const filter = {
            _id: input.requestId,
            withdrawalReference: input.withdrawalReference,
            status: input.status,
            reservedAmount: 0,
            providerRequestReference: input.providerRequestReference,
            providerTerminalStatus: input.providerTerminalStatus,
            version: input.expectedVersion,
        };
        const set = {};
        for (const field of input.missingFields) {
            filter[field] = field === "finalizationLedgerEntryIds"
                ? { $size: 0 } : { $exists: false };
            set[field] = input.values[field];
        }
        return creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOneAndUpdate(filter, {
            $set: set, $inc: { version: 1 },
        }, { new: true, runValidators: true, session })
            .select(AUTHORITY_FIELDS).exec();
    }
}
exports.CreatorWithdrawalRequestRepository = CreatorWithdrawalRequestRepository;
exports.creatorWithdrawalRequestRepository = new CreatorWithdrawalRequestRepository();
