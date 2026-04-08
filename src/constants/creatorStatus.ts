


//backend/src/constants/creatorStatus.ts

export const CREATOR_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  SUSPENDED: "suspended",
  DEACTIVATED: "deactivated",
} as const;

export type CreatorStatus =
  typeof CREATOR_STATUS[keyof typeof CREATOR_STATUS];
