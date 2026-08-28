"use strict";
// backend/src/enums/financial/auditAction.enum.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditAction = void 0;
/**
 * Canonical audit actions for the Financial Domain.
 *
 * Every auditable financial operation should record one of these actions.
 * Audit records are immutable and provide a complete history of financial
 * activity for compliance, reporting, reconciliation, and investigations.
 */
var AuditAction;
(function (AuditAction) {
    /* =========================================================
       Payment
    ========================================================= */
    AuditAction["PAYMENT_CREATED"] = "PAYMENT_CREATED";
    AuditAction["PAYMENT_INITIALIZED"] = "PAYMENT_INITIALIZED";
    AuditAction["PAYMENT_PROVIDER_SYNCHRONIZED"] = "PAYMENT_PROVIDER_SYNCHRONIZED";
    AuditAction["PAYMENT_OUTCOME_UNKNOWN"] = "PAYMENT_OUTCOME_UNKNOWN";
    AuditAction["PAYMENT_REPLAY_DETECTED"] = "PAYMENT_REPLAY_DETECTED";
    AuditAction["PAYMENT_AUTHORIZED"] = "PAYMENT_AUTHORIZED";
    AuditAction["PAYMENT_CAPTURED"] = "PAYMENT_CAPTURED";
    AuditAction["PAYMENT_SETTLED"] = "PAYMENT_SETTLED";
    AuditAction["PAYMENT_FAILED"] = "PAYMENT_FAILED";
    AuditAction["PAYMENT_CANCELLED"] = "PAYMENT_CANCELLED";
    AuditAction["PAYMENT_EXPIRED"] = "PAYMENT_EXPIRED";
    AuditAction["BOOKING_WALLET_RESERVATION_RELEASED"] = "BOOKING_WALLET_RESERVATION_RELEASED";
    AuditAction["BOOKING_WALLET_RESERVATION_CAPTURED"] = "BOOKING_WALLET_RESERVATION_CAPTURED";
    AuditAction["BOOKING_ESCROW_ALLOCATED"] = "BOOKING_ESCROW_ALLOCATED";
    AuditAction["BOOKING_CREATOR_WALLET_SETTLED"] = "BOOKING_CREATOR_WALLET_SETTLED";
    AuditAction["BOOKING_CREATOR_SETTLEMENT_RECONCILED"] = "BOOKING_CREATOR_SETTLEMENT_RECONCILED";
    AuditAction["BOOKING_CREATOR_SETTLEMENT_RETRIED"] = "BOOKING_CREATOR_SETTLEMENT_RETRIED";
    AuditAction["BOOKING_CREATOR_SETTLEMENT_REPAIRED"] = "BOOKING_CREATOR_SETTLEMENT_REPAIRED";
    AuditAction["PAYMENT_RETRIED"] = "PAYMENT_RETRIED";
    /* =========================================================
       Refund
    ========================================================= */
    AuditAction["REFUND_CREATED"] = "REFUND_CREATED";
    AuditAction["REFUND_APPROVED"] = "REFUND_APPROVED";
    AuditAction["REFUND_REJECTED"] = "REFUND_REJECTED";
    AuditAction["REFUND_COMPLETED"] = "REFUND_COMPLETED";
    AuditAction["REFUND_FAILED"] = "REFUND_FAILED";
    AuditAction["REFUND_REQUESTED"] = "REFUND_REQUESTED";
    AuditAction["REFUND_PROVIDER_INITIATED"] = "REFUND_PROVIDER_INITIATED";
    AuditAction["REFUND_PROVIDER_SYNCHRONIZED"] = "REFUND_PROVIDER_SYNCHRONIZED";
    AuditAction["REFUND_OUTCOME_UNKNOWN"] = "REFUND_OUTCOME_UNKNOWN";
    AuditAction["REFUND_REPLAY_DETECTED"] = "REFUND_REPLAY_DETECTED";
    AuditAction["ESCROW_FUNDS_RECOGNIZED"] = "ESCROW_FUNDS_RECOGNIZED";
    /* =========================================================
       Settlement
    ========================================================= */
    AuditAction["SETTLEMENT_CREATED"] = "SETTLEMENT_CREATED";
    AuditAction["SETTLEMENT_COMPLETED"] = "SETTLEMENT_COMPLETED";
    AuditAction["SETTLEMENT_FAILED"] = "SETTLEMENT_FAILED";
    AuditAction["SETTLEMENT_ELIGIBILITY_BLOCKED"] = "SETTLEMENT_ELIGIBILITY_BLOCKED";
    AuditAction["SETTLEMENT_STARTED"] = "SETTLEMENT_STARTED";
    AuditAction["SETTLEMENT_REPLAY_DETECTED"] = "SETTLEMENT_REPLAY_DETECTED";
    AuditAction["SETTLEMENT_CONFLICT_DETECTED"] = "SETTLEMENT_CONFLICT_DETECTED";
    /* =========================================================
       Payability
    ========================================================= */
    AuditAction["BOOKING_MARKED_PAYABLE"] = "BOOKING_MARKED_PAYABLE";
    AuditAction["BOOKING_PAYABILITY_REVOKED"] = "BOOKING_PAYABILITY_REVOKED";
    /* =========================================================
       Payout
    ========================================================= */
    AuditAction["PAYOUT_CREATED"] = "PAYOUT_CREATED";
    AuditAction["PAYOUT_COMPLETED"] = "PAYOUT_COMPLETED";
    AuditAction["PAYOUT_FAILED"] = "PAYOUT_FAILED";
    AuditAction["PAYOUT_CANCELLED"] = "PAYOUT_CANCELLED";
    AuditAction["PAYOUT_PROCESS_REQUESTED"] = "PAYOUT_PROCESS_REQUESTED";
    AuditAction["PAYOUT_PROCESSING_STARTED"] = "PAYOUT_PROCESSING_STARTED";
    AuditAction["PAYOUT_PROVIDER_REQUESTED"] = "PAYOUT_PROVIDER_REQUESTED";
    AuditAction["PAYOUT_PROVIDER_SYNCHRONIZED"] = "PAYOUT_PROVIDER_SYNCHRONIZED";
    AuditAction["PAYOUT_SUCCEEDED"] = "PAYOUT_SUCCEEDED";
    AuditAction["PAYOUT_OUTCOME_UNKNOWN"] = "PAYOUT_OUTCOME_UNKNOWN";
    AuditAction["PAYOUT_REPLAY_DETECTED"] = "PAYOUT_REPLAY_DETECTED";
    AuditAction["WITHDRAWAL_REQUESTED"] = "WITHDRAWAL_REQUESTED";
    AuditAction["CREATOR_WITHDRAWAL_REQUESTED"] = "CREATOR_WITHDRAWAL_REQUESTED";
    AuditAction["CREATOR_WITHDRAWAL_PROVIDER_INITIALIZED"] = "CREATOR_WITHDRAWAL_PROVIDER_INITIALIZED";
    AuditAction["CREATOR_WITHDRAWAL_PROVIDER_PROCESSING"] = "CREATOR_WITHDRAWAL_PROVIDER_PROCESSING";
    AuditAction["CREATOR_WITHDRAWAL_PROVIDER_SUCCEEDED"] = "CREATOR_WITHDRAWAL_PROVIDER_SUCCEEDED";
    AuditAction["CREATOR_WITHDRAWAL_PROVIDER_FAILED"] = "CREATOR_WITHDRAWAL_PROVIDER_FAILED";
    AuditAction["CREATOR_WITHDRAWAL_COMPLETED"] = "CREATOR_WITHDRAWAL_COMPLETED";
    AuditAction["CREATOR_WITHDRAWAL_FAILED"] = "CREATOR_WITHDRAWAL_FAILED";
    AuditAction["CREATOR_WITHDRAWAL_RECONCILIATION_CREATED"] = "CREATOR_WITHDRAWAL_RECONCILIATION_CREATED";
    AuditAction["CREATOR_WITHDRAWAL_FINALIZATION_RETRIED"] = "CREATOR_WITHDRAWAL_FINALIZATION_RETRIED";
    AuditAction["CREATOR_WITHDRAWAL_METADATA_REPAIRED"] = "CREATOR_WITHDRAWAL_METADATA_REPAIRED";
    AuditAction["CREATOR_WITHDRAWAL_RECONCILIATION_ACKNOWLEDGED"] = "CREATOR_WITHDRAWAL_RECONCILIATION_ACKNOWLEDGED";
    AuditAction["CREATOR_WITHDRAWAL_RECONCILIATION_RESOLVED"] = "CREATOR_WITHDRAWAL_RECONCILIATION_RESOLVED";
    AuditAction["WITHDRAWAL_FUNDS_RESERVED"] = "WITHDRAWAL_FUNDS_RESERVED";
    AuditAction["WITHDRAWAL_CANCELLED"] = "WITHDRAWAL_CANCELLED";
    AuditAction["WITHDRAWAL_RESERVATION_RELEASED"] = "WITHDRAWAL_RESERVATION_RELEASED";
    /* =========================================================
       Ledger
    ========================================================= */
    AuditAction["LEDGER_ENTRY_CREATED"] = "LEDGER_ENTRY_CREATED";
    /* =========================================================
       Balance
    ========================================================= */
    AuditAction["CREATOR_BALANCE_UPDATED"] = "CREATOR_BALANCE_UPDATED";
    /* =========================================================
       Financial Locks
    ========================================================= */
    AuditAction["FINANCIAL_LOCK_APPLIED"] = "FINANCIAL_LOCK_APPLIED";
    AuditAction["FINANCIAL_LOCK_RELEASED"] = "FINANCIAL_LOCK_RELEASED";
    /* =========================================================
       Administrative
    ========================================================= */
    AuditAction["MANUAL_ADJUSTMENT"] = "MANUAL_ADJUSTMENT";
    AuditAction["MANUAL_CORRECTION"] = "MANUAL_CORRECTION";
    AuditAction["ADMIN_PAYMENT_SYNC_REQUESTED"] = "ADMIN_PAYMENT_SYNC_REQUESTED";
    AuditAction["ADMIN_REFUND_SYNC_REQUESTED"] = "ADMIN_REFUND_SYNC_REQUESTED";
    AuditAction["ADMIN_SETTLEMENT_RECHECK_REQUESTED"] = "ADMIN_SETTLEMENT_RECHECK_REQUESTED";
    AuditAction["ADMIN_WITHDRAWAL_PROCESS_REQUESTED"] = "ADMIN_WITHDRAWAL_PROCESS_REQUESTED";
    AuditAction["ADMIN_WITHDRAWAL_SYNC_REQUESTED"] = "ADMIN_WITHDRAWAL_SYNC_REQUESTED";
    AuditAction["ADMIN_PAYOUT_SYNC_REQUESTED"] = "ADMIN_PAYOUT_SYNC_REQUESTED";
    AuditAction["ADMIN_BOOKING_ESCROW_MANUAL_RELEASED"] = "ADMIN_BOOKING_ESCROW_MANUAL_RELEASED";
    /* =========================================================
       Reconciliation
    ========================================================= */
    AuditAction["RECONCILIATION_STARTED"] = "RECONCILIATION_STARTED";
    AuditAction["RECONCILIATION_COMPLETED"] = "RECONCILIATION_COMPLETED";
    AuditAction["RECONCILIATION_FAILED"] = "RECONCILIATION_FAILED";
    AuditAction["WITHDRAWAL_RECONCILIATION_APPLIED"] = "WITHDRAWAL_RECONCILIATION_APPLIED";
    AuditAction["WITHDRAWAL_RECONCILIATION_CONFLICT"] = "WITHDRAWAL_RECONCILIATION_CONFLICT";
})(AuditAction || (exports.AuditAction = AuditAction = {}));
