// backend/src/enums/financial/settlementStatus.enum.ts

/**
 * Represents the lifecycle of a financial settlement.
 *
 * A settlement is the process of moving successfully captured funds
 * into the marketplace's settled financial state, making them eligible
 * for downstream financial operations such as payability and payouts.
 */
export enum SettlementStatus {
  /**
   * Settlement record has been created.
   */
  CREATED = "CREATED",

  /**
   * Settlement is waiting to be processed.
   */
  PENDING = "PENDING",

  /**
   * Settlement processing has started.
   */
  PROCESSING = "PROCESSING",

  /**
   * Settlement completed successfully.
   */
  COMPLETED = "COMPLETED",

  /**
   * Settlement failed.
   */
  FAILED = "FAILED",

  /**
   * Settlement was cancelled before completion.
   */
  CANCELLED = "CANCELLED",

  /**
   * Settlement expired before processing.
   */
  EXPIRED = "EXPIRED",
}
