//backend/src/types/wallet/walletSummary.types.ts

/**
 * Wallet summary shown on dashboards.
 */
export interface WalletSummary {
  currency: SupportedCurrency;

  currentBalance: number;

  availableBalance: number;

  pendingBalance: number;

  withdrawableBalance: number;

  lifetimeEarnings: number;

  totalWithdrawn: number;

  totalRefunded: number;

  platformFees: number;
}
import { SupportedCurrency } from "../../constants/financial/supportedCurrencies";
