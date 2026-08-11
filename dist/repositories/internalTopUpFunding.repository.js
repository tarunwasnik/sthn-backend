"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.internalTopUpFundingRepository = exports.InternalTopUpFundingRepository = void 0;
const internalTopUpFunding_model_1 = require("../models/internalTopUpFunding.model");
const internalTopUpFundingStatus_enum_1 = require("../enums/financial/internalTopUpFundingStatus.enum");
const InternalTopUpFundingError_1 = require("../errors/financial/InternalTopUpFundingError");
class InternalTopUpFundingRepository {
    async createFunding(data, session) { try {
        const [created] = await internalTopUpFunding_model_1.InternalTopUpFunding.create([{ ...data, status: internalTopUpFundingStatus_enum_1.InternalTopUpFundingStatus.CREATED }], { session });
        return created;
    }
    catch (error) {
        if (error?.code !== 11000)
            throw error;
        const existing = await this.findByTopUpRequestId(data.topUpRequestId, session);
        if (!existing)
            throw new InternalTopUpFundingError_1.InternalTopUpFundingError("Provider funding identity could not be recovered.", "INTERNAL_TOP_UP_FUNDING_INTEGRITY_ERROR", 500, { cause: error });
        if (!this.matches(existing, data))
            throw new InternalTopUpFundingError_1.InternalTopUpFundingError("Provider funding identity conflicts with the existing record.", "INTERNAL_TOP_UP_FUNDING_DUPLICATE_IDENTITY_CONFLICT");
        return existing;
    } }
    matches(existing, data) { return existing.topUpRequestId.equals(data.topUpRequestId) && existing.topUpReference === data.topUpReference && existing.amount === data.amount && existing.currency === data.currency && existing.idempotencyKey === data.idempotencyKey && existing.requestFingerprint === data.requestFingerprint; }
    findByTopUpRequestId(topUpRequestId, session) { return internalTopUpFunding_model_1.InternalTopUpFunding.findOne({ topUpRequestId }).select("+requestFingerprint").session(session ?? null).exec(); }
    findByFundingReference(fundingReference, session) { return internalTopUpFunding_model_1.InternalTopUpFunding.findOne({ fundingReference }).select("+requestFingerprint").session(session ?? null).exec(); }
    markProcessing(fundingReference, processingStartedAt, session) { return internalTopUpFunding_model_1.InternalTopUpFunding.findOneAndUpdate({ fundingReference, status: internalTopUpFundingStatus_enum_1.InternalTopUpFundingStatus.CREATED }, { $set: { status: internalTopUpFundingStatus_enum_1.InternalTopUpFundingStatus.PROCESSING, processingStartedAt } }, { new: true, session }).exec(); }
    markSucceeded(fundingReference, succeededAt, session) { return internalTopUpFunding_model_1.InternalTopUpFunding.findOneAndUpdate({ fundingReference, status: internalTopUpFundingStatus_enum_1.InternalTopUpFundingStatus.PROCESSING }, { $set: { status: internalTopUpFundingStatus_enum_1.InternalTopUpFundingStatus.SUCCEEDED, succeededAt } }, { new: true, session }).exec(); }
    markFailed(fundingReference, failedAt, failureCode, failureReason, session) { return internalTopUpFunding_model_1.InternalTopUpFunding.findOneAndUpdate({ fundingReference, status: internalTopUpFundingStatus_enum_1.InternalTopUpFundingStatus.PROCESSING }, { $set: { status: internalTopUpFundingStatus_enum_1.InternalTopUpFundingStatus.FAILED, failedAt, failureCode, ...(failureReason ? { failureReason } : {}) } }, { new: true, session }).exec(); }
}
exports.InternalTopUpFundingRepository = InternalTopUpFundingRepository;
exports.internalTopUpFundingRepository = new InternalTopUpFundingRepository();
