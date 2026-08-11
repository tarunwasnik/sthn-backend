"use strict";
// backend/src/enums/financial/paymentStatus.enum.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentStatus = void 0;
/**
 * Represents the lifecycle state of a payment.
 *
 * This enum is shared across the Financial Domain and must remain
 * provider-independent. External payment gateways should map their
 * proprietary statuses to these internal statuses.
 */
var PaymentStatus;
(function (PaymentStatus) {
    /**
     * Payment record has been created but processing has not started.
     */
    PaymentStatus["CREATED"] = "CREATED";
    /**
     * Payment initialization is in progress.
     */
    PaymentStatus["INITIALIZING"] = "INITIALIZING";
    /**
     * Payment is awaiting authorization.
     */
    PaymentStatus["PENDING"] = "PENDING";
    /**
     * Funds have been authorized but not yet captured.
     */
    PaymentStatus["AUTHORIZED"] = "AUTHORIZED";
    /**
     * Funds have been successfully captured.
     */
    PaymentStatus["CAPTURED"] = "CAPTURED";
    /**
     * Payment has been successfully settled.
     */
    PaymentStatus["SETTLED"] = "SETTLED";
    /**
     * Payment has been fully refunded.
     */
    PaymentStatus["REFUNDED"] = "REFUNDED";
    /**
     * Payment has been partially refunded.
     */
    PaymentStatus["PARTIALLY_REFUNDED"] = "PARTIALLY_REFUNDED";
    /**
     * Payment failed permanently.
     */
    PaymentStatus["FAILED"] = "FAILED";
    /**
     * Payment has expired before completion.
     */
    PaymentStatus["EXPIRED"] = "EXPIRED";
    /**
     * Payment was cancelled.
     */
    PaymentStatus["CANCELLED"] = "CANCELLED";
})(PaymentStatus || (exports.PaymentStatus = PaymentStatus = {}));
