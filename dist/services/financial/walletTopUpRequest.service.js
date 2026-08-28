"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletTopUpRequestService = exports.WalletTopUpRequestService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const money_util_1 = require("../../utils/financial/money.util");
const idempotency_util_1 = require("../../utils/financial/idempotency.util");
const reference_util_1 = require("../../utils/financial/reference.util");
const walletCreation_service_1 = require("../wallet/walletCreation.service");
const walletCreation_service_2 = require("../wallet/walletCreation.service");
const walletTopUpRequest_repository_1 = require("../../repositories/walletTopUpRequest.repository");
const WalletTopUpRequestError_1 = require("../../errors/financial/WalletTopUpRequestError");
class WalletTopUpRequestService {
    page(value, fallback) { const n = typeof value === "string" ? Number(value) : fallback; if (!Number.isSafeInteger(n) || n < 1)
        throw new WalletTopUpRequestError_1.WalletTopUpRequestError("Invalid pagination.", "WALLET_TOP_UP_REQUEST_INVALID_PAGINATION"); return n; }
    dto(request) { return { topUpReference: request.topUpReference, amount: request.amount, currency: request.currency, status: request.status, requestedAt: request.requestedAt, decidedAt: request.decidedAt, rejectionCode: request.rejectionCode, rejectionReason: request.rejectionReason, completedAt: request.completedAt }; }
    async create(userId, input) {
        if (!mongoose_1.default.Types.ObjectId.isValid(userId))
            throw new WalletTopUpRequestError_1.WalletTopUpRequestError("Unauthorized.", "WALLET_TOP_UP_REQUEST_UNAUTHORIZED");
        if (!(0, idempotency_util_1.isValidIdempotencyKey)(input.idempotencyKey))
            throw new WalletTopUpRequestError_1.WalletTopUpRequestError("Idempotency key is required.", "WALLET_TOP_UP_REQUEST_INVALID_IDEMPOTENCY_KEY");
        let currency;
        try {
            currency = (0, walletCreation_service_1.normalizeWalletCurrency)(String(input.currency ?? ""));
        }
        catch {
            throw new WalletTopUpRequestError_1.WalletTopUpRequestError("Wallet top-up currency is unsupported.", "WALLET_TOP_UP_REQUEST_UNSUPPORTED_CURRENCY");
        }
        const money = { amount: input.amount, currency };
        if (!(0, money_util_1.isValidMoney)(money) || money.amount <= 0)
            throw new WalletTopUpRequestError_1.WalletTopUpRequestError("Wallet top-up amount is invalid.", "WALLET_TOP_UP_REQUEST_INVALID_AMOUNT");
        const identity = new mongoose_1.default.Types.ObjectId(userId);
        const key = (0, idempotency_util_1.normalizeIdempotencyKey)(input.idempotencyKey);
        const existing = await walletTopUpRequest_repository_1.walletTopUpRequestRepository.findByUserAndIdempotencyKey(identity, key);
        if (existing) {
            if (existing.amount !== money.amount || existing.currency !== money.currency) {
                throw new WalletTopUpRequestError_1.WalletTopUpRequestError("Idempotency key conflicts with another request.", "WALLET_TOP_UP_REQUEST_IDEMPOTENCY_CONFLICT");
            }
            const existingWallet = await walletCreation_service_2.walletCreationService.getWallet(identity, currency);
            const replayFingerprint = (0, idempotency_util_1.createIdempotencyFingerprint)("WALLET_TOP_UP_REQUEST", userId, existing.walletId.toString(), money.amount, money.currency);
            if (!existingWallet || !existingWallet._id.equals(existing.walletId) ||
                existing.requestFingerprint !== replayFingerprint) {
                throw new WalletTopUpRequestError_1.WalletTopUpRequestError("Existing top-up request Wallet identity is invalid.", "WALLET_TOP_UP_REQUEST_IDEMPOTENCY_CONFLICT");
            }
            return this.dto(existing);
        }
        let wallet;
        try {
            wallet = await walletCreation_service_2.walletCreationService.createWallet(identity, currency);
        }
        catch {
            throw new WalletTopUpRequestError_1.WalletTopUpRequestError("Wallet could not be created for this top-up currency.", "WALLET_TOP_UP_REQUEST_WALLET_NOT_FOUND");
        }
        const fingerprint = (0, idempotency_util_1.createIdempotencyFingerprint)("WALLET_TOP_UP_REQUEST", userId, wallet._id.toString(), money.amount, money.currency);
        try {
            return this.dto(await walletTopUpRequest_repository_1.walletTopUpRequestRepository.createPending({ topUpReference: (0, reference_util_1.generateFinancialReference)("WALLET_TOP_UP"), userId: identity, walletId: wallet._id, amount: money.amount, currency: money.currency, idempotencyKey: key, requestFingerprint: fingerprint, requestedAt: new Date() }));
        }
        catch (error) {
            if (!(typeof error === "object" && error !== null && "code" in error && error.code === 11000))
                throw error;
            const raced = await walletTopUpRequest_repository_1.walletTopUpRequestRepository.findByUserAndIdempotencyKey(identity, key);
            if (raced && raced.requestFingerprint === fingerprint)
                return this.dto(raced);
            throw new WalletTopUpRequestError_1.WalletTopUpRequestError("Idempotency key conflicts with another request.", "WALLET_TOP_UP_REQUEST_IDEMPOTENCY_CONFLICT");
        }
    }
    async listOwn(userId, page, limit) { const identity = new mongoose_1.default.Types.ObjectId(userId); const p = this.page(page, 1); const l = Math.min(this.page(limit, 20), 100); return (await walletTopUpRequest_repository_1.walletTopUpRequestRepository.listByUser(identity, p, l)).map((item) => this.dto(item)); }
    async getOwn(userId, reference) { const request = await walletTopUpRequest_repository_1.walletTopUpRequestRepository.findByUserAndReference(new mongoose_1.default.Types.ObjectId(userId), reference); if (!request)
        throw new WalletTopUpRequestError_1.WalletTopUpRequestError("Top-up request not found.", "WALLET_TOP_UP_REQUEST_NOT_FOUND"); return this.dto(request); }
    async listAdminByStatus(status, page, limit) { const p = this.page(page, 1); const l = Math.min(this.page(limit, 20), 100); return (await walletTopUpRequest_repository_1.walletTopUpRequestRepository.listByStatus(status, p, l)).map((item) => this.dto(item)); }
    async getAdmin(reference) { const request = await walletTopUpRequest_repository_1.walletTopUpRequestRepository.findByReference(reference); if (!request)
        throw new WalletTopUpRequestError_1.WalletTopUpRequestError("Top-up request not found.", "WALLET_TOP_UP_REQUEST_NOT_FOUND"); return this.dto(request); }
}
exports.WalletTopUpRequestService = WalletTopUpRequestService;
exports.walletTopUpRequestService = new WalletTopUpRequestService();
