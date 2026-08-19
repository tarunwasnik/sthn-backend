import mongoose from "mongoose";
import { Money } from "../../types/financial/money.type";
import { isValidMoney } from "../../utils/financial/money.util";
import { createIdempotencyFingerprint, isValidIdempotencyKey, normalizeIdempotencyKey } from "../../utils/financial/idempotency.util";
import { generateFinancialReference } from "../../utils/financial/reference.util";
import { normalizeWalletCurrency } from "../wallet/walletCreation.service";
import { walletCreationService } from "../wallet/walletCreation.service";
import { walletTopUpRequestRepository } from "../../repositories/walletTopUpRequest.repository";
import { IWalletTopUpRequest } from "../../models/walletTopUpRequest.model";
import { WalletTopUpRequestError } from "../../errors/financial/WalletTopUpRequestError";
import { WalletTopUpRequestStatus } from "../../enums/financial/walletTopUpRequestStatus.enum";

export class WalletTopUpRequestService {
  private page(value: unknown, fallback: number) { const n = typeof value === "string" ? Number(value) : fallback; if (!Number.isSafeInteger(n) || n < 1) throw new WalletTopUpRequestError("Invalid pagination.", "WALLET_TOP_UP_REQUEST_INVALID_PAGINATION"); return n; }
  private dto(request: IWalletTopUpRequest) { return { topUpReference: request.topUpReference, amount: request.amount, currency: request.currency, status: request.status, requestedAt: request.requestedAt, decidedAt: request.decidedAt, rejectionCode: request.rejectionCode, rejectionReason: request.rejectionReason, completedAt: request.completedAt }; }
  async create(userId: string, input: { amount: unknown; currency: unknown; idempotencyKey: unknown }) {
    if (!mongoose.Types.ObjectId.isValid(userId)) throw new WalletTopUpRequestError("Unauthorized.", "WALLET_TOP_UP_REQUEST_UNAUTHORIZED");
    if (!isValidIdempotencyKey(input.idempotencyKey as string)) throw new WalletTopUpRequestError("Idempotency key is required.", "WALLET_TOP_UP_REQUEST_INVALID_IDEMPOTENCY_KEY");
    let currency; try { currency = normalizeWalletCurrency(String(input.currency ?? "")); } catch { throw new WalletTopUpRequestError("Wallet top-up currency is unsupported.", "WALLET_TOP_UP_REQUEST_UNSUPPORTED_CURRENCY"); }
    const money: Money = { amount: input.amount as number, currency };
    if (!isValidMoney(money) || money.amount <= 0) throw new WalletTopUpRequestError("Wallet top-up amount is invalid.", "WALLET_TOP_UP_REQUEST_INVALID_AMOUNT");
    const identity = new mongoose.Types.ObjectId(userId); const key = normalizeIdempotencyKey(input.idempotencyKey as string);
    const existing = await walletTopUpRequestRepository.findByUserAndIdempotencyKey(identity, key);
    if (existing) {
      if (existing.amount !== money.amount || existing.currency !== money.currency) {
        throw new WalletTopUpRequestError("Idempotency key conflicts with another request.", "WALLET_TOP_UP_REQUEST_IDEMPOTENCY_CONFLICT");
      }
      const existingWallet = await walletCreationService.getWallet(identity, currency);
      const replayFingerprint = createIdempotencyFingerprint(
        "WALLET_TOP_UP_REQUEST", userId, existing.walletId.toString(),
        money.amount, money.currency,
      );
      if (!existingWallet || !existingWallet._id.equals(existing.walletId) ||
        existing.requestFingerprint !== replayFingerprint) {
        throw new WalletTopUpRequestError("Existing top-up request Wallet identity is invalid.", "WALLET_TOP_UP_REQUEST_IDEMPOTENCY_CONFLICT");
      }
      return this.dto(existing);
    }
    let wallet;
    try {
      wallet = await walletCreationService.createWallet(identity, currency);
    } catch {
      throw new WalletTopUpRequestError(
        "Wallet could not be created for this top-up currency.",
        "WALLET_TOP_UP_REQUEST_WALLET_NOT_FOUND",
      );
    }
    const fingerprint = createIdempotencyFingerprint("WALLET_TOP_UP_REQUEST", userId, wallet._id.toString(), money.amount, money.currency);
    try { return this.dto(await walletTopUpRequestRepository.createPending({ topUpReference: generateFinancialReference("WALLET_TOP_UP"), userId: identity, walletId: wallet._id as mongoose.Types.ObjectId, amount: money.amount, currency: money.currency, idempotencyKey: key, requestFingerprint: fingerprint, requestedAt: new Date() })); }
    catch (error) { if (!(typeof error === "object" && error !== null && "code" in error && error.code === 11000)) throw error; const raced = await walletTopUpRequestRepository.findByUserAndIdempotencyKey(identity, key); if (raced && raced.requestFingerprint === fingerprint) return this.dto(raced); throw new WalletTopUpRequestError("Idempotency key conflicts with another request.", "WALLET_TOP_UP_REQUEST_IDEMPOTENCY_CONFLICT"); }
  }
  async listOwn(userId: string, page?: unknown, limit?: unknown) { const identity = new mongoose.Types.ObjectId(userId); const p = this.page(page, 1); const l = Math.min(this.page(limit, 20), 100); return (await walletTopUpRequestRepository.listByUser(identity, p, l)).map((item) => this.dto(item)); }
  async getOwn(userId: string, reference: string) { const request = await walletTopUpRequestRepository.findByUserAndReference(new mongoose.Types.ObjectId(userId), reference); if (!request) throw new WalletTopUpRequestError("Top-up request not found.", "WALLET_TOP_UP_REQUEST_NOT_FOUND"); return this.dto(request); }
  async listAdminByStatus(status: WalletTopUpRequestStatus, page?: unknown, limit?: unknown) { const p = this.page(page, 1); const l = Math.min(this.page(limit, 20), 100); return (await walletTopUpRequestRepository.listByStatus(status, p, l)).map((item) => this.dto(item)); }
  async getAdmin(reference: string) { const request = await walletTopUpRequestRepository.findByReference(reference); if (!request) throw new WalletTopUpRequestError("Top-up request not found.", "WALLET_TOP_UP_REQUEST_NOT_FOUND"); return this.dto(request); }
}
export const walletTopUpRequestService = new WalletTopUpRequestService();
