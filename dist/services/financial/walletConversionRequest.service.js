"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletConversionRequestService = exports.WalletConversionRequestService = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const walletConversionAuditAction_enum_1 = require("../../enums/financial/walletConversionAuditAction.enum");
const walletConversionRequestStatus_enum_1 = require("../../enums/financial/walletConversionRequestStatus.enum");
const WalletConversionRequestError_1 = require("../../errors/financial/WalletConversionRequestError");
const FxRateSnapshotError_1 = require("../../errors/financial/FxRateSnapshotError");
const walletConversionAudit_repository_1 = require("../../repositories/walletConversionAudit.repository");
const walletConversionRequest_repository_1 = require("../../repositories/walletConversionRequest.repository");
const wallet_repository_1 = require("../../repositories/wallet/wallet.repository");
const idempotency_util_1 = require("../../utils/financial/idempotency.util");
const reference_util_1 = require("../../utils/financial/reference.util");
const walletConversionRequest_response_dto_1 = require("../../dtos/wallet/walletConversionRequest.response.dto");
const walletIntegrity_service_1 = require("../wallet/walletIntegrity.service");
const fxRateSnapshot_service_1 = require("./fxRateSnapshot.service");
const walletConversionQuote_service_1 = require("./walletConversionQuote.service");
class WalletConversionRequestService {
    constructor(fxService = fxRateSnapshot_service_1.fxRateSnapshotService, quoteService = walletConversionQuote_service_1.walletConversionQuoteService, options = {}) {
        this.fxService = fxService;
        this.quoteService = quoteService;
        this.options = options;
        this.now = options.now ?? (() => new Date());
    }
    async inject(point) {
        await this.options.failureInjector?.(point);
    }
    page(value, fallback) {
        if (value === undefined)
            return fallback;
        const parsed = typeof value === "string" ? Number(value) : value;
        if (!Number.isSafeInteger(parsed) || parsed < 1) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Pagination is invalid.", "WALLET_CONVERSION_INVALID_PAGINATION", 422);
        }
        return parsed;
    }
    identity(input) {
        const parts = [input.userId.toString(), input.sourceWalletId.toString(),
            input.targetWalletId?.toString() ?? "", input.quote.sourceCurrency,
            input.quote.targetCurrency, input.quote.sourceAmount,
            input.quote.targetAmount, input.snapshot.snapshotReference,
            input.snapshot.provider, input.snapshot.effectiveDate.toISOString(),
            input.quote.rateValue, input.quote.rateScale,
            input.quote.inverseRateValue, input.quote.inverseRateScale,
            input.quote.sourceMinorUnits, input.quote.targetMinorUnits,
            input.idempotencyKey];
        return {
            conversionKey: (0, idempotency_util_1.createIdempotencyFingerprint)("WALLET_CONVERSION_KEY", ...parts),
            requestFingerprint: (0, idempotency_util_1.createIdempotencyFingerprint)("WALLET_CONVERSION_REQUEST", ...parts),
        };
    }
    snapshotError(error) {
        if (error instanceof FxRateSnapshotError_1.FxRateSnapshotError) {
            if (error.code === "FX_RATE_SNAPSHOT_NOT_FOUND") {
                throw new WalletConversionRequestError_1.WalletConversionRequestError("A current FX rate is unavailable.", "WALLET_CONVERSION_FX_SNAPSHOT_NOT_FOUND", 404, error);
            }
            if (error.code === "FX_RATE_SNAPSHOT_EXPIRED" ||
                error.code === "FX_RATE_STALE_PROVIDER_RESPONSE") {
                throw new WalletConversionRequestError_1.WalletConversionRequestError("The current FX rate is expired.", "WALLET_CONVERSION_FX_SNAPSHOT_EXPIRED", 409, error);
            }
            if (error.code === "FX_RATE_PAIR_NOT_SUPPORTED") {
                throw new WalletConversionRequestError_1.WalletConversionRequestError("The directed FX pair is unsupported.", "WALLET_CONVERSION_UNSUPPORTED_PAIR", 422, error);
            }
            throw new WalletConversionRequestError_1.WalletConversionRequestError("The FX snapshot is inconsistent.", "WALLET_CONVERSION_FX_SNAPSHOT_CONFLICT", 409, error);
        }
        throw error;
    }
    assertSourceWallet(wallet, userId, currency, amount, checkBalance) {
        if (!wallet) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Source Wallet was not found.", "WALLET_CONVERSION_SOURCE_WALLET_NOT_FOUND", 404);
        }
        if (!wallet.userId.equals(userId)) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Source Wallet ownership conflicts.", "WALLET_CONVERSION_SOURCE_WALLET_OWNERSHIP_CONFLICT", 409);
        }
        if (wallet.currency !== currency) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Source Wallet currency conflicts.", "WALLET_CONVERSION_SOURCE_WALLET_CURRENCY_CONFLICT", 409);
        }
        if (!walletIntegrity_service_1.walletIntegrityService.validateWallet(wallet)) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Source Wallet integrity is invalid.", "WALLET_CONVERSION_INTEGRITY_ERROR", 500);
        }
        if (checkBalance && wallet.availableBalance < amount) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Available balance is insufficient.", "WALLET_CONVERSION_INSUFFICIENT_AVAILABLE_BALANCE", 409);
        }
        return wallet;
    }
    async validateStoredAuthority(existing, options) {
        const userId = existing.userId;
        if (!Object.values(walletConversionRequestStatus_enum_1.WalletConversionRequestStatus).includes(existing.status) ||
            !(0, reference_util_1.hasReferenceType)(existing.conversionReference, "WALLET_CONVERSION") ||
            !(existing.requestedAt instanceof Date) ||
            Number.isNaN(existing.requestedAt.valueOf())) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Conversion request is corrupted.", "WALLET_CONVERSION_INTEGRITY_ERROR", 500);
        }
        const sourceWallet = this.assertSourceWallet(await wallet_repository_1.walletRepository.findById(existing.sourceWalletId), userId, existing.sourceCurrency, existing.sourceAmount, options.checkSourceBalance);
        if (existing.targetWalletId) {
            const targetWallet = await wallet_repository_1.walletRepository.findById(existing.targetWalletId);
            if (!targetWallet || !targetWallet.userId.equals(userId) ||
                targetWallet.currency !== existing.targetCurrency ||
                !walletIntegrity_service_1.walletIntegrityService.validateWallet(targetWallet)) {
                throw new WalletConversionRequestError_1.WalletConversionRequestError("Target Wallet identity conflicts.", "WALLET_CONVERSION_TARGET_WALLET_CONFLICT", 409);
            }
        }
        let snapshot;
        try {
            snapshot = options.requireSnapshotEligible
                ? await this.fxService.requireStoredSnapshotEligible(existing.fxSnapshotReference)
                : await this.fxService.validateStoredSnapshot(existing.fxSnapshotReference);
        }
        catch (error) {
            return this.snapshotError(error);
        }
        const quote = this.quoteService.calculate(existing.sourceCurrency, existing.targetCurrency, existing.sourceAmount, snapshot);
        const identity = this.identity({ userId,
            sourceWalletId: sourceWallet._id,
            targetWalletId: existing.targetWalletId,
            snapshot, quote, idempotencyKey: existing.idempotencyKey });
        if (!snapshot._id.equals(existing.fxSnapshotId) ||
            existing.fxProvider !== snapshot.provider ||
            existing.fxEffectiveDate.getTime() !== snapshot.effectiveDate.getTime() ||
            existing.targetAmount !== quote.targetAmount ||
            existing.rateValue !== quote.rateValue ||
            existing.rateScale !== quote.rateScale ||
            existing.inverseRateValue !== quote.inverseRateValue ||
            existing.inverseRateScale !== quote.inverseRateScale ||
            existing.sourceMinorUnits !== quote.sourceMinorUnits ||
            existing.targetMinorUnits !== quote.targetMinorUnits ||
            existing.conversionKey !== identity.conversionKey ||
            existing.requestFingerprint !== identity.requestFingerprint) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Conversion replay integrity failed.", "WALLET_CONVERSION_INTEGRITY_ERROR", 500);
        }
        return { sourceWallet, snapshot, quote };
    }
    async replay(existing, userId, input, key) {
        const pair = this.quoteService.normalizePair(input.sourceCurrency, input.targetCurrency);
        const amount = this.quoteService.validateSourceAmount(input.sourceAmount);
        if (existing.sourceCurrency !== pair.sourceCurrency ||
            existing.targetCurrency !== pair.targetCurrency ||
            existing.sourceAmount !== amount || existing.idempotencyKey !== key) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Idempotency key conflicts with another conversion intent.", "WALLET_CONVERSION_IDEMPOTENCY_CONFLICT", 409);
        }
        await this.validateStoredAuthority(existing, {
            checkSourceBalance: false, requireSnapshotEligible: false,
        });
        return (0, walletConversionRequest_response_dto_1.toWalletConversionRequestResponseDto)(existing);
    }
    async create(userIdValue, input) {
        if (!mongoose_1.Types.ObjectId.isValid(userIdValue)) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Authentication is invalid.", "WALLET_CONVERSION_INTEGRITY_ERROR", 401);
        }
        if (!(0, idempotency_util_1.isValidIdempotencyKey)(input.idempotencyKey)) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Idempotency-Key is required.", "WALLET_CONVERSION_INVALID_IDEMPOTENCY_KEY", 400);
        }
        const userId = new mongoose_1.Types.ObjectId(userIdValue);
        const idempotencyKey = (0, idempotency_util_1.normalizeIdempotencyKey)(input.idempotencyKey);
        const existing = await walletConversionRequest_repository_1.walletConversionRequestRepository
            .findByUserAndIdempotencyKey(userId, idempotencyKey);
        if (existing)
            return this.replay(existing, userId, input, idempotencyKey);
        const pair = this.quoteService.normalizePair(input.sourceCurrency, input.targetCurrency);
        const sourceAmount = this.quoteService.validateSourceAmount(input.sourceAmount);
        const sourceWallet = this.assertSourceWallet(await wallet_repository_1.walletRepository.findByUserAndCurrency(userId, pair.sourceCurrency), userId, pair.sourceCurrency, sourceAmount, true);
        await this.inject("AFTER_SOURCE_WALLET_VALIDATION");
        const targetWallet = await wallet_repository_1.walletRepository.findByUserAndCurrency(userId, pair.targetCurrency);
        let snapshot;
        try {
            snapshot = await this.fxService.requireCurrentSnapshot(pair.sourceCurrency, pair.targetCurrency);
        }
        catch (error) {
            return this.snapshotError(error);
        }
        await this.inject("AFTER_SNAPSHOT_RESOLUTION");
        const quote = this.quoteService.calculate(pair.sourceCurrency, pair.targetCurrency, sourceAmount, snapshot);
        await this.inject("AFTER_TARGET_AMOUNT_CALCULATION");
        const targetWalletId = targetWallet?._id;
        const identity = this.identity({ userId,
            sourceWalletId: sourceWallet._id,
            targetWalletId, snapshot, quote, idempotencyKey });
        const requestedAt = this.now();
        const session = await mongoose_1.default.startSession();
        let created = null;
        try {
            await session.withTransaction(async () => {
                created = await walletConversionRequest_repository_1.walletConversionRequestRepository.createPending({
                    conversionReference: (0, reference_util_1.generateFinancialReference)("WALLET_CONVERSION"),
                    ...identity, userId,
                    sourceWalletId: sourceWallet._id,
                    ...(targetWalletId ? { targetWalletId } : {}),
                    ...quote, fxSnapshotId: snapshot._id,
                    fxSnapshotReference: snapshot.snapshotReference,
                    fxProvider: snapshot.provider,
                    fxEffectiveDate: snapshot.effectiveDate,
                    idempotencyKey, requestedAt,
                }, session);
                await this.inject("AFTER_REQUEST_CREATION");
                await this.inject("BEFORE_AUDIT");
                await walletConversionAudit_repository_1.walletConversionAuditRepository.createOnce({
                    auditKey: (0, idempotency_util_1.createIdempotencyFingerprint)(walletConversionAuditAction_enum_1.WalletConversionAuditAction.REQUEST_CREATED, identity.conversionKey),
                    action: walletConversionAuditAction_enum_1.WalletConversionAuditAction.REQUEST_CREATED,
                    conversionReference: created.conversionReference,
                    sourceCurrency: quote.sourceCurrency,
                    targetCurrency: quote.targetCurrency,
                    sourceAmount: quote.sourceAmount,
                    targetAmount: quote.targetAmount,
                    fxSnapshotReference: snapshot.snapshotReference,
                    fxEffectiveDate: snapshot.effectiveDate,
                    requestedAt,
                }, session);
                await this.inject("BEFORE_COMMIT");
            });
        }
        catch (error) {
            if (error?.code !== 11000)
                throw error;
            const raced = await walletConversionRequest_repository_1.walletConversionRequestRepository
                .findByUserAndIdempotencyKey(userId, idempotencyKey);
            if (raced)
                return this.replay(raced, userId, input, idempotencyKey);
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Conversion identity conflicted.", "WALLET_CONVERSION_IDEMPOTENCY_CONFLICT", 409, error);
        }
        finally {
            await session.endSession();
        }
        if (!created) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Conversion request was not created.", "WALLET_CONVERSION_INTEGRITY_ERROR", 500);
        }
        return (0, walletConversionRequest_response_dto_1.toWalletConversionRequestResponseDto)(created);
    }
    async listOwn(userIdValue, pageValue, limitValue) {
        if (!mongoose_1.Types.ObjectId.isValid(userIdValue)) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Authentication is invalid.", "WALLET_CONVERSION_INTEGRITY_ERROR", 401);
        }
        const page = this.page(pageValue, 1);
        const limit = Math.min(this.page(limitValue, 20), 100);
        return (await walletConversionRequest_repository_1.walletConversionRequestRepository.listByUser(new mongoose_1.Types.ObjectId(userIdValue), page, limit)).map(walletConversionRequest_response_dto_1.toWalletConversionRequestResponseDto);
    }
    async getOwn(userIdValue, conversionReference) {
        if (!mongoose_1.Types.ObjectId.isValid(userIdValue)) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Authentication is invalid.", "WALLET_CONVERSION_INTEGRITY_ERROR", 401);
        }
        const request = await walletConversionRequest_repository_1.walletConversionRequestRepository.findByUserAndReference(new mongoose_1.Types.ObjectId(userIdValue), conversionReference);
        if (!request) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Conversion request was not found.", "WALLET_CONVERSION_REQUEST_NOT_FOUND", 404);
        }
        return (0, walletConversionRequest_response_dto_1.toWalletConversionRequestResponseDto)(request);
    }
}
exports.WalletConversionRequestService = WalletConversionRequestService;
exports.walletConversionRequestService = new WalletConversionRequestService();
