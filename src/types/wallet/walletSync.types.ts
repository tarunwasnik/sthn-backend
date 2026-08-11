//backend/src/types/wallet/walletSync.types.ts

/**
 * Wallet synchronization state.
 */
export interface WalletSyncState {
  walletId: string;

  lastProcessedEventId?: string;

  lastSyncedAt?: Date;

  projectionVersion: number;
}
