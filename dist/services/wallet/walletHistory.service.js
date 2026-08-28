"use strict";
// backend/src/services/wallet/walletHistory.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletHistoryService = exports.WalletHistoryService = void 0;
const walletValidation_service_1 = require("./walletValidation.service");
/**
 * ============================================================
 * STHN Marketplace
 * Financial Domain
 * Wallet History Service
 * ============================================================
 *
 * Responsibility
 * --------------
 * Provides Wallet transaction history.
 *
 * IMPORTANT
 * ---------
 * - Wallet history is derived from the Financial Ledger.
 * - Wallet does not own financial transactions.
 * - Ledger integration will be implemented in a later phase.
 * - This service is read-only.
 * ============================================================
 */
class WalletHistoryService {
    /**
     * Returns wallet transaction history.
     */
    async getHistory(userId, currency) {
        await walletValidation_service_1.walletValidationService.requireWallet(userId, currency);
        /**
         * Ledger integration will populate this list.
         */
        return [];
    }
    /**
     * Returns the most recent wallet transaction.
     */
    async getLatestTransaction(userId, currency) {
        const history = await this.getHistory(userId, currency);
        if (history.length === 0) {
            return null;
        }
        return history[0];
    }
    /**
     * Returns the total number of wallet transactions.
     */
    async getTransactionCount(userId, currency) {
        const history = await this.getHistory(userId, currency);
        return history.length;
    }
}
exports.WalletHistoryService = WalletHistoryService;
exports.walletHistoryService = new WalletHistoryService();
