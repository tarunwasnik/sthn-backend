"use strict";
// backend/src/contracts/financial/paymentLifecycle.contract.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.PAYMENT_LIFECYCLE = void 0;
const paymentStatus_enum_1 = require("../../enums/financial/paymentStatus.enum");
/**
 * Canonical internal payment lifecycle.
 *
 * External payment providers (Razorpay, Stripe, Cashfree, PayPal, etc.)
 * must map their proprietary states into this lifecycle.
 */
exports.PAYMENT_LIFECYCLE = [
    /* ---------------------------------------------------------------------- */
    /* Payment Initialization                                                 */
    /* ---------------------------------------------------------------------- */
    {
        from: paymentStatus_enum_1.PaymentStatus.CREATED,
        to: paymentStatus_enum_1.PaymentStatus.INITIALIZING,
        trigger: "payment_initialization_started",
        operations: ["initialize_payment"],
        events: ["payment.initializing"],
    },
    {
        from: paymentStatus_enum_1.PaymentStatus.INITIALIZING,
        to: paymentStatus_enum_1.PaymentStatus.PENDING,
        trigger: "payment_session_created",
        operations: ["persist_provider_reference"],
        events: ["payment.pending"],
    },
    /* ---------------------------------------------------------------------- */
    /* Authorization                                                          */
    /* ---------------------------------------------------------------------- */
    {
        from: paymentStatus_enum_1.PaymentStatus.PENDING,
        to: paymentStatus_enum_1.PaymentStatus.AUTHORIZED,
        trigger: "payment_authorized",
        operations: [],
        events: ["payment.authorized"],
    },
    /* ---------------------------------------------------------------------- */
    /* Capture                                                                */
    /* ---------------------------------------------------------------------- */
    {
        from: paymentStatus_enum_1.PaymentStatus.AUTHORIZED,
        to: paymentStatus_enum_1.PaymentStatus.CAPTURED,
        trigger: "payment_captured",
        operations: [],
        events: ["payment.captured"],
    },
    /* ---------------------------------------------------------------------- */
    /* Settlement                                                             */
    /* ---------------------------------------------------------------------- */
    {
        from: paymentStatus_enum_1.PaymentStatus.CAPTURED,
        to: paymentStatus_enum_1.PaymentStatus.SETTLED,
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
        from: paymentStatus_enum_1.PaymentStatus.SETTLED,
        to: paymentStatus_enum_1.PaymentStatus.PARTIALLY_REFUNDED,
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
        from: paymentStatus_enum_1.PaymentStatus.SETTLED,
        to: paymentStatus_enum_1.PaymentStatus.REFUNDED,
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
        from: paymentStatus_enum_1.PaymentStatus.INITIALIZING,
        to: paymentStatus_enum_1.PaymentStatus.FAILED,
        trigger: "payment_initialization_failed",
        operations: [],
        events: ["payment.failed"],
    },
    {
        from: paymentStatus_enum_1.PaymentStatus.PENDING,
        to: paymentStatus_enum_1.PaymentStatus.FAILED,
        trigger: "payment_failed",
        operations: [],
        events: ["payment.failed"],
    },
    {
        from: paymentStatus_enum_1.PaymentStatus.AUTHORIZED,
        to: paymentStatus_enum_1.PaymentStatus.FAILED,
        trigger: "payment_capture_failed",
        operations: [],
        events: ["payment.failed"],
    },
    /* ---------------------------------------------------------------------- */
    /* Expiry                                                                 */
    /* ---------------------------------------------------------------------- */
    {
        from: paymentStatus_enum_1.PaymentStatus.PENDING,
        to: paymentStatus_enum_1.PaymentStatus.EXPIRED,
        trigger: "payment_expired",
        operations: [],
        events: ["payment.expired"],
    },
    /* ---------------------------------------------------------------------- */
    /* Cancellation                                                           */
    /* ---------------------------------------------------------------------- */
    {
        from: paymentStatus_enum_1.PaymentStatus.PENDING,
        to: paymentStatus_enum_1.PaymentStatus.CANCELLED,
        trigger: "payment_cancelled",
        operations: [],
        events: ["payment.cancelled"],
    },
];
