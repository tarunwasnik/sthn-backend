export const WALLET_TOP_UP_RETRY_POLICY = {
  MAX_ACCOUNTING_RETRIES: 5,
  BASE_RETRY_DELAY_MS: 60_000,
  MAX_RETRY_DELAY_MS: 60 * 60_000,
} as const;

export const walletTopUpRetryDelay = (attempt: number): number =>
  Math.min(
    WALLET_TOP_UP_RETRY_POLICY.BASE_RETRY_DELAY_MS * (2 ** Math.max(attempt - 1, 0)),
    WALLET_TOP_UP_RETRY_POLICY.MAX_RETRY_DELAY_MS,
  );
