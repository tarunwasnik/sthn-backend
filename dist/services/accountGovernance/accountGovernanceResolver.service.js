"use strict";
//backend/src/services/accountGovernance/accountGovernanceResolver.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveAccountGovernance = void 0;
const accountGovernance_1 = require("../../constants/accountGovernance");
/* =========================================================
   DATE HELPERS
========================================================= */
const isFutureDate = (value, now) => {
    if (!value) {
        return false;
    }
    return value.getTime() > now.getTime();
};
const getLatestDate = (dates) => {
    const validDates = dates.filter((date) => date instanceof Date);
    if (validDates.length === 0) {
        return null;
    }
    return new Date(Math.max(...validDates.map((date) => date.getTime())));
};
/* =========================================================
   RESOLVE ACCOUNT GOVERNANCE
========================================================= */
const resolveAccountGovernance = (user, now = new Date()) => {
    const governanceState = user.governanceState || accountGovernance_1.ACCOUNT_GOVERNANCE_STATE.ACTIVE;
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
    if (governanceState === accountGovernance_1.ACCOUNT_GOVERNANCE_STATE.BANNED) {
        return {
            condition: "BANNED",
            authority: accountGovernance_1.GOVERNANCE_AUTHORITY.BANNED,
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
    if (governanceState === accountGovernance_1.ACCOUNT_GOVERNANCE_STATE.PENDING_BAN) {
        return {
            condition: "PENDING_BAN",
            authority: accountGovernance_1.GOVERNANCE_AUTHORITY.PENDING_BAN,
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
    if (governanceState === accountGovernance_1.ACCOUNT_GOVERNANCE_STATE.SUSPENDED) {
        return {
            condition: "SUSPENDED",
            authority: accountGovernance_1.GOVERNANCE_AUTHORITY.SUSPENDED,
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
    if (governanceState === accountGovernance_1.ACCOUNT_GOVERNANCE_STATE.PENDING_SUSPENSION) {
        return {
            condition: "PENDING_SUSPENSION",
            authority: accountGovernance_1.GOVERNANCE_AUTHORITY.PENDING_SUSPENSION,
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
            authority: accountGovernance_1.GOVERNANCE_AUTHORITY.COOLDOWN,
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
        authority: accountGovernance_1.GOVERNANCE_AUTHORITY.ACTIVE,
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
exports.resolveAccountGovernance = resolveAccountGovernance;
