"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.internalWithdrawalProviderRequestRepository = exports.InternalWithdrawalProviderRequestRepository = void 0;
const internalWithdrawalProviderRequestStatus_enum_1 = require("../../enums/financial/internalWithdrawalProviderRequestStatus.enum");
const internalWithdrawalProviderRequest_model_1 = require("../../models/internalProvider/internalWithdrawalProviderRequest.model");
const AUTHORITY_FIELDS = "+providerRequestKey +providerFingerprint +executionFingerprint";
class InternalWithdrawalProviderRequestRepository {
    async create(data, session) {
        const [request] = await internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.create([{
                ...data,
                providerStatus: internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.CREATED,
                version: 0,
            }], { session });
        return request;
    }
    findByReference(providerRequestReference, session) {
        return internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.findOne({
            providerRequestReference,
        }).select(AUTHORITY_FIELDS).session(session ?? null).exec();
    }
    findByKey(providerRequestKey, session) {
        return internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.findOne({ providerRequestKey })
            .select(AUTHORITY_FIELDS).session(session ?? null).exec();
    }
    findByWithdrawal(withdrawalReference, session) {
        return internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.findOne({ withdrawalReference })
            .select(AUTHORITY_FIELDS).session(session ?? null).exec();
    }
    initialize(providerRequestReference, providerFingerprint, providerReference, expectedVersion, session) {
        return internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.findOneAndUpdate({
            providerRequestReference,
            providerFingerprint,
            providerStatus: internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.CREATED,
            providerReference,
            version: expectedVersion,
        }, {
            $set: {
                providerStatus: internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.INITIALIZED,
            },
            $inc: { version: 1 },
        }, { new: true, runValidators: true, session })
            .select(AUTHORITY_FIELDS).exec();
    }
    markProcessing(input, session) {
        return internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.findOneAndUpdate({
            providerRequestReference: input.providerRequestReference,
            providerFingerprint: input.providerFingerprint,
            providerStatus: internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.INITIALIZED,
            isTerminal: false,
            executionReference: { $exists: false },
            executionFingerprint: { $exists: false },
            version: input.expectedVersion,
        }, {
            $set: {
                providerStatus: internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.PROCESSING,
                executionReference: input.executionReference,
                executionFingerprint: input.executionFingerprint,
                providerMetadata: input.providerMetadata,
                execution: input.execution,
                payloads: { request: input.requestPayload, response: null },
                processingAt: input.processingAt,
                isTerminal: false,
            },
            $inc: { version: 1 },
        }, { new: true, runValidators: true, session })
            .select(AUTHORITY_FIELDS).exec();
    }
    markTerminal(input, session) {
        const succeeded = input.status ===
            internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.SUCCEEDED;
        return internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.findOneAndUpdate({
            providerRequestReference: input.providerRequestReference,
            executionFingerprint: input.executionFingerprint,
            providerStatus: internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.PROCESSING,
            isTerminal: false,
            version: input.expectedVersion,
        }, {
            $set: {
                providerStatus: input.status,
                isTerminal: true,
                terminalResult: {
                    outcome: input.status,
                    code: input.responseCode,
                    ...(input.responseMessage
                        ? { message: input.responseMessage }
                        : {}),
                },
                "payloads.response": input.responsePayload,
                "execution.processingLatencyMs": input.processingLatencyMs,
                ...(succeeded
                    ? { succeededAt: input.terminalAt }
                    : { failedAt: input.terminalAt }),
            },
            $inc: { version: 1 },
        }, { new: true, runValidators: true, session })
            .select(AUTHORITY_FIELDS).exec();
    }
}
exports.InternalWithdrawalProviderRequestRepository = InternalWithdrawalProviderRequestRepository;
exports.internalWithdrawalProviderRequestRepository = new InternalWithdrawalProviderRequestRepository();
