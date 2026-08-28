"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toWalletConversionOperationalResponseDto = void 0;
const toWalletConversionOperationalResponseDto = (authority, allowedActions = []) => ({
    reconciliationReference: authority.reconciliationReference,
    conversionReference: authority.conversionReference,
    classification: authority.classification,
    severity: authority.severity,
    issues: [...authority.issues],
    retryPerformed: authority.retryPerformed,
    repairPerformed: authority.repairPerformed,
    allowedActions: [...allowedActions],
});
exports.toWalletConversionOperationalResponseDto = toWalletConversionOperationalResponseDto;
