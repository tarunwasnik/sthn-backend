"use strict";
//backend/src/constants/accountGovernance.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasNoAccountAccess = exports.hasRestrictedDashboardAccess = exports.blocksNewIncomingBookings = exports.blocksNewOutgoingBookings = exports.canGovernanceOverride = exports.getGovernanceAuthority = exports.isBanned = exports.isPendingBan = exports.isSuspended = exports.isPendingSuspension = exports.BAN_WITHDRAWAL_WINDOW_HOURS = exports.BAN_BOOKING_PROTECTION_HOURS = exports.SUSPENSION_BOOKING_PROTECTION_HOURS = exports.GOVERNANCE_AUTHORITY = exports.ACCOUNT_GOVERNANCE_STATE = void 0;
/* =========================================================
   ACCOUNT GOVERNANCE STATES
========================================================= */
exports.ACCOUNT_GOVERNANCE_STATE = {
    ACTIVE: "ACTIVE",
    PENDING_SUSPENSION: "PENDING_SUSPENSION",
    SUSPENDED: "SUSPENDED",
    PENDING_BAN: "PENDING_BAN",
    BANNED: "BANNED",
};
/* =========================================================
   GOVERNANCE AUTHORITY
========================================================= */
exports.GOVERNANCE_AUTHORITY = {
    ACTIVE: 0,
    COOLDOWN: 1,
    PENDING_SUSPENSION: 2,
    SUSPENDED: 3,
    PENDING_BAN: 4,
    BANNED: 5,
};
/* =========================================================
   GOVERNANCE TIMING
========================================================= */
exports.SUSPENSION_BOOKING_PROTECTION_HOURS = 24;
exports.BAN_BOOKING_PROTECTION_HOURS = 24;
exports.BAN_WITHDRAWAL_WINDOW_HOURS = 24;
/* =========================================================
   GOVERNANCE STATE HELPERS
========================================================= */
const isPendingSuspension = (state) => state === exports.ACCOUNT_GOVERNANCE_STATE.PENDING_SUSPENSION;
exports.isPendingSuspension = isPendingSuspension;
const isSuspended = (state) => state === exports.ACCOUNT_GOVERNANCE_STATE.SUSPENDED;
exports.isSuspended = isSuspended;
const isPendingBan = (state) => state === exports.ACCOUNT_GOVERNANCE_STATE.PENDING_BAN;
exports.isPendingBan = isPendingBan;
const isBanned = (state) => state === exports.ACCOUNT_GOVERNANCE_STATE.BANNED;
exports.isBanned = isBanned;
/* =========================================================
   GOVERNANCE AUTHORITY HELPERS
========================================================= */
const getGovernanceAuthority = (state) => {
    return exports.GOVERNANCE_AUTHORITY[state];
};
exports.getGovernanceAuthority = getGovernanceAuthority;
const canGovernanceOverride = (currentState, incomingState) => {
    return ((0, exports.getGovernanceAuthority)(incomingState) > (0, exports.getGovernanceAuthority)(currentState));
};
exports.canGovernanceOverride = canGovernanceOverride;
/* =========================================================
   GOVERNANCE MARKETPLACE BLOCKS
========================================================= */
const blocksNewOutgoingBookings = (state) => {
    return state !== exports.ACCOUNT_GOVERNANCE_STATE.ACTIVE;
};
exports.blocksNewOutgoingBookings = blocksNewOutgoingBookings;
const blocksNewIncomingBookings = (state) => {
    return state !== exports.ACCOUNT_GOVERNANCE_STATE.ACTIVE;
};
exports.blocksNewIncomingBookings = blocksNewIncomingBookings;
/* =========================================================
   GOVERNANCE DASHBOARD ACCESS
========================================================= */
const hasRestrictedDashboardAccess = (state) => {
    return state === exports.ACCOUNT_GOVERNANCE_STATE.SUSPENDED;
};
exports.hasRestrictedDashboardAccess = hasRestrictedDashboardAccess;
const hasNoAccountAccess = (state) => {
    return state === exports.ACCOUNT_GOVERNANCE_STATE.BANNED;
};
exports.hasNoAccountAccess = hasNoAccountAccess;
