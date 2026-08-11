//backend/src/types/wallet/walletHistory.types.ts

/**
 * Wallet history item.
 *
 * Wallet history references financial events.
 * It is not the Ledger.
 */
export interface WalletHistoryItem {
  id: string;

  eventType: string;

  referenceId: string;

  amount: number;

  currency: string;

  occurredAt: Date;

  description?: string;
}

export interface WalletHistoryPage {
  items: WalletHistoryItem[];

  page: number;

  limit: number;

  total: number;

  totalPages: number;
}
