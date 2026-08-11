import { Types } from "mongoose";
import { SUPPORTED_CURRENCIES } from "../../constants/financial/supportedCurrencies";
import { WalletDocument } from "../../models/wallet.model";
import { walletQueryService } from "./walletQuery.service";

const MONEY_FIELDS: Array<keyof WalletDocument> = [
  "currentBalance", "availableBalance", "pendingBalance", "withdrawableBalance",
  "lockedBalance", "reservedBalance", "lifetimeEarnings", "totalWithdrawn",
  "totalRefunded", "platformFees",
];

export class WalletIntegrityService {
  async validate(userId: Types.ObjectId): Promise<boolean> {
    const wallets = await walletQueryService.listWallets(userId);
    return wallets.every((wallet) => this.validateWallet(wallet));
  }
  validateWallet(wallet: WalletDocument): boolean { return this.getValidationErrors(wallet).length === 0; }
  requiresSynchronization(wallet: WalletDocument): boolean { return !wallet.lastSyncedAt; }
  getValidationErrors(wallet: WalletDocument): string[] {
    const errors: string[] = [];
    if (!SUPPORTED_CURRENCIES.includes(wallet.currency)) errors.push("Wallet currency is unsupported.");
    for (const field of MONEY_FIELDS) {
      const value = wallet[field];
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) errors.push(`${String(field)} must be a non-negative safe integer minor-unit value.`);
    }
    if (!Number.isSafeInteger(wallet.projectionVersion) || wallet.projectionVersion < 0) errors.push("Invalid projection version.");
    if (wallet.currentBalance !== wallet.availableBalance + wallet.reservedBalance + wallet.lockedBalance) errors.push("Current balance does not match available, reserved, and locked balances.");
    return errors;
  }
}
export const walletIntegrityService = new WalletIntegrityService();
