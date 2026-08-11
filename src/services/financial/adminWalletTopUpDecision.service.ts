import mongoose from "mongoose";
import { WalletTopUpDecision } from "../../enums/financial/walletTopUpDecision.enum";
import { WalletTopUpRejectionCode } from "../../enums/financial/walletTopUpRejectionCode.enum";
import { WalletTopUpRequestStatus } from "../../enums/financial/walletTopUpRequestStatus.enum";
import { WalletTopUpRequestError } from "../../errors/financial/WalletTopUpRequestError";
import { IWalletTopUpRequest } from "../../models/walletTopUpRequest.model";
import { walletTopUpRequestRepository } from "../../repositories/walletTopUpRequest.repository";

export class AdminWalletTopUpDecisionService {
  private dto(request: IWalletTopUpRequest) { return { topUpReference: request.topUpReference, amount: request.amount, currency: request.currency, status: request.status, requestedAt: request.requestedAt, decidedAt: request.decidedAt, rejectionCode: request.rejectionCode, rejectionReason: request.rejectionReason, completedAt: request.completedAt }; }
  private terminal(request: IWalletTopUpRequest, decision: WalletTopUpDecision, code?: WalletTopUpRejectionCode, reason?: string) {
    if (request.status === WalletTopUpRequestStatus.APPROVED && decision === WalletTopUpDecision.APPROVE) return this.dto(request);
    if (request.status === WalletTopUpRequestStatus.REJECTED && decision === WalletTopUpDecision.REJECT && request.rejectionCode === code && (request.rejectionReason ?? undefined) === reason) return this.dto(request);
    throw new WalletTopUpRequestError("Top-up request decision conflicts with its current state.", [WalletTopUpRequestStatus.APPROVED, WalletTopUpRequestStatus.REJECTED].includes(request.status) ? "WALLET_TOP_UP_REQUEST_DECISION_CONFLICT" : "WALLET_TOP_UP_REQUEST_INVALID_STATUS");
  }
  async decide(input: { adminUserId: string; topUpReference: string; decision: unknown; rejectionCode?: unknown; rejectionReason?: unknown }) {
    if (!mongoose.Types.ObjectId.isValid(input.adminUserId)) throw new WalletTopUpRequestError("Unauthorized.", "WALLET_TOP_UP_REQUEST_UNAUTHORIZED");
    if (!Object.values(WalletTopUpDecision).includes(input.decision as WalletTopUpDecision)) throw new WalletTopUpRequestError("Invalid decision.", "WALLET_TOP_UP_REQUEST_INVALID_DECISION");
    const decision = input.decision as WalletTopUpDecision; const code = input.rejectionCode as WalletTopUpRejectionCode | undefined;
    if (decision === WalletTopUpDecision.APPROVE && (input.rejectionCode !== undefined || input.rejectionReason !== undefined)) throw new WalletTopUpRequestError("Rejection data is not allowed for approval.", "WALLET_TOP_UP_REQUEST_REJECTION_DATA_NOT_ALLOWED");
    if (decision === WalletTopUpDecision.REJECT && !Object.values(WalletTopUpRejectionCode).includes(code as WalletTopUpRejectionCode)) throw new WalletTopUpRequestError("Rejection code is required.", "WALLET_TOP_UP_REQUEST_REJECTION_CODE_REQUIRED");
    let reason: string | undefined; if (input.rejectionReason !== undefined) { if (typeof input.rejectionReason !== "string" || !(reason = input.rejectionReason.trim()) || reason.length > 500) throw new WalletTopUpRequestError("Invalid rejection reason.", "WALLET_TOP_UP_REQUEST_INVALID_REJECTION_REASON"); }
    const current = await walletTopUpRequestRepository.findByReference(input.topUpReference); if (!current) throw new WalletTopUpRequestError("Top-up request not found.", "WALLET_TOP_UP_REQUEST_NOT_FOUND");
    if (current.status !== WalletTopUpRequestStatus.PENDING) return this.terminal(current, decision, code, reason);
    const actor = new mongoose.Types.ObjectId(input.adminUserId); const at = new Date();
    const updated = decision === WalletTopUpDecision.APPROVE ? await walletTopUpRequestRepository.approvePending({ topUpReference: input.topUpReference, decidedBy: actor, decidedAt: at }) : await walletTopUpRequestRepository.rejectPending({ topUpReference: input.topUpReference, decidedBy: actor, decidedAt: at, rejectionCode: code!, rejectionReason: reason });
    if (updated) return this.dto(updated);
    const winner = await walletTopUpRequestRepository.findByReference(input.topUpReference); if (!winner) throw new WalletTopUpRequestError("Top-up request not found.", "WALLET_TOP_UP_REQUEST_NOT_FOUND"); return this.terminal(winner, decision, code, reason);
  }
}
export const adminWalletTopUpDecisionService = new AdminWalletTopUpDecisionService();
