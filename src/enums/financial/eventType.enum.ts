// backend/src/enums/financial/eventType.enum.ts

/**
 * Immutable financial domain events.
 *
 * Every significant financial state transition emits one of these events.
 * Events are append-only and are used for:
 *
 * - Financial auditing
 * - Background jobs
 * - Notifications
 * - Monitoring
 * - Reporting
 * - Future event-driven integrations
 *
 * Event names should remain stable once introduced.
 */
export enum EventType {
  /* =========================================================
     Payment Lifecycle
  ========================================================= */

  PAYMENT_CREATED = "PAYMENT_CREATED",
  PAYMENT_INITIALIZED = "PAYMENT_INITIALIZED",
  PAYMENT_AUTHORIZED = "PAYMENT_AUTHORIZED",
  PAYMENT_CAPTURED = "PAYMENT_CAPTURED",
  PAYMENT_SETTLED = "PAYMENT_SETTLED",
  PAYMENT_FAILED = "PAYMENT_FAILED",
  PAYMENT_CANCELLED = "PAYMENT_CANCELLED",
  PAYMENT_EXPIRED = "PAYMENT_EXPIRED",
  PAYMENT_RETRIED = "PAYMENT_RETRIED",

  /* =========================================================
     Refund Lifecycle
  ========================================================= */

  REFUND_CREATED = "REFUND_CREATED",
  REFUND_APPROVED = "REFUND_APPROVED",
  REFUND_REJECTED = "REFUND_REJECTED",
  REFUND_PROCESSING = "REFUND_PROCESSING",
  REFUND_COMPLETED = "REFUND_COMPLETED",
  REFUND_FAILED = "REFUND_FAILED",

  /* =========================================================
     Settlement Lifecycle
  ========================================================= */

  SETTLEMENT_CREATED = "SETTLEMENT_CREATED",
  SETTLEMENT_PROCESSING = "SETTLEMENT_PROCESSING",
  SETTLEMENT_COMPLETED = "SETTLEMENT_COMPLETED",
  SETTLEMENT_FAILED = "SETTLEMENT_FAILED",

  /* =========================================================
     Booking Financial Lifecycle
  ========================================================= */

  BOOKING_PAYABLE = "BOOKING_PAYABLE",
  BOOKING_FINANCIAL_LOCKED = "BOOKING_FINANCIAL_LOCKED",
  BOOKING_FINANCIAL_UNLOCKED = "BOOKING_FINANCIAL_UNLOCKED",

  /* =========================================================
     Payout Lifecycle
  ========================================================= */

  PAYOUT_CREATED = "PAYOUT_CREATED",
  PAYOUT_QUEUED = "PAYOUT_QUEUED",
  PAYOUT_PROCESSING = "PAYOUT_PROCESSING",
  PAYOUT_COMPLETED = "PAYOUT_COMPLETED",
  PAYOUT_FAILED = "PAYOUT_FAILED",
  PAYOUT_CANCELLED = "PAYOUT_CANCELLED",

  /* =========================================================
     Ledger
  ========================================================= */

  LEDGER_ENTRY_CREATED = "LEDGER_ENTRY_CREATED",

  /* =========================================================
     Creator Balance
  ========================================================= */

  CREATOR_BALANCE_UPDATED = "CREATOR_BALANCE_UPDATED",

  /* =========================================================
     Financial Audit
  ========================================================= */

  FINANCIAL_AUDIT_CREATED = "FINANCIAL_AUDIT_CREATED",

  /* =========================================================
     Reconciliation
  ========================================================= */

  RECONCILIATION_STARTED = "RECONCILIATION_STARTED",
  RECONCILIATION_COMPLETED = "RECONCILIATION_COMPLETED",
  RECONCILIATION_FAILED = "RECONCILIATION_FAILED",
}
