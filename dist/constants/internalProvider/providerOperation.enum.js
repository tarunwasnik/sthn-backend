"use strict";
// backend/src/constants/internalProvider/providerOperation.enum.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderOperation = void 0;
/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Operation
 * ------------------------------------------------------------------
 *
 * Represents executable operations supported by a payment provider.
 *
 * These operations are used by:
 * - Internal Provider
 * - Admin Simulator
 * - Future Payment Providers
 * - Retry Engine
 * - Job Scheduler
 * - Reconciliation Engine
 *
 * NOTE:
 * This enum represents ACTIONS, not EVENTS or STATUSES.
 * ------------------------------------------------------------------
 */
var ProviderOperation;
(function (ProviderOperation) {
    ProviderOperation["CREATE_CONVERSION_PROVIDER_REQUEST"] = "CREATE_CONVERSION_PROVIDER_REQUEST";
    ProviderOperation["INITIALIZE_CONVERSION_PROVIDER_REQUEST"] = "INITIALIZE_CONVERSION_PROVIDER_REQUEST";
    ProviderOperation["PROCESS_CONVERSION_PROVIDER_REQUEST"] = "PROCESS_CONVERSION_PROVIDER_REQUEST";
    ProviderOperation["SUCCEED_CONVERSION_PROVIDER_REQUEST"] = "SUCCEED_CONVERSION_PROVIDER_REQUEST";
    ProviderOperation["FAIL_CONVERSION_PROVIDER_REQUEST"] = "FAIL_CONVERSION_PROVIDER_REQUEST";
    ProviderOperation["CREATE_WITHDRAWAL_PROVIDER_REQUEST"] = "CREATE_WITHDRAWAL_PROVIDER_REQUEST";
    ProviderOperation["INITIALIZE_WITHDRAWAL_PROVIDER_REQUEST"] = "INITIALIZE_WITHDRAWAL_PROVIDER_REQUEST";
    ProviderOperation["PROCESS_WITHDRAWAL_PROVIDER_REQUEST"] = "PROCESS_WITHDRAWAL_PROVIDER_REQUEST";
    ProviderOperation["SUCCEED_WITHDRAWAL_PROVIDER_REQUEST"] = "SUCCEED_WITHDRAWAL_PROVIDER_REQUEST";
    ProviderOperation["FAIL_WITHDRAWAL_PROVIDER_REQUEST"] = "FAIL_WITHDRAWAL_PROVIDER_REQUEST";
    ProviderOperation["CREATE_TOP_UP_FUNDING"] = "CREATE_TOP_UP_FUNDING";
    ProviderOperation["PROCESS_TOP_UP_FUNDING"] = "PROCESS_TOP_UP_FUNDING";
    ProviderOperation["SUCCEED_TOP_UP_FUNDING"] = "SUCCEED_TOP_UP_FUNDING";
    ProviderOperation["FAIL_TOP_UP_FUNDING"] = "FAIL_TOP_UP_FUNDING";
    /**
     * Payment Operations
     */
    ProviderOperation["CREATE_PAYMENT"] = "CREATE_PAYMENT";
    ProviderOperation["AUTHORIZE_PAYMENT"] = "AUTHORIZE_PAYMENT";
    ProviderOperation["CAPTURE_PAYMENT"] = "CAPTURE_PAYMENT";
    ProviderOperation["PARTIAL_CAPTURE_PAYMENT"] = "PARTIAL_CAPTURE_PAYMENT";
    ProviderOperation["CANCEL_PAYMENT"] = "CANCEL_PAYMENT";
    ProviderOperation["EXPIRE_PAYMENT"] = "EXPIRE_PAYMENT";
    ProviderOperation["FAIL_PAYMENT"] = "FAIL_PAYMENT";
    /**
     * Refund Operations
     */
    ProviderOperation["CREATE_REFUND"] = "CREATE_REFUND";
    ProviderOperation["PROCESS_REFUND"] = "PROCESS_REFUND";
    ProviderOperation["PARTIAL_REFUND"] = "PARTIAL_REFUND";
    ProviderOperation["COMPLETE_REFUND"] = "COMPLETE_REFUND";
    ProviderOperation["FAIL_REFUND"] = "FAIL_REFUND";
    ProviderOperation["CANCEL_REFUND"] = "CANCEL_REFUND";
    ProviderOperation["EXPIRE_REFUND"] = "EXPIRE_REFUND";
    /**
     * Settlement Operations
     */
    ProviderOperation["CREATE_SETTLEMENT"] = "CREATE_SETTLEMENT";
    ProviderOperation["SCHEDULE_SETTLEMENT"] = "SCHEDULE_SETTLEMENT";
    ProviderOperation["PROCESS_SETTLEMENT"] = "PROCESS_SETTLEMENT";
    ProviderOperation["PARTIAL_SETTLEMENT"] = "PARTIAL_SETTLEMENT";
    ProviderOperation["COMPLETE_SETTLEMENT"] = "COMPLETE_SETTLEMENT";
    ProviderOperation["FAIL_SETTLEMENT"] = "FAIL_SETTLEMENT";
    ProviderOperation["CANCEL_SETTLEMENT"] = "CANCEL_SETTLEMENT";
    ProviderOperation["EXPIRE_SETTLEMENT"] = "EXPIRE_SETTLEMENT";
    /**
     * Payout Operations
     */
    ProviderOperation["CREATE_PAYOUT"] = "CREATE_PAYOUT";
    ProviderOperation["SCHEDULE_PAYOUT"] = "SCHEDULE_PAYOUT";
    ProviderOperation["PROCESS_PAYOUT"] = "PROCESS_PAYOUT";
    ProviderOperation["INITIATE_PAYOUT"] = "INITIATE_PAYOUT";
    ProviderOperation["PARTIAL_PAYOUT"] = "PARTIAL_PAYOUT";
    ProviderOperation["COMPLETE_PAYOUT"] = "COMPLETE_PAYOUT";
    ProviderOperation["FAIL_PAYOUT"] = "FAIL_PAYOUT";
    ProviderOperation["CANCEL_PAYOUT"] = "CANCEL_PAYOUT";
    ProviderOperation["EXPIRE_PAYOUT"] = "EXPIRE_PAYOUT";
    ProviderOperation["REVERSE_PAYOUT"] = "REVERSE_PAYOUT";
    /**
     * Webhook Operations
     */
    ProviderOperation["RECEIVE_WEBHOOK"] = "RECEIVE_WEBHOOK";
    ProviderOperation["VALIDATE_WEBHOOK"] = "VALIDATE_WEBHOOK";
    ProviderOperation["VERIFY_WEBHOOK"] = "VERIFY_WEBHOOK";
    ProviderOperation["PROCESS_WEBHOOK"] = "PROCESS_WEBHOOK";
    ProviderOperation["RETRY_WEBHOOK"] = "RETRY_WEBHOOK";
    ProviderOperation["REPLAY_WEBHOOK"] = "REPLAY_WEBHOOK";
    ProviderOperation["FAIL_WEBHOOK"] = "FAIL_WEBHOOK";
    ProviderOperation["REJECT_WEBHOOK"] = "REJECT_WEBHOOK";
    ProviderOperation["EXPIRE_WEBHOOK"] = "EXPIRE_WEBHOOK";
    /**
     * Retry Operations
     */
    ProviderOperation["RETRY_OPERATION"] = "RETRY_OPERATION";
    /**
     * FX Operations (Future Phase)
     */
    ProviderOperation["IMPORT_EXCHANGE_RATES"] = "IMPORT_EXCHANGE_RATES";
    ProviderOperation["OVERRIDE_EXCHANGE_RATE"] = "OVERRIDE_EXCHANGE_RATE";
    ProviderOperation["CONVERT_CURRENCY"] = "CONVERT_CURRENCY";
    /**
     * Reconciliation Operations (Future Phase)
     */
    ProviderOperation["START_RECONCILIATION"] = "START_RECONCILIATION";
    ProviderOperation["VERIFY_RECONCILIATION"] = "VERIFY_RECONCILIATION";
    /**
     * Administrative Operations
     */
    ProviderOperation["MANUAL_STATUS_CHANGE"] = "MANUAL_STATUS_CHANGE";
    ProviderOperation["RESET_PROVIDER_DATA"] = "RESET_PROVIDER_DATA";
})(ProviderOperation || (exports.ProviderOperation = ProviderOperation = {}));
exports.default = ProviderOperation;
