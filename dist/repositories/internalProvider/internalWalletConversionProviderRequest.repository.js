"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.internalWalletConversionProviderRequestRepository = exports.InternalWalletConversionProviderRequestRepository = void 0;
const internalWalletConversionProviderRequestStatus_enum_1 = require("../../enums/financial/internalWalletConversionProviderRequestStatus.enum");
const internalWalletConversionProviderRequest_model_1 = require("../../models/internalProvider/internalWalletConversionProviderRequest.model");
const AUTHORITY_FIELDS = "+providerRequestKey +userId +sourceWalletId " +
    "+targetWalletId +providerFingerprint +executionFingerprint " +
    "+providerMetadata +execution +payloads +failureReason";
class InternalWalletConversionProviderRequestRepository {
    async createInitialized(data, session) {
        const [created] = await internalWalletConversionProviderRequest_model_1.InternalWalletConversionProviderRequest.create([{
                ...data,
                providerStatus: internalWalletConversionProviderRequestStatus_enum_1.InternalWalletConversionProviderRequestStatus.INITIALIZED,
                isTerminal: false, version: 0,
            }], { session });
        return created;
    }
    findByConversion(conversionReference, session) {
        return internalWalletConversionProviderRequest_model_1.InternalWalletConversionProviderRequest.findOne({
            conversionReference,
        }).select(AUTHORITY_FIELDS).session(session ?? null).exec();
    }
    findByReference(providerRequestReference, session) {
        return internalWalletConversionProviderRequest_model_1.InternalWalletConversionProviderRequest.findOne({
            providerRequestReference,
        }).select(AUTHORITY_FIELDS).session(session ?? null).exec();
    }
    findByKey(providerRequestKey, session) {
        return internalWalletConversionProviderRequest_model_1.InternalWalletConversionProviderRequest.findOne({
            providerRequestKey,
        }).select(AUTHORITY_FIELDS).session(session ?? null).exec();
    }
    markProcessing(input, session) {
        return internalWalletConversionProviderRequest_model_1.InternalWalletConversionProviderRequest.findOneAndUpdate({
            providerRequestReference: input.providerRequestReference,
            providerFingerprint: input.providerFingerprint,
            executionFingerprint: input.executionFingerprint,
            providerStatus: internalWalletConversionProviderRequestStatus_enum_1.InternalWalletConversionProviderRequestStatus.INITIALIZED,
            isTerminal: false, version: input.expectedVersion,
        }, { $set: {
                providerStatus: internalWalletConversionProviderRequestStatus_enum_1.InternalWalletConversionProviderRequestStatus.PROCESSING,
                processingAt: input.processingAt,
                providerMetadata: input.providerMetadata,
                execution: input.execution,
                payloads: { request: input.requestPayload, response: null },
            }, $inc: { version: 1 } }, { new: true, runValidators: true, session })
            .select(AUTHORITY_FIELDS).exec();
    }
    markTerminal(input, session) {
        return internalWalletConversionProviderRequest_model_1.InternalWalletConversionProviderRequest.findOneAndUpdate({
            providerRequestReference: input.providerRequestReference,
            executionFingerprint: input.executionFingerprint,
            providerStatus: internalWalletConversionProviderRequestStatus_enum_1.InternalWalletConversionProviderRequestStatus.PROCESSING,
            isTerminal: false, version: input.expectedVersion,
        }, { $set: {
                providerStatus: input.status, providerOutcome: input.outcome,
                completedAt: input.completedAt, responseCode: input.responseCode,
                ...(input.failureCode ? { failureCode: input.failureCode } : {}),
                ...(input.failureReason ? { failureReason: input.failureReason } : {}),
                "payloads.response": input.responsePayload,
                "execution.processingLatencyMs": input.processingLatencyMs,
                isTerminal: true,
            }, $inc: { version: 1 } }, { new: true, runValidators: true, session })
            .select(AUTHORITY_FIELDS).exec();
    }
}
exports.InternalWalletConversionProviderRequestRepository = InternalWalletConversionProviderRequestRepository;
exports.internalWalletConversionProviderRequestRepository = new InternalWalletConversionProviderRequestRepository();
