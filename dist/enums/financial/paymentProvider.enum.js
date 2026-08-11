"use strict";
// backend/src/enums/financial/paymentProvider.enum.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentProvider = void 0;
/**
 * Supported payment providers.
 *
 * The Financial Domain is provider-agnostic. These values identify the
 * provider responsible for processing a payment while keeping the rest of
 * the domain independent of provider-specific implementations.
 *
 * INTERNAL is used by the current implementation. Additional providers can
 * be added later without changing the Financial Domain contracts.
 */
var PaymentProvider;
(function (PaymentProvider) {
    /**
     * Internal payment provider used by the current implementation.
     */
    PaymentProvider["INTERNAL"] = "INTERNAL";
    /**
     * Reserved for future gateway integrations.
     */
    PaymentProvider["RAZORPAY"] = "RAZORPAY";
    PaymentProvider["STRIPE"] = "STRIPE";
    PaymentProvider["PAYPAL"] = "PAYPAL";
    PaymentProvider["CASHFREE"] = "CASHFREE";
    PaymentProvider["PHONEPE"] = "PHONEPE";
    PaymentProvider["CUSTOM"] = "CUSTOM";
})(PaymentProvider || (exports.PaymentProvider = PaymentProvider = {}));
