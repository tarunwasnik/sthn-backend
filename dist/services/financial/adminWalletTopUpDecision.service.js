"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminWalletTopUpDecisionService = exports.AdminWalletTopUpDecisionService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const walletTopUpDecision_enum_1 = require("../../enums/financial/walletTopUpDecision.enum");
const walletTopUpRejectionCode_enum_1 = require("../../enums/financial/walletTopUpRejectionCode.enum");
const walletTopUpRequestStatus_enum_1 = require("../../enums/financial/walletTopUpRequestStatus.enum");
const WalletTopUpRequestError_1 = require("../../errors/financial/WalletTopUpRequestError");
const walletTopUpRequest_repository_1 = require("../../repositories/walletTopUpRequest.repository");
class AdminWalletTopUpDecisionService {
    dto(request) { return { topUpReference: request.topUpReference, amount: request.amount, currency: request.currency, status: request.status, requestedAt: request.requestedAt, decidedAt: request.decidedAt, rejectionCode: request.rejectionCode, rejectionReason: request.rejectionReason, completedAt: request.completedAt }; }
    terminal(request, decision, code, reason) {
        if (request.status === walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.APPROVED && decision === walletTopUpDecision_enum_1.WalletTopUpDecision.APPROVE)
            return this.dto(request);
        if (request.status === walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.REJECTED && decision === walletTopUpDecision_enum_1.WalletTopUpDecision.REJECT && request.rejectionCode === code && (request.rejectionReason ?? undefined) === reason)
            return this.dto(request);
        throw new WalletTopUpRequestError_1.WalletTopUpRequestError("Top-up request decision conflicts with its current state.", [walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.APPROVED, walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.REJECTED].includes(request.status) ? "WALLET_TOP_UP_REQUEST_DECISION_CONFLICT" : "WALLET_TOP_UP_REQUEST_INVALID_STATUS");
    }
    async decide(input) {
        if (!mongoose_1.default.Types.ObjectId.isValid(input.adminUserId))
            throw new WalletTopUpRequestError_1.WalletTopUpRequestError("Unauthorized.", "WALLET_TOP_UP_REQUEST_UNAUTHORIZED");
        if (!Object.values(walletTopUpDecision_enum_1.WalletTopUpDecision).includes(input.decision))
            throw new WalletTopUpRequestError_1.WalletTopUpRequestError("Invalid decision.", "WALLET_TOP_UP_REQUEST_INVALID_DECISION");
        const decision = input.decision;
        const code = input.rejectionCode;
        if (decision === walletTopUpDecision_enum_1.WalletTopUpDecision.APPROVE && (input.rejectionCode !== undefined || input.rejectionReason !== undefined))
            throw new WalletTopUpRequestError_1.WalletTopUpRequestError("Rejection data is not allowed for approval.", "WALLET_TOP_UP_REQUEST_REJECTION_DATA_NOT_ALLOWED");
        if (decision === walletTopUpDecision_enum_1.WalletTopUpDecision.REJECT && !Object.values(walletTopUpRejectionCode_enum_1.WalletTopUpRejectionCode).includes(code))
            throw new WalletTopUpRequestError_1.WalletTopUpRequestError("Rejection code is required.", "WALLET_TOP_UP_REQUEST_REJECTION_CODE_REQUIRED");
        let reason;
        if (input.rejectionReason !== undefined) {
            if (typeof input.rejectionReason !== "string" || !(reason = input.rejectionReason.trim()) || reason.length > 500)
                throw new WalletTopUpRequestError_1.WalletTopUpRequestError("Invalid rejection reason.", "WALLET_TOP_UP_REQUEST_INVALID_REJECTION_REASON");
        }
        const current = await walletTopUpRequest_repository_1.walletTopUpRequestRepository.findByReference(input.topUpReference);
        if (!current)
            throw new WalletTopUpRequestError_1.WalletTopUpRequestError("Top-up request not found.", "WALLET_TOP_UP_REQUEST_NOT_FOUND");
        if (current.status !== walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.PENDING)
            return this.terminal(current, decision, code, reason);
        const actor = new mongoose_1.default.Types.ObjectId(input.adminUserId);
        const at = new Date();
        const updated = decision === walletTopUpDecision_enum_1.WalletTopUpDecision.APPROVE ? await walletTopUpRequest_repository_1.walletTopUpRequestRepository.approvePending({ topUpReference: input.topUpReference, decidedBy: actor, decidedAt: at }) : await walletTopUpRequest_repository_1.walletTopUpRequestRepository.rejectPending({ topUpReference: input.topUpReference, decidedBy: actor, decidedAt: at, rejectionCode: code, rejectionReason: reason });
        if (updated)
            return this.dto(updated);
        const winner = await walletTopUpRequest_repository_1.walletTopUpRequestRepository.findByReference(input.topUpReference);
        if (!winner)
            throw new WalletTopUpRequestError_1.WalletTopUpRequestError("Top-up request not found.", "WALLET_TOP_UP_REQUEST_NOT_FOUND");
        return this.terminal(winner, decision, code, reason);
    }
}
exports.AdminWalletTopUpDecisionService = AdminWalletTopUpDecisionService;
exports.adminWalletTopUpDecisionService = new AdminWalletTopUpDecisionService();
