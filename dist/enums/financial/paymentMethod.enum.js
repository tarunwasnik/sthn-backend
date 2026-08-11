"use strict";
// backend/src/enums/financial/paymentMethod.enum.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentMethod = void 0;
/**
 * Supported payment methods.
 *
 * Payment methods describe how a customer pays for a booking.
 * These values are independent of any specific payment provider.
 *
 * The current implementation uses INTERNAL. Additional methods are
 * reserved for future gateway integrations without requiring changes
 * to the Financial Domain contracts.
 */
var PaymentMethod;
(function (PaymentMethod) {
    /**
     * Internal payment mechanism used by the current implementation.
     */
    PaymentMethod["INTERNAL"] = "INTERNAL";
    /**
     * Future payment methods.
     */
    PaymentMethod["CARD"] = "CARD";
    PaymentMethod["NET_BANKING"] = "NET_BANKING";
    PaymentMethod["UPI"] = "UPI";
    PaymentMethod["WALLET"] = "WALLET";
    PaymentMethod["BANK_TRANSFER"] = "BANK_TRANSFER";
    PaymentMethod["CASH"] = "CASH";
    PaymentMethod["OTHER"] = "OTHER";
})(PaymentMethod || (exports.PaymentMethod = PaymentMethod = {}));
