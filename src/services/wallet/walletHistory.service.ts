// backend/src/services/wallet/walletHistory.service.ts

import { Types } from "mongoose";

import { SupportedCurrency } from "../../constants/financial/supportedCurrencies";
import { WalletHistoryItem } from "../../types/wallet/walletHistory.types";
import { walletValidationService } from "./walletValidation.service";

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
export class WalletHistoryService {
  /**
   * Returns wallet transaction history.
   */
  async getHistory(userId: Types.ObjectId,
    currency: SupportedCurrency): Promise<WalletHistoryItem[]> {
    await walletValidationService.requireWallet(userId, currency);

    /**
     * Ledger integration will populate this list.
     */
    return [];
  }

  /**
   * Returns the most recent wallet transaction.
   */
  async getLatestTransaction(
    userId: Types.ObjectId,
    currency: SupportedCurrency,
  ): Promise<WalletHistoryItem | null> {
    const history = await this.getHistory(userId, currency);

    if (history.length === 0) {
      return null;
    }

    return history[0];
  }

  /**
   * Returns the total number of wallet transactions.
   */
  async getTransactionCount(userId: Types.ObjectId,
    currency: SupportedCurrency): Promise<number> {
    const history = await this.getHistory(userId, currency);

    return history.length;
  }
}

export const walletHistoryService = new WalletHistoryService();
