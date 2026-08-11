"use strict";
// backend/src/enums/financial/refundStatus.enum.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefundStatus = void 0;
/**
 * Represents the lifecycle state of a refund.
 *
 * Refunds are independent financial entities linked to a Payment.
 * Provider-specific refund states must be mapped to these canonical
 * Financial Domain statuses.
 */
var RefundStatus;
(function (RefundStatus) {
    /**
     * Refund record has been created.
     */
    RefundStatus["CREATED"] = "CREATED";
    /**
     * Refund request is awaiting validation or approval.
     */
    RefundStatus["PENDING"] = "PENDING";
    /**
     * Refund has been approved for execution.
     */
    RefundStatus["APPROVED"] = "APPROVED";
    /**
     * Refund is currently being processed.
     */
    RefundStatus["PROCESSING"] = "PROCESSING";
    /**
     * Refund completed successfully.
     */
    RefundStatus["COMPLETED"] = "COMPLETED";
    /**
     * Refund failed permanently.
     */
    RefundStatus["FAILED"] = "FAILED";
    /**
     * Refund request was rejected.
     */
    RefundStatus["REJECTED"] = "REJECTED";
    /**
     * Refund was cancelled before execution.
     */
    RefundStatus["CANCELLED"] = "CANCELLED";
    /**
     * Refund expired before it could be completed.
     */
    RefundStatus["EXPIRED"] = "EXPIRED";
    /**
     * Refund was only partially completed.
     */
    RefundStatus["PARTIALLY_COMPLETED"] = "PARTIALLY_COMPLETED";
})(RefundStatus || (exports.RefundStatus = RefundStatus = {}));
