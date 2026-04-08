"use strict";
//backend/src/services/moderationSeverity.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifySeverity = void 0;
const classifySeverity = (flags, priorAbuseScore) => {
    // Base severity from flags
    let severity = "LOW";
    const hasContact = flags.includes("CONTACT_INTENT") ||
        flags.includes("PHONE_NUMBER") ||
        flags.includes("EMAIL");
    if (hasContact)
        severity = "MEDIUM";
    // Escalate based on history
    if (priorAbuseScore >= 3 && hasContact) {
        severity = "HIGH";
    }
    return {
        severity,
        reasons: flags,
    };
};
exports.classifySeverity = classifySeverity;
