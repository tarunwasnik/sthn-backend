//backend/src/types/wallet/wallet.types.ts

/**
 * ============================================================
 * STHN Marketplace
 * Financial Domain
 * Wallet Types
 * ============================================================
 */

export interface WalletProjection {
  userId: string;

  currency: SupportedCurrency;

  currentBalance: number;

  availableBalance: number;

  pendingBalance: number;

  withdrawableBalance: number;

  lockedBalance: number;

  reservedBalance: number;

  lifetimeEarnings: number;

  totalWithdrawn: number;

  totalRefunded: number;

  platformFees: number;

  projectionVersion: number;

  lastSyncedAt?: Date;

  createdAt: Date;

  updatedAt: Date;
}
import { SupportedCurrency } from "../../constants/financial/supportedCurrencies";
