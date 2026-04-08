


//backend/src/constants/userStatus.ts

export const USER_STATUS = {
  ACTIVE: "active",
  SUSPENDED: "suspended",
  BANNED: "banned",
} as const;

export type UserStatus =
  typeof USER_STATUS[keyof typeof USER_STATUS];



  