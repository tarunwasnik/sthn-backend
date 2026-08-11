//backend/src/types/wallet/walletBalance.types.ts

/**
 * Wallet balance breakdown.
 */
export interface WalletBalance {
  currency: SupportedCurrency;

  currentBalance: number;

  availableBalance: number;

  pendingBalance: number;

  withdrawableBalance: number;

  lockedBalance: number;

  reservedBalance: number;
}
import { SupportedCurrency } from "../../constants/financial/supportedCurrencies";
