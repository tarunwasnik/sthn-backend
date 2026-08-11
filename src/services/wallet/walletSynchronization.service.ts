import { Types } from "mongoose";
import { SupportedCurrency } from "../../constants/financial/supportedCurrencies";
import { WalletDocument } from "../../models/wallet.model";
import { WalletError } from "../../errors/financial/WalletError";
import { walletRepository } from "../../repositories/wallet/wallet.repository";
import { walletQueryService } from "./walletQuery.service";

/** Synchronization records observation only; it never changes balances/version. */
export class WalletSynchronizationService {
  async synchronize(userId: Types.ObjectId, currency: SupportedCurrency): Promise<WalletDocument> {
    const wallet = await walletQueryService.getWallet(userId, currency);
    if (!wallet) throw new WalletError("Wallet not found.", "WALLET_NOT_FOUND");
    const updated = await walletRepository.markSynchronized(wallet._id as Types.ObjectId, new Date());
    if (!updated) throw new WalletError("Wallet synchronization failed.", "WALLET_SYNC_CONFLICT");
    return updated;
  }
  requiresSynchronization(wallet: WalletDocument): boolean { return wallet.lastSyncedAt == null; }
  async markSynchronized(wallet: WalletDocument): Promise<WalletDocument> {
    const updated = await walletRepository.markSynchronized(wallet._id as Types.ObjectId, new Date());
    if (!updated) throw new WalletError("Wallet synchronization failed.", "WALLET_SYNC_CONFLICT");
    return updated;
  }
}
export const walletSynchronizationService = new WalletSynchronizationService();
