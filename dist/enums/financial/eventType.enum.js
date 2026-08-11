"use strict";
// backend/src/enums/financial/eventType.enum.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventType = void 0;
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
var EventType;
(function (EventType) {
    /* =========================================================
       Payment Lifecycle
    ========================================================= */
    EventType["PAYMENT_CREATED"] = "PAYMENT_CREATED";
    EventType["PAYMENT_INITIALIZED"] = "PAYMENT_INITIALIZED";
    EventType["PAYMENT_AUTHORIZED"] = "PAYMENT_AUTHORIZED";
    EventType["PAYMENT_CAPTURED"] = "PAYMENT_CAPTURED";
    EventType["PAYMENT_SETTLED"] = "PAYMENT_SETTLED";
    EventType["PAYMENT_FAILED"] = "PAYMENT_FAILED";
    EventType["PAYMENT_CANCELLED"] = "PAYMENT_CANCELLED";
    EventType["PAYMENT_EXPIRED"] = "PAYMENT_EXPIRED";
    EventType["PAYMENT_RETRIED"] = "PAYMENT_RETRIED";
    /* =========================================================
       Refund Lifecycle
    ========================================================= */
    EventType["REFUND_CREATED"] = "REFUND_CREATED";
    EventType["REFUND_APPROVED"] = "REFUND_APPROVED";
    EventType["REFUND_REJECTED"] = "REFUND_REJECTED";
    EventType["REFUND_PROCESSING"] = "REFUND_PROCESSING";
    EventType["REFUND_COMPLETED"] = "REFUND_COMPLETED";
    EventType["REFUND_FAILED"] = "REFUND_FAILED";
    /* =========================================================
       Settlement Lifecycle
    ========================================================= */
    EventType["SETTLEMENT_CREATED"] = "SETTLEMENT_CREATED";
    EventType["SETTLEMENT_PROCESSING"] = "SETTLEMENT_PROCESSING";
    EventType["SETTLEMENT_COMPLETED"] = "SETTLEMENT_COMPLETED";
    EventType["SETTLEMENT_FAILED"] = "SETTLEMENT_FAILED";
    /* =========================================================
       Booking Financial Lifecycle
    ========================================================= */
    EventType["BOOKING_PAYABLE"] = "BOOKING_PAYABLE";
    EventType["BOOKING_FINANCIAL_LOCKED"] = "BOOKING_FINANCIAL_LOCKED";
    EventType["BOOKING_FINANCIAL_UNLOCKED"] = "BOOKING_FINANCIAL_UNLOCKED";
    /* =========================================================
       Payout Lifecycle
    ========================================================= */
    EventType["PAYOUT_CREATED"] = "PAYOUT_CREATED";
    EventType["PAYOUT_QUEUED"] = "PAYOUT_QUEUED";
    EventType["PAYOUT_PROCESSING"] = "PAYOUT_PROCESSING";
    EventType["PAYOUT_COMPLETED"] = "PAYOUT_COMPLETED";
    EventType["PAYOUT_FAILED"] = "PAYOUT_FAILED";
    EventType["PAYOUT_CANCELLED"] = "PAYOUT_CANCELLED";
    /* =========================================================
       Ledger
    ========================================================= */
    EventType["LEDGER_ENTRY_CREATED"] = "LEDGER_ENTRY_CREATED";
    /* =========================================================
       Creator Balance
    ========================================================= */
    EventType["CREATOR_BALANCE_UPDATED"] = "CREATOR_BALANCE_UPDATED";
    /* =========================================================
       Financial Audit
    ========================================================= */
    EventType["FINANCIAL_AUDIT_CREATED"] = "FINANCIAL_AUDIT_CREATED";
    /* =========================================================
       Reconciliation
    ========================================================= */
    EventType["RECONCILIATION_STARTED"] = "RECONCILIATION_STARTED";
    EventType["RECONCILIATION_COMPLETED"] = "RECONCILIATION_COMPLETED";
    EventType["RECONCILIATION_FAILED"] = "RECONCILIATION_FAILED";
})(EventType || (exports.EventType = EventType = {}));
