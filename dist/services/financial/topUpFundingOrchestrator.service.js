"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.topUpFundingOrchestratorService = exports.TopUpFundingOrchestratorService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const walletTopUpRequest_repository_1 = require("../../repositories/walletTopUpRequest.repository");
const walletTopUpRequestStatus_enum_1 = require("../../enums/financial/walletTopUpRequestStatus.enum");
const internalTopUpFunding_service_1 = require("./internalTopUpFunding.service");
const internalTopUpFunding_repository_1 = require("../../repositories/internalTopUpFunding.repository");
const InternalTopUpFundingError_1 = require("../../errors/financial/InternalTopUpFundingError");
class TopUpFundingOrchestratorService {
    async start(input) { const request = await walletTopUpRequest_repository_1.walletTopUpRequestRepository.findByReferenceForAccounting(input.topUpReference); if (!request)
        throw new InternalTopUpFundingError_1.InternalTopUpFundingError("Top-up request was not found.", "INTERNAL_TOP_UP_FUNDING_NOT_FOUND", 404); if (![walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.APPROVED, walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.PROCESSING].includes(request.status))
        throw new InternalTopUpFundingError_1.InternalTopUpFundingError("Top-up request is not eligible for processing.", "INTERNAL_TOP_UP_FUNDING_INVALID_STATUS"); let funding; if (request.status === walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.PROCESSING) {
        if (!request.providerFundingId || !request.providerFundingReference)
            throw new InternalTopUpFundingError_1.InternalTopUpFundingError("Processing top-up request has no provider link.", "INTERNAL_TOP_UP_FUNDING_REQUEST_LINK_MISSING");
        const linked = await internalTopUpFunding_repository_1.internalTopUpFundingRepository.findByTopUpRequestId(request._id);
        if (!linked || !linked._id.equals(request.providerFundingId) || linked.fundingReference !== request.providerFundingReference || linked.topUpReference !== request.topUpReference || linked.amount !== request.amount || linked.currency !== request.currency)
            throw new InternalTopUpFundingError_1.InternalTopUpFundingError("Top-up request provider link conflicts with the funding record.", "INTERNAL_TOP_UP_FUNDING_REQUEST_LINK_CONFLICT");
        funding = linked;
    }
    else {
        funding = await internalTopUpFunding_service_1.internalTopUpFundingService.createAndStart({ topUpRequestId: request._id, topUpReference: request.topUpReference, amount: request.amount, currency: request.currency, idempotencyKey: `top-up-funding:${request.topUpReference}`, requestFingerprint: `${request.topUpReference}:${request.amount}:${request.currency}` });
        const session = await mongoose_1.default.startSession();
        try {
            await session.withTransaction(async () => { const updated = await walletTopUpRequest_repository_1.walletTopUpRequestRepository.startProcessingApproved({ topUpReference: request.topUpReference, providerFundingId: funding._id, providerFundingReference: funding.fundingReference, processingStartedAt: funding.processingStartedAt ?? new Date(), session }); if (!updated) {
                const current = await walletTopUpRequest_repository_1.walletTopUpRequestRepository.findByReference(request.topUpReference);
                if (!current || current.status !== walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.PROCESSING || current.providerFundingReference !== funding.fundingReference)
                    throw new InternalTopUpFundingError_1.InternalTopUpFundingError("Top-up request linkage conflicts with the authoritative state.", "INTERNAL_TOP_UP_FUNDING_REQUEST_LINK_CONFLICT");
            } });
        }
        finally {
            await session.endSession();
        }
    } const terminal = await internalTopUpFunding_service_1.internalTopUpFundingService.simulate(funding.fundingReference, input.outcome, input.failureCode, input.failureReason); return { topUpReference: request.topUpReference, topUpStatus: walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.PROCESSING, amount: request.amount, currency: request.currency, providerFundingReference: terminal.fundingReference, providerStatus: terminal.status, processingStartedAt: terminal.processingStartedAt, providerSucceededAt: terminal.succeededAt, providerFailedAt: terminal.failedAt, failureCode: terminal.failureCode, failureReason: terminal.failureReason }; }
}
exports.TopUpFundingOrchestratorService = TopUpFundingOrchestratorService;
exports.topUpFundingOrchestratorService = new TopUpFundingOrchestratorService();
