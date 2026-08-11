"use strict";
// backend/src/services/wallet/walletValidation.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletValidationService = exports.WalletValidationService = void 0;
const wallet_repository_1 = require("../../repositories/wallet/wallet.repository");
const wallet_constants_1 = require("../../constants/wallet/wallet.constants");
const walletCreation_service_1 = require("./walletCreation.service");
const WalletError_1 = require("../../errors/financial/WalletError");
/**
 * ============================================================
 * STHN Marketplace
 * Financial Domain
 * Wallet Validation Service
 * ============================================================
 *
 * Responsibility
 * --------------
 * Performs validation for Wallet projections.
 *
 * IMPORTANT
 * ---------
 * - No persistence.
 * - No balance calculations.
 * - No financial mutations.
 * - No ledger operations.
 * ============================================================
 */
class WalletValidationService {
    /**
     * Ensures that a wallet exists.
     *
     * Throws if the wallet cannot be found.
     */
    async requireWallet(userId, currency = (0, walletCreation_service_1.normalizeWalletCurrency)(wallet_constants_1.DEFAULT_WALLET_CURRENCY)) {
        const wallet = await wallet_repository_1.walletRepository.findByUserAndCurrency(userId, (0, walletCreation_service_1.normalizeWalletCurrency)(currency));
        if (!wallet) {
            throw new WalletError_1.WalletError("Wallet not found.", "WALLET_NOT_FOUND");
        }
        return wallet;
    }
    /**
     * Returns true if a wallet exists.
     */
    async walletExists(userId) {
        return wallet_repository_1.walletRepository.exists(userId, (0, walletCreation_service_1.normalizeWalletCurrency)(wallet_constants_1.DEFAULT_WALLET_CURRENCY));
    }
    /**
     * Validates wallet ownership.
     */
    validateOwnership(wallet, userId) {
        return wallet.userId.equals(userId);
    }
    /**
     * Validates the wallet currency.
     */
    validateCurrency(wallet, currency) {
        return wallet.currency === (0, walletCreation_service_1.normalizeWalletCurrency)(currency);
    }
}
exports.WalletValidationService = WalletValidationService;
exports.walletValidationService = new WalletValidationService();
