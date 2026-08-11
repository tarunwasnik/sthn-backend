import { Types } from "mongoose";
import { WalletError } from "../../errors/financial/WalletError";

/** No wallet-specific immutable Ledger stream exists yet, so rebuild is unsafe. */
export class WalletRebuildService {
  async rebuild(_userId: Types.ObjectId): Promise<never> {
    throw new WalletError("Wallet rebuild is unavailable until Wallet-specific Ledger effects exist.", "WALLET_REBUILD_UNAVAILABLE");
  }
  async requiresRebuild(_userId: Types.ObjectId): Promise<boolean> { return false; }
  async rebuildAll(): Promise<never> {
    throw new WalletError("Wallet rebuild is unavailable until Wallet-specific Ledger effects exist.", "WALLET_REBUILD_UNAVAILABLE");
  }
}
export const walletRebuildService = new WalletRebuildService();
