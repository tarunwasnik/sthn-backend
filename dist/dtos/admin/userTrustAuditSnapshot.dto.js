"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toUserTrustAuditSnapshot = void 0;
/** Trust-reset audit state only; account identity and future private fields are excluded. */
const toUserTrustAuditSnapshot = (user) => ({
    abuseScore: user.abuseScore,
    status: user.status,
    governanceState: user.governanceState,
    userCooldownUntil: user.userCooldownUntil ?? null,
    creatorCooldownUntil: user.creatorCooldownUntil ?? null,
});
exports.toUserTrustAuditSnapshot = toUserTrustAuditSnapshot;
