"use strict";
//backend/src/services/disputeWeighting.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.decideDisputeOutcome = void 0;
const decideDisputeOutcome = (severity, abuseScore) => {
    if (severity === "HIGH")
        return "FAVOR_CREATOR";
    if (severity === "MEDIUM" && abuseScore >= 10)
        return "FAVOR_CREATOR";
    if (severity === "LOW" && abuseScore < 5)
        return "FAVOR_USER";
    return "MANUAL_REVIEW";
};
exports.decideDisputeOutcome = decideDisputeOutcome;
