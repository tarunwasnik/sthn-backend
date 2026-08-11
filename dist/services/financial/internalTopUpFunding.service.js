"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.internalTopUpFundingService = exports.InternalTopUpFundingService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const internalProvider_1 = require("../../constants/internalProvider");
const internalTopUpFundingOutcome_enum_1 = require("../../enums/financial/internalTopUpFundingOutcome.enum");
const internalTopUpFundingFailureCode_enum_1 = require("../../enums/financial/internalTopUpFundingFailureCode.enum");
const internalTopUpFundingStatus_enum_1 = require("../../enums/financial/internalTopUpFundingStatus.enum");
const InternalTopUpFundingError_1 = require("../../errors/financial/InternalTopUpFundingError");
const reference_util_1 = require("../../utils/financial/reference.util");
const internalTopUpFunding_repository_1 = require("../../repositories/internalTopUpFunding.repository");
const providerEvent_service_1 = __importDefault(require("../internalProvider/events/providerEvent.service"));
class InternalTopUpFundingService {
    normalize(outcome, code, reason) {
        if (!Object.values(internalTopUpFundingOutcome_enum_1.InternalTopUpFundingOutcome).includes(outcome))
            throw new InternalTopUpFundingError_1.InternalTopUpFundingError("Invalid provider funding outcome.", "INTERNAL_TOP_UP_FUNDING_INVALID_OUTCOME", 400);
        if (outcome === internalTopUpFundingOutcome_enum_1.InternalTopUpFundingOutcome.SUCCESS) {
            if (code !== undefined || reason !== undefined)
                throw new InternalTopUpFundingError_1.InternalTopUpFundingError("Success cannot include failure data.", "INTERNAL_TOP_UP_FUNDING_FAILURE_DATA_NOT_ALLOWED", 400);
            return {};
        }
        if (!Object.values(internalTopUpFundingFailureCode_enum_1.InternalTopUpFundingFailureCode).includes(code))
            throw new InternalTopUpFundingError_1.InternalTopUpFundingError("A valid failure code is required.", "INTERNAL_TOP_UP_FUNDING_FAILURE_CODE_REQUIRED", 400);
        if (reason !== undefined && typeof reason !== "string")
            throw new InternalTopUpFundingError_1.InternalTopUpFundingError("Failure reason is invalid.", "INTERNAL_TOP_UP_FUNDING_INVALID_FAILURE_REASON", 400);
        const failureReason = typeof reason === "string" ? reason.trim() : undefined;
        if (typeof reason === "string" && (!failureReason || failureReason.length > 500))
            throw new InternalTopUpFundingError_1.InternalTopUpFundingError("Failure reason is invalid.", "INTERNAL_TOP_UP_FUNDING_INVALID_FAILURE_REASON", 400);
        return { failureCode: code, failureReason };
    }
    async event(funding, eventType, operation, session) { await providerEvent_service_1.default.recordEvent({ entityType: internalProvider_1.ProviderEntityType.TOP_UP_FUNDING, entityId: funding._id, eventType, operation, transitionKey: `${funding.fundingReference}:${eventType}`, providerEntityId: funding.fundingReference, providerMetadata: { provider: "INTERNAL", environment: process.env.NODE_ENV ?? "development", simulationMode: internalProvider_1.ProviderSimulationMode.ADMIN_OVERRIDE }, execution: { attemptNumber: 1, retryCount: 0, isTestMode: process.env.NODE_ENV === "test" }, audit: {}, payloads: {}, occurredAt: new Date() }, session); }
    async createAndStart(input) { const session = await mongoose_1.default.startSession(); let result = null; try {
        await session.withTransaction(async () => { let funding = await internalTopUpFunding_repository_1.internalTopUpFundingRepository.findByTopUpRequestId(input.topUpRequestId, session); if (!funding) {
            funding = await internalTopUpFunding_repository_1.internalTopUpFundingRepository.createFunding({ ...input, fundingReference: (0, reference_util_1.generateFinancialReference)("INTERNAL_TOP_UP_FUNDING") }, session);
            await this.event(funding, internalProvider_1.ProviderEventType.TOP_UP_FUNDING_CREATED, internalProvider_1.ProviderOperation.CREATE_TOP_UP_FUNDING, session);
        }
        else if (!internalTopUpFunding_repository_1.internalTopUpFundingRepository.matches(funding, input))
            throw new InternalTopUpFundingError_1.InternalTopUpFundingError("Provider funding identity conflicts with the existing record.", "INTERNAL_TOP_UP_FUNDING_IDENTITY_CONFLICT"); if (funding.status === internalTopUpFundingStatus_enum_1.InternalTopUpFundingStatus.CREATED) {
            const updated = await internalTopUpFunding_repository_1.internalTopUpFundingRepository.markProcessing(funding.fundingReference, new Date(), session);
            if (!updated)
                throw new InternalTopUpFundingError_1.InternalTopUpFundingError("Provider funding state changed concurrently.", "INTERNAL_TOP_UP_FUNDING_INVALID_STATUS");
            funding = updated;
            await this.event(funding, internalProvider_1.ProviderEventType.TOP_UP_FUNDING_PROCESSING_STARTED, internalProvider_1.ProviderOperation.PROCESS_TOP_UP_FUNDING, session);
        } result = funding; });
    }
    finally {
        await session.endSession();
    } if (!result)
        throw new InternalTopUpFundingError_1.InternalTopUpFundingError("Provider funding did not start.", "INTERNAL_TOP_UP_FUNDING_INTEGRITY_ERROR", 500); return result; }
    async simulate(reference, outcome, code, reason) { const failure = this.normalize(outcome, code, reason); const session = await mongoose_1.default.startSession(); let result = null; try {
        await session.withTransaction(async () => { const funding = await internalTopUpFunding_repository_1.internalTopUpFundingRepository.findByFundingReference(reference, session); if (!funding)
            throw new InternalTopUpFundingError_1.InternalTopUpFundingError("Provider funding was not found.", "INTERNAL_TOP_UP_FUNDING_NOT_FOUND", 404); if (funding.status === internalTopUpFundingStatus_enum_1.InternalTopUpFundingStatus.SUCCEEDED) {
            if (outcome === internalTopUpFundingOutcome_enum_1.InternalTopUpFundingOutcome.SUCCESS) {
                result = funding;
                return;
            }
            throw new InternalTopUpFundingError_1.InternalTopUpFundingError("Provider outcome conflicts with the persisted result.", "INTERNAL_TOP_UP_FUNDING_OUTCOME_CONFLICT");
        } if (funding.status === internalTopUpFundingStatus_enum_1.InternalTopUpFundingStatus.FAILED) {
            if (outcome === internalTopUpFundingOutcome_enum_1.InternalTopUpFundingOutcome.SUCCESS)
                throw new InternalTopUpFundingError_1.InternalTopUpFundingError("Provider outcome conflicts with the persisted result.", "INTERNAL_TOP_UP_FUNDING_OUTCOME_CONFLICT");
            if (funding.failureCode === failure.failureCode && (funding.failureReason ?? undefined) === failure.failureReason) {
                result = funding;
                return;
            }
            throw new InternalTopUpFundingError_1.InternalTopUpFundingError("Provider failure payload conflicts with the persisted result.", "INTERNAL_TOP_UP_FUNDING_FAILURE_PAYLOAD_CONFLICT");
        } if (funding.status !== internalTopUpFundingStatus_enum_1.InternalTopUpFundingStatus.PROCESSING)
            throw new InternalTopUpFundingError_1.InternalTopUpFundingError("Provider funding is not processing.", "INTERNAL_TOP_UP_FUNDING_INVALID_STATUS"); const updated = outcome === internalTopUpFundingOutcome_enum_1.InternalTopUpFundingOutcome.SUCCESS ? await internalTopUpFunding_repository_1.internalTopUpFundingRepository.markSucceeded(reference, new Date(), session) : await internalTopUpFunding_repository_1.internalTopUpFundingRepository.markFailed(reference, new Date(), failure.failureCode, failure.failureReason, session); if (!updated)
            throw new InternalTopUpFundingError_1.InternalTopUpFundingError("Provider funding state changed concurrently.", "INTERNAL_TOP_UP_FUNDING_INVALID_STATUS"); await this.event(updated, outcome === internalTopUpFundingOutcome_enum_1.InternalTopUpFundingOutcome.SUCCESS ? internalProvider_1.ProviderEventType.TOP_UP_FUNDING_SUCCEEDED : internalProvider_1.ProviderEventType.TOP_UP_FUNDING_FAILED, outcome === internalTopUpFundingOutcome_enum_1.InternalTopUpFundingOutcome.SUCCESS ? internalProvider_1.ProviderOperation.SUCCEED_TOP_UP_FUNDING : internalProvider_1.ProviderOperation.FAIL_TOP_UP_FUNDING, session); result = updated; });
    }
    finally {
        await session.endSession();
    } if (!result)
        throw new InternalTopUpFundingError_1.InternalTopUpFundingError("Provider funding simulation did not complete.", "INTERNAL_TOP_UP_FUNDING_INTEGRITY_ERROR", 500); return result; }
}
exports.InternalTopUpFundingService = InternalTopUpFundingService;
exports.internalTopUpFundingService = new InternalTopUpFundingService();
