"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletIntegrityService = exports.WalletIntegrityService = void 0;
const supportedCurrencies_1 = require("../../constants/financial/supportedCurrencies");
const walletQuery_service_1 = require("./walletQuery.service");
const MONEY_FIELDS = [
    "currentBalance", "availableBalance", "pendingBalance", "withdrawableBalance",
    "lockedBalance", "reservedBalance", "lifetimeEarnings", "totalWithdrawn",
    "totalRefunded", "platformFees",
];
class WalletIntegrityService {
    async validate(userId) {
        const wallet = await walletQuery_service_1.walletQueryService.getWallet(userId);
        return wallet ? this.validateWallet(wallet) : false;
    }
    validateWallet(wallet) { return this.getValidationErrors(wallet).length === 0; }
    requiresSynchronization(wallet) { return !wallet.lastSyncedAt; }
    getValidationErrors(wallet) {
        const errors = [];
        if (!supportedCurrencies_1.SUPPORTED_CURRENCIES.includes(wallet.currency))
            errors.push("Wallet currency is unsupported.");
        for (const field of MONEY_FIELDS) {
            const value = wallet[field];
            if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
                errors.push(`${String(field)} must be a non-negative safe integer minor-unit value.`);
        }
        if (!Number.isSafeInteger(wallet.projectionVersion) || wallet.projectionVersion < 0)
            errors.push("Invalid projection version.");
        if (wallet.currentBalance !== wallet.availableBalance + wallet.reservedBalance + wallet.lockedBalance)
            errors.push("Current balance does not match available, reserved, and locked balances.");
        return errors;
    }
}
exports.WalletIntegrityService = WalletIntegrityService;
exports.walletIntegrityService = new WalletIntegrityService();
