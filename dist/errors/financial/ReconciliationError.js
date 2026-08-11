"use strict";
// backend/src/errors/financial/ReconciliationError.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReconciliationError = void 0;
const FinancialError_1 = require("./FinancialError");
/**
 * Base error for all reconciliation-related failures.
 *
 * Reconciliation compares internal financial records with
 * provider/platform records to detect inconsistencies.
 *
 * Specific reconciliation errors should extend this class where appropriate.
 */
class ReconciliationError extends FinancialError_1.FinancialError {
    constructor(message = "Financial reconciliation failed.", code = "RECONCILIATION_ERROR", options) {
        super(message, code, options);
        this.name = this.constructor.name;
    }
}
exports.ReconciliationError = ReconciliationError;
