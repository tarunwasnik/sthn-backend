export const MAX_WITHDRAWAL_FINALIZATION_RETRIES = 5;
export const BASE_WITHDRAWAL_RETRY_DELAY_MS = 1_000;
export const MAX_WITHDRAWAL_RETRY_DELAY_MS = 60_000;

export const withdrawalRetryDelay = (attempt: number) => Math.min(
  BASE_WITHDRAWAL_RETRY_DELAY_MS * 2 ** Math.max(0, attempt - 1),
  MAX_WITHDRAWAL_RETRY_DELAY_MS,
);
