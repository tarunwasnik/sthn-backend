//backend/src/types/wallet/walletSnapshot.types.ts

/**
 * Wallet snapshot metadata.
 */
export interface WalletSnapshot {
  walletId: string;

  projectionVersion: number;

  snapshotAt: Date;

  ledgerSequence?: number;
}
