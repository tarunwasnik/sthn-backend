"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PayoutDestinationError = void 0;
const FinancialError_1 = require("./FinancialError");
class PayoutDestinationError extends FinancialError_1.FinancialError {
    constructor(message = "Payout destination operation failed.", code = "PAYOUT_DESTINATION_ERROR", options) {
        super(message, code, options);
        this.name = this.constructor.name;
    }
}
exports.PayoutDestinationError = PayoutDestinationError;
