//backend/src/services/accountGovernance/accountGovernanceResolver.service.ts

import {
  ACCOUNT_GOVERNANCE_STATE,
  AccountGovernanceState,
  GOVERNANCE_AUTHORITY,
} from "../../constants/accountGovernance";
import { IUser } from "../../models/User";

/* =========================================================
   RESOLVED ACCOUNT GOVERNANCE
========================================================= */

export type ResolvedGovernanceCondition =
  | "ACTIVE"
  | "COOLDOWN"
  | "PENDING_SUSPENSION"
  | "SUSPENDED"
  | "PENDING_BAN"
  | "BANNED";

export interface ResolvedAccountGovernance {
  condition: ResolvedGovernanceCondition;
  authority: number;

  governanceState: AccountGovernanceState;

  isCooldownActive: boolean;
  isUserCooldownActive: boolean;
  isCreatorCooldownActive: boolean;

  cooldownUntil: Date | null;

  blocksOutgoingBookings: boolean;
  blocksIncomingBookings: boolean;
  blocksAcceptingBookings: boolean;

  hasRestrictedDashboardAccess: boolean;
  hasNoAccountAccess: boolean;
}

/* =========================================================
   DATE HELPERS
========================================================= */

const isFutureDate = (value: Date | null | undefined, now: Date): boolean => {
  if (!value) {
    return false;
  }

  return value.getTime() > now.getTime();
};

const getLatestDate = (dates: Array<Date | null | undefined>): Date | null => {
  const validDates = dates.filter((date): date is Date => date instanceof Date);

  if (validDates.length === 0) {
    return null;
  }

  return new Date(Math.max(...validDates.map((date) => date.getTime())));
};

/* =========================================================
   RESOLVE ACCOUNT GOVERNANCE
========================================================= */

export const resolveAccountGovernance = (
  user: IUser,
  now: Date = new Date(),
): ResolvedAccountGovernance => {
  const governanceState =
    user.governanceState || ACCOUNT_GOVERNANCE_STATE.ACTIVE;

  const isUserCooldownActive = isFutureDate(user.userCooldownUntil, now);

  const isCreatorCooldownActive = isFutureDate(user.creatorCooldownUntil, now);

  const isCooldownActive = isUserCooldownActive || isCreatorCooldownActive;

  const cooldownUntil = getLatestDate([
    isUserCooldownActive ? user.userCooldownUntil : null,
    isCreatorCooldownActive ? user.creatorCooldownUntil : null,
  ]);

  /* =======================================================
     BANNED
  ======================================================= */

  if (governanceState === ACCOUNT_GOVERNANCE_STATE.BANNED) {
    return {
      condition: "BANNED",
      authority: GOVERNANCE_AUTHORITY.BANNED,

      governanceState,

      isCooldownActive,
      isUserCooldownActive,
      isCreatorCooldownActive,

      cooldownUntil,

      blocksOutgoingBookings: true,
      blocksIncomingBookings: true,
      blocksAcceptingBookings: true,

      hasRestrictedDashboardAccess: false,
      hasNoAccountAccess: true,
    };
  }

  /* =======================================================
     PENDING BAN
  ======================================================= */

  if (governanceState === ACCOUNT_GOVERNANCE_STATE.PENDING_BAN) {
    return {
      condition: "PENDING_BAN",
      authority: GOVERNANCE_AUTHORITY.PENDING_BAN,

      governanceState,

      isCooldownActive,
      isUserCooldownActive,
      isCreatorCooldownActive,

      cooldownUntil,

      blocksOutgoingBookings: true,
      blocksIncomingBookings: true,
      blocksAcceptingBookings: true,

      hasRestrictedDashboardAccess: false,
      hasNoAccountAccess: false,
    };
  }

  /* =======================================================
     SUSPENDED
  ======================================================= */

  if (governanceState === ACCOUNT_GOVERNANCE_STATE.SUSPENDED) {
    return {
      condition: "SUSPENDED",
      authority: GOVERNANCE_AUTHORITY.SUSPENDED,

      governanceState,

      isCooldownActive,
      isUserCooldownActive,
      isCreatorCooldownActive,

      cooldownUntil,

      blocksOutgoingBookings: true,
      blocksIncomingBookings: true,
      blocksAcceptingBookings: true,

      hasRestrictedDashboardAccess: true,
      hasNoAccountAccess: false,
    };
  }

  /* =======================================================
     PENDING SUSPENSION
  ======================================================= */

  if (governanceState === ACCOUNT_GOVERNANCE_STATE.PENDING_SUSPENSION) {
    return {
      condition: "PENDING_SUSPENSION",
      authority: GOVERNANCE_AUTHORITY.PENDING_SUSPENSION,

      governanceState,

      isCooldownActive,
      isUserCooldownActive,
      isCreatorCooldownActive,

      cooldownUntil,

      blocksOutgoingBookings: true,
      blocksIncomingBookings: true,
      blocksAcceptingBookings: true,

      hasRestrictedDashboardAccess: false,
      hasNoAccountAccess: false,
    };
  }

  /* =======================================================
     COOLDOWN
  ======================================================= */

  if (isCooldownActive) {
    return {
      condition: "COOLDOWN",
      authority: GOVERNANCE_AUTHORITY.COOLDOWN,

      governanceState,

      isCooldownActive,
      isUserCooldownActive,
      isCreatorCooldownActive,

      cooldownUntil,

      blocksOutgoingBookings: true,

      blocksIncomingBookings: isCreatorCooldownActive,
      blocksAcceptingBookings: isCreatorCooldownActive,

      hasRestrictedDashboardAccess: false,
      hasNoAccountAccess: false,
    };
  }

  /* =======================================================
     ACTIVE
  ======================================================= */

  return {
    condition: "ACTIVE",
    authority: GOVERNANCE_AUTHORITY.ACTIVE,

    governanceState,

    isCooldownActive: false,
    isUserCooldownActive: false,
    isCreatorCooldownActive: false,

    cooldownUntil: null,

    blocksOutgoingBookings: false,
    blocksIncomingBookings: false,
    blocksAcceptingBookings: false,

    hasRestrictedDashboardAccess: false,
    hasNoAccountAccess: false,
  };
};
