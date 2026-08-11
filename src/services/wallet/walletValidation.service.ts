// backend/src/services/wallet/walletValidation.service.ts

import { Types } from "mongoose";

import { WalletDocument } from "../../models/wallet.model";
import { walletRepository } from "../../repositories/wallet/wallet.repository";
import { normalizeWalletCurrency } from "./walletCreation.service";
import { SupportedCurrency } from "../../constants/financial/supportedCurrencies";
import { WalletError } from "../../errors/financial/WalletError";

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
export class WalletValidationService {
  /**
   * Ensures that a wallet exists.
   *
   * Throws if the wallet cannot be found.
   */
  async requireWallet(
    userId: Types.ObjectId,
    currency: SupportedCurrency,
  ): Promise<WalletDocument> {
    const wallet = await walletRepository.findByUserAndCurrency(
      userId,
      normalizeWalletCurrency(currency),
    );

    if (!wallet) {
      throw new WalletError("Wallet not found.", "WALLET_NOT_FOUND");
    }

    return wallet;
  }

  /**
   * Returns true if a wallet exists.
   */
  async walletExists(userId: Types.ObjectId, currency: SupportedCurrency): Promise<boolean> {
    return walletRepository.exists(
      userId,
      normalizeWalletCurrency(currency),
    );
  }

  /**
   * Validates wallet ownership.
   */
  validateOwnership(wallet: WalletDocument, userId: Types.ObjectId): boolean {
    return wallet.userId.equals(userId);
  }

  /**
   * Validates the wallet currency.
   */
  validateCurrency(wallet: WalletDocument, currency: string): boolean {
    return wallet.currency === normalizeWalletCurrency(currency);
  }
}

export const walletValidationService = new WalletValidationService();
