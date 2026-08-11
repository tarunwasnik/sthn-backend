// backend/src/contracts/financial/paymentLifecycle.contract.ts

import { PaymentStatus } from "../../enums/financial/paymentStatus.enum";

/**
 * Represents a valid business transition within the internal payment lifecycle.
 *
 * This contract is provider-independent and describes how payments move
 * through the Financial Domain.
 */
export interface PaymentLifecycleTransition {
  /**
   * Current payment status.
   */
  from: PaymentStatus;

  /**
   * Next payment status.
   */
  to: PaymentStatus;

  /**
   * Business trigger responsible for the transition.
   */
  trigger: string;

  /**
   * Financial operations executed during this transition.
   */
  operations: readonly string[];

  /**
   * Financial domain events published after successful completion.
   */
  events: readonly string[];
}

/**
 * Canonical internal payment lifecycle.
 *
 * External payment providers (Razorpay, Stripe, Cashfree, PayPal, etc.)
 * must map their proprietary states into this lifecycle.
 */
export const PAYMENT_LIFECYCLE: readonly PaymentLifecycleTransition[] = [
  /* ---------------------------------------------------------------------- */
  /* Payment Initialization                                                 */
  /* ---------------------------------------------------------------------- */

  {
    from: PaymentStatus.CREATED,
    to: PaymentStatus.INITIALIZING,
    trigger: "payment_initialization_started",

    operations: ["initialize_payment"],

    events: ["payment.initializing"],
  },

  {
    from: PaymentStatus.INITIALIZING,
    to: PaymentStatus.PENDING,
    trigger: "payment_session_created",

    operations: ["persist_provider_reference"],

    events: ["payment.pending"],
  },

  /* ---------------------------------------------------------------------- */
  /* Authorization                                                          */
  /* ---------------------------------------------------------------------- */

  {
    from: PaymentStatus.PENDING,
    to: PaymentStatus.AUTHORIZED,
    trigger: "payment_authorized",

    operations: [],

    events: ["payment.authorized"],
  },

  /* ---------------------------------------------------------------------- */
  /* Capture                                                                */
  /* ---------------------------------------------------------------------- */

  {
    from: PaymentStatus.AUTHORIZED,
    to: PaymentStatus.CAPTURED,
    trigger: "payment_captured",

    operations: [],

    events: ["payment.captured"],
  },

  /* ---------------------------------------------------------------------- */
  /* Settlement                                                             */
  /* ---------------------------------------------------------------------- */

  {
    from: PaymentStatus.CAPTURED,
    to: PaymentStatus.SETTLED,
    trigger: "payment_settled",

    operations: [
      "create_settlement",
      "post_ledger_entries",
      "update_creator_balance",
    ],

    events: [
      "payment.settled",
      "settlement.created",
      "ledger.entries.created",
      "creator.balance.updated",
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Partial Refund                                                         */
  /* ---------------------------------------------------------------------- */

  {
    from: PaymentStatus.SETTLED,
    to: PaymentStatus.PARTIALLY_REFUNDED,
    trigger: "partial_refund_completed",

    operations: [
      "create_partial_refund",
      "post_partial_refund_ledger_entries",
      "update_creator_balance",
    ],

    events: [
      "payment.partially_refunded",
      "refund.partial.completed",
      "ledger.partial_refund.created",
      "creator.balance.updated",
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Full Refund                                                            */
  /* ---------------------------------------------------------------------- */

  {
    from: PaymentStatus.SETTLED,
    to: PaymentStatus.REFUNDED,
    trigger: "full_refund_completed",

    operations: [
      "create_refund",
      "post_refund_ledger_entries",
      "update_creator_balance",
    ],

    events: [
      "payment.refunded",
      "refund.completed",
      "ledger.refund.created",
      "creator.balance.updated",
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Failure                                                                */
  /* ---------------------------------------------------------------------- */

  {
    from: PaymentStatus.INITIALIZING,
    to: PaymentStatus.FAILED,
    trigger: "payment_initialization_failed",

    operations: [],

    events: ["payment.failed"],
  },

  {
    from: PaymentStatus.PENDING,
    to: PaymentStatus.FAILED,
    trigger: "payment_failed",

    operations: [],

    events: ["payment.failed"],
  },

  {
    from: PaymentStatus.AUTHORIZED,
    to: PaymentStatus.FAILED,
    trigger: "payment_capture_failed",

    operations: [],

    events: ["payment.failed"],
  },

  /* ---------------------------------------------------------------------- */
  /* Expiry                                                                 */
  /* ---------------------------------------------------------------------- */

  {
    from: PaymentStatus.PENDING,
    to: PaymentStatus.EXPIRED,
    trigger: "payment_expired",

    operations: [],

    events: ["payment.expired"],
  },

  /* ---------------------------------------------------------------------- */
  /* Cancellation                                                           */
  /* ---------------------------------------------------------------------- */

  {
    from: PaymentStatus.PENDING,
    to: PaymentStatus.CANCELLED,
    trigger: "payment_cancelled",

    operations: [],

    events: ["payment.cancelled"],
  },
] as const;
