//backend/src/constants/accountGovernance.ts

/* =========================================================
   ACCOUNT GOVERNANCE STATES
========================================================= */

export const ACCOUNT_GOVERNANCE_STATE = {
  ACTIVE: "ACTIVE",
  PENDING_SUSPENSION: "PENDING_SUSPENSION",
  SUSPENDED: "SUSPENDED",
  PENDING_BAN: "PENDING_BAN",
  BANNED: "BANNED",
} as const;

export type AccountGovernanceState =
  (typeof ACCOUNT_GOVERNANCE_STATE)[keyof typeof ACCOUNT_GOVERNANCE_STATE];

/* =========================================================
   GOVERNANCE AUTHORITY
========================================================= */

export const GOVERNANCE_AUTHORITY = {
  ACTIVE: 0,
  COOLDOWN: 1,
  PENDING_SUSPENSION: 2,
  SUSPENDED: 3,
  PENDING_BAN: 4,
  BANNED: 5,
} as const;

export type GovernanceAuthority = keyof typeof GOVERNANCE_AUTHORITY;

/* =========================================================
   GOVERNANCE TIMING
========================================================= */

export const SUSPENSION_BOOKING_PROTECTION_HOURS = 24;

export const BAN_BOOKING_PROTECTION_HOURS = 24;

export const BAN_WITHDRAWAL_WINDOW_HOURS = 24;

/* =========================================================
   GOVERNANCE STATE HELPERS
========================================================= */

export const isPendingSuspension = (state: AccountGovernanceState) =>
  state === ACCOUNT_GOVERNANCE_STATE.PENDING_SUSPENSION;

export const isSuspended = (state: AccountGovernanceState) =>
  state === ACCOUNT_GOVERNANCE_STATE.SUSPENDED;

export const isPendingBan = (state: AccountGovernanceState) =>
  state === ACCOUNT_GOVERNANCE_STATE.PENDING_BAN;

export const isBanned = (state: AccountGovernanceState) =>
  state === ACCOUNT_GOVERNANCE_STATE.BANNED;

/* =========================================================
   GOVERNANCE AUTHORITY HELPERS
========================================================= */

export const getGovernanceAuthority = (state: GovernanceAuthority): number => {
  return GOVERNANCE_AUTHORITY[state];
};

export const canGovernanceOverride = (
  currentState: GovernanceAuthority,
  incomingState: GovernanceAuthority,
): boolean => {
  return (
    getGovernanceAuthority(incomingState) > getGovernanceAuthority(currentState)
  );
};

/* =========================================================
   GOVERNANCE MARKETPLACE BLOCKS
========================================================= */

export const blocksNewOutgoingBookings = (
  state: AccountGovernanceState,
): boolean => {
  return state !== ACCOUNT_GOVERNANCE_STATE.ACTIVE;
};

export const blocksNewIncomingBookings = (
  state: AccountGovernanceState,
): boolean => {
  return state !== ACCOUNT_GOVERNANCE_STATE.ACTIVE;
};

/* =========================================================
   GOVERNANCE DASHBOARD ACCESS
========================================================= */

export const hasRestrictedDashboardAccess = (
  state: AccountGovernanceState,
): boolean => {
  return state === ACCOUNT_GOVERNANCE_STATE.SUSPENDED;
};

export const hasNoAccountAccess = (state: AccountGovernanceState): boolean => {
  return state === ACCOUNT_GOVERNANCE_STATE.BANNED;
};
