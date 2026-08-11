"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletProjectionService = exports.WalletProjectionService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const mongoose_1 = __importDefault(require("mongoose"));
const WalletError_1 = require("../../errors/financial/WalletError");
const wallet_repository_1 = require("../../repositories/wallet/wallet.repository");
const financialLimits_1 = require("../../constants/financial/financialLimits");
const walletProjectionOperation_repository_1 = require("../../repositories/wallet/walletProjectionOperation.repository");
const walletCreation_service_1 = require("./walletCreation.service");
class WalletProjectionService {
    normalizedDeltas(deltas) {
        const values = {
            availableBalance: deltas.availableBalance ?? 0,
            reservedBalance: deltas.reservedBalance ?? 0,
            lockedBalance: deltas.lockedBalance ?? 0,
        };
        if (Object.values(values).every((value) => value === 0) || !Object.values(values).every(Number.isSafeInteger)) {
            throw new WalletError_1.WalletError("Wallet projection deltas must include a non-zero safe integer minor-unit value.", "WALLET_INVALID_MINOR_UNIT");
        }
        return values;
    }
    normalizedMinimums(deltas, providedMinimums) {
        return {
            availableBalance: Math.max(providedMinimums.availableBalance ?? 0, -deltas.availableBalance, 0),
            reservedBalance: Math.max(providedMinimums.reservedBalance ?? 0, -deltas.reservedBalance, 0),
            lockedBalance: Math.max(providedMinimums.lockedBalance ?? 0, -deltas.lockedBalance, 0),
        };
    }
    maximums(deltas) {
        return {
            availableBalance: deltas.availableBalance > 0 ? financialLimits_1.FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT - deltas.availableBalance : undefined,
            reservedBalance: deltas.reservedBalance > 0 ? financialLimits_1.FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT - deltas.reservedBalance : undefined,
            lockedBalance: deltas.lockedBalance > 0 ? financialLimits_1.FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT - deltas.lockedBalance : undefined,
        };
    }
    normalizedLedgerEntryIds(ids) {
        const normalized = (ids ?? []).slice().sort((a, b) => a.toString().localeCompare(b.toString()));
        if (new Set(normalized.map((id) => id.toString())).size !== normalized.length) {
            throw new WalletError_1.WalletError("Wallet projection Ledger entry identifiers must be unique.", "WALLET_INVALID_LEDGER_ENTRIES");
        }
        return normalized;
    }
    fingerprint(input, currency, deltas, minimums, ledgerEntryIds) {
        const canonical = [
            input.userId.toString(), currency, input.operationKey.trim(),
            deltas.availableBalance, deltas.reservedBalance, deltas.lockedBalance,
            minimums.availableBalance ?? "", minimums.reservedBalance ?? "", minimums.lockedBalance ?? "",
            ledgerEntryIds.map((id) => id.toString()).join(","),
        ].join("|");
        return crypto_1.default.createHash("sha256").update(canonical).digest("hex");
    }
    validateMinimums(minimums) {
        if (!Object.values(minimums).every((value) => value === undefined || Number.isSafeInteger(value) && value >= 0)) {
            throw new WalletError_1.WalletError("Wallet balance minimums must be non-negative safe integer minor units.", "WALLET_INVALID_MINOR_UNIT");
        }
    }
    async replayOrConflict(operationKey, fingerprint, session) {
        const existing = await walletProjectionOperation_repository_1.walletProjectionOperationRepository.findByOperationKey(operationKey, session);
        if (!existing)
            return null;
        if (existing.fingerprint !== fingerprint) {
            throw new WalletError_1.WalletError("Wallet projection operation key conflicts with a different payload.", "WALLET_PROJECTION_REPLAY_CONFLICT");
        }
        const wallet = await wallet_repository_1.walletRepository.findById(existing.walletId, session);
        if (!wallet)
            throw new WalletError_1.WalletError("Committed wallet projection operation references no wallet.", "WALLET_INVARIANT_VIOLATION");
        return wallet;
    }
    isOperationKeyDuplicate(error) {
        return typeof error === "object" && error !== null &&
            "code" in error && error.code === 11000 &&
            "keyPattern" in error &&
            error.keyPattern?.operationKey === 1;
    }
    async classifyConditionalMiss(walletId, minimums, maximums, maximumCurrentBalance, session) {
        const wallet = await wallet_repository_1.walletRepository.findById(walletId, session);
        if (!wallet)
            throw new WalletError_1.WalletError("Wallet not found.", "WALLET_NOT_FOUND");
        if (wallet.currentBalance !== wallet.availableBalance + wallet.reservedBalance + wallet.lockedBalance) {
            throw new WalletError_1.WalletError("Wallet balance invariant is invalid.", "WALLET_INVARIANT_VIOLATION");
        }
        const belowMinimum = ["availableBalance", "reservedBalance", "lockedBalance"]
            .some((field) => minimums[field] !== undefined && wallet[field] < minimums[field]);
        if (belowMinimum)
            throw new WalletError_1.WalletError("Wallet balance minimum was not satisfied.", "WALLET_INSUFFICIENT_BALANCE");
        const aboveMaximum = ["availableBalance", "reservedBalance", "lockedBalance"]
            .some((field) => maximums[field] !== undefined && wallet[field] > maximums[field]);
        if (aboveMaximum || (maximumCurrentBalance !== undefined && wallet.currentBalance > maximumCurrentBalance)) {
            throw new WalletError_1.WalletError("Wallet maximum balance would be exceeded.", "WALLET_MAXIMUM_BALANCE_EXCEEDED");
        }
        throw new WalletError_1.WalletError("Wallet projection mutation conflicted. Retry the operation.", "WALLET_PROJECTION_CONFLICT");
    }
    async applyProjectionMutation(input, suppliedSession) {
        if (suppliedSession && !suppliedSession.inTransaction()) {
            throw new WalletError_1.WalletError("Wallet projection mutations require an active caller-owned transaction.", "WALLET_TRANSACTION_REQUIRED");
        }
        const currency = (0, walletCreation_service_1.normalizeWalletCurrency)(input.currency);
        if (!input.operationKey?.trim())
            throw new WalletError_1.WalletError("Wallet projection operation key is required.", "WALLET_OPERATION_KEY_REQUIRED");
        const deltas = this.normalizedDeltas(input.deltas);
        const providedMinimums = input.minimums ?? {};
        this.validateMinimums(providedMinimums);
        const minimums = this.normalizedMinimums(deltas, providedMinimums);
        const maximums = this.maximums(deltas);
        const totalDelta = deltas.availableBalance + deltas.reservedBalance + deltas.lockedBalance;
        const ledgerEntryIds = this.normalizedLedgerEntryIds(input.ledgerEntryIds);
        const fingerprint = this.fingerprint(input, currency, deltas, minimums, ledgerEntryIds);
        const execute = async (session) => {
            const replay = await this.replayOrConflict(input.operationKey.trim(), fingerprint, session);
            if (replay)
                return replay;
            const wallet = await wallet_repository_1.walletRepository.findByUserAndCurrency(input.userId, currency, session);
            if (!wallet)
                throw new WalletError_1.WalletError("Wallet not found.", "WALLET_NOT_FOUND");
            const updated = await wallet_repository_1.walletRepository.applyConditionalDelta(wallet._id, minimums, maximums, totalDelta > 0 ? financialLimits_1.FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT - totalDelta : undefined, {
                $inc: {
                    availableBalance: deltas.availableBalance,
                    reservedBalance: deltas.reservedBalance,
                    lockedBalance: deltas.lockedBalance,
                    currentBalance: deltas.availableBalance + deltas.reservedBalance + deltas.lockedBalance,
                    projectionVersion: 1,
                },
                $set: { lastSyncedAt: new Date() },
            }, session);
            if (!updated) {
                await this.classifyConditionalMiss(wallet._id, minimums, maximums, totalDelta > 0 ? financialLimits_1.FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT - totalDelta : undefined, session);
                throw new WalletError_1.WalletError("Wallet projection mutation conflicted.", "WALLET_PROJECTION_CONFLICT");
            }
            await walletProjectionOperation_repository_1.walletProjectionOperationRepository.create({
                operationReference: `WPO-${crypto_1.default.createHash("sha256").update(input.operationKey.trim()).digest("hex").slice(0, 16).toUpperCase()}`,
                walletId: updated._id,
                userId: input.userId,
                currency,
                operationKey: input.operationKey.trim(),
                fingerprint,
                deltas,
                ledgerEntryIds,
                projectionVersion: updated.projectionVersion,
            }, session);
            return updated;
        };
        if (suppliedSession)
            return execute(suppliedSession);
        const session = await mongoose_1.default.startSession();
        let result = null;
        try {
            await session.withTransaction(async () => { result = await execute(session); });
        }
        catch (error) {
            if (!this.isOperationKeyDuplicate(error))
                throw error;
            const replay = await this.replayOrConflict(input.operationKey.trim(), fingerprint);
            if (replay)
                return replay;
            throw error;
        }
        finally {
            await session.endSession();
        }
        if (!result)
            throw new WalletError_1.WalletError("Wallet projection mutation did not commit.", "WALLET_PROJECTION_CONFLICT");
        return result;
    }
}
exports.WalletProjectionService = WalletProjectionService;
exports.walletProjectionService = new WalletProjectionService();
