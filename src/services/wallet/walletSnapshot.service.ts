// backend/src/types/wallet/walletSnapshot.types.ts

import { Types } from "mongoose";

/**
 * ============================================================
 * STHN Marketplace
 * Financial Domain
 * Wallet Snapshot
 * ============================================================
 *
 * Immutable projection checkpoint used for rebuilding the
 * Wallet projection from the Ledger.
 * ============================================================
 */
export interface WalletSnapshot {
  walletId: string;

  userId: string;

  currency: string;

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

  ledgerSequence?: number;
}
