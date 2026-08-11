"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InternalTopUpFundingError = void 0;
const FinancialError_1 = require("./FinancialError");
class InternalTopUpFundingError extends FinancialError_1.FinancialError {
    constructor(message, code, statusCode = 409, options) { super(message, code, { cause: options?.cause }); this.name = this.constructor.name; this.statusCode = statusCode; }
}
exports.InternalTopUpFundingError = InternalTopUpFundingError;
