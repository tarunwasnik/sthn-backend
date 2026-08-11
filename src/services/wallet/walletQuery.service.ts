import { Types } from "mongoose";

import { SupportedCurrency } from "../../constants/financial/supportedCurrencies";
import { WalletDocument } from "../../models/wallet.model";
import { walletRepository } from "../../repositories/wallet/wallet.repository";
import { normalizeWalletCurrency } from "./walletCreation.service";

export class WalletQueryService {
  async getWallet(userId: Types.ObjectId, currency: SupportedCurrency): Promise<WalletDocument | null> {
    return walletRepository.findByUserAndCurrency(userId, normalizeWalletCurrency(currency));
  }

  async getBalance(userId: Types.ObjectId, currency: SupportedCurrency) {
    const wallet = await this.getWallet(userId, currency);
    if (!wallet) return null;
    return { currency: wallet.currency, currentBalance: wallet.currentBalance, availableBalance: wallet.availableBalance, pendingBalance: wallet.pendingBalance, withdrawableBalance: wallet.withdrawableBalance, lockedBalance: wallet.lockedBalance, reservedBalance: wallet.reservedBalance };
  }

  async getSummary(userId: Types.ObjectId, currency: SupportedCurrency) {
    const wallet = await this.getWallet(userId, currency);
    if (!wallet) return null;
    return { currency: wallet.currency, lifetimeEarnings: wallet.lifetimeEarnings, totalWithdrawn: wallet.totalWithdrawn, totalRefunded: wallet.totalRefunded, platformFees: wallet.platformFees };
  }

  async listWallets(userId: Types.ObjectId): Promise<WalletDocument[]> {
    return walletRepository.findAllByUser(userId);
  }

  async walletExists(userId: Types.ObjectId, currency: SupportedCurrency): Promise<boolean> {
    return walletRepository.exists(userId, normalizeWalletCurrency(currency));
  }
}

export const walletQueryService = new WalletQueryService();
