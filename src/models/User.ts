//backend/src/models/User.ts

import mongoose, { Schema, Document, Types } from "mongoose";
import { ROLES, Role } from "../constants/roles";
import { AdminMode } from "../types/adminMode.types";

/* =========================================================
   ACCOUNT GOVERNANCE TYPES
========================================================= */

export type GovernanceState =
  | "ACTIVE"
  | "PENDING_SUSPENSION"
  | "SUSPENDED"
  | "PENDING_BAN"
  | "BANNED";

export interface IUser extends Document {
  /* =======================================================
     AUTHENTICATION IDENTITY
  ======================================================= */

  email: string;
  password?: string | null;
  authProvider: "local" | "google";
  googleId?: string | null;
  mobileCountryCode?: string | null;
  mobileNumber?: string | null;

  role: Role;

  status: "pending_profile" | "active" | "suspended" | "banned";

  /* =======================================================
     CREATOR ELEVATION LIFECYCLE
  ======================================================= */

  creatorStatus: "none" | "pending" | "approved" | "rejected";

  /* =======================================================
     TRUST & ABUSE CONTROL
  ======================================================= */

  abuseScore: number;

  /* =======================================================
     ACCOUNT GOVERNANCE
  ======================================================= */

  governanceState: GovernanceState;

  governanceTriggeredAt?: Date | null;
  governanceReason?: string | null;
  governanceTriggeredBy?: Types.ObjectId | null;

  suspensionProtectedUntil?: Date | null;

  banWithdrawalWindowStartedAt?: Date | null;
  banWithdrawalWindowEndsAt?: Date | null;

  unclaimedBalanceAmount: number;
  unclaimedBalanceCurrency?: string | null;
  unclaimedBalanceRecordedAt?: Date | null;

  /* =======================================================
     COOLDOWN SYSTEM
  ======================================================= */

  userCooldownUntil?: Date | null;
  userCooldownReason?: string | null;
  userCooldownBy?: Types.ObjectId | null;
  userCooldownTriggeredAt?: Date | null;

  creatorCooldownUntil?: Date | null;
  creatorCooldownReason?: string | null;
  creatorCooldownBy?: Types.ObjectId | null;
  creatorCooldownTriggeredAt?: Date | null;

  /* =======================================================
     ADMIN INTENT
  ======================================================= */

  adminMode?: AdminMode | null;

  createdAt: Date;
  updatedAt: Date;
}

/* =========================================================
   USER SCHEMA
========================================================= */

const UserSchema = new Schema<IUser>(
  {
    /* =======================================================
       AUTHENTICATION IDENTITY
    ======================================================= */

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      default: null,
    },

    authProvider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
      index: true,
    },

    googleId: {
      type: String,
      default: null,
      index: true,
    },

    mobileCountryCode: {
      type: String,
      default: null,
      trim: true,
      maxlength: 5,
    },

    mobileNumber: {
      type: String,
      default: null,
      trim: true,
      maxlength: 15,
    },

    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.USER,
    },

    status: {
      type: String,
      enum: ["pending_profile", "active", "suspended", "banned"],
      default: "pending_profile",
      index: true,
    },

    /* =======================================================
       CREATOR ELEVATION LIFECYCLE
    ======================================================= */

    creatorStatus: {
      type: String,
      enum: ["none", "pending", "approved", "rejected"],
      default: "none",
      index: true,
    },

    /* =======================================================
       TRUST & ABUSE CONTROL
    ======================================================= */

    abuseScore: {
      type: Number,
      default: 0,
      index: true,
    },

    /* =======================================================
       ACCOUNT GOVERNANCE
    ======================================================= */

    governanceState: {
      type: String,
      enum: [
        "ACTIVE",
        "PENDING_SUSPENSION",
        "SUSPENDED",
        "PENDING_BAN",
        "BANNED",
      ],
      default: "ACTIVE",
      index: true,
    },

    governanceTriggeredAt: {
      type: Date,
      default: null,
      index: true,
    },

    governanceReason: {
      type: String,
      default: null,
    },

    governanceTriggeredBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    /* =======================================================
       SUSPENSION BOOKING PROTECTION
    ======================================================= */

    suspensionProtectedUntil: {
      type: Date,
      default: null,
      index: true,
    },

    /* =======================================================
       BAN WITHDRAWAL LIFECYCLE
    ======================================================= */

    banWithdrawalWindowStartedAt: {
      type: Date,
      default: null,
      index: true,
    },

    banWithdrawalWindowEndsAt: {
      type: Date,
      default: null,
      index: true,
    },

    /* =======================================================
       UNCLAIMED / RESTRICTED FUNDS
    ======================================================= */

    unclaimedBalanceAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    unclaimedBalanceCurrency: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
    },

    unclaimedBalanceRecordedAt: {
      type: Date,
      default: null,
    },

    /* =======================================================
       USER COOLDOWN
    ======================================================= */

    userCooldownUntil: {
      type: Date,
      default: null,
      index: true,
    },

    userCooldownReason: {
      type: String,
      default: null,
    },

    userCooldownBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    userCooldownTriggeredAt: {
      type: Date,
      default: null,
      index: true,
    },

    /* =======================================================
       CREATOR COOLDOWN
    ======================================================= */

    creatorCooldownUntil: {
      type: Date,
      default: null,
      index: true,
    },

    creatorCooldownReason: {
      type: String,
      default: null,
    },

    creatorCooldownBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    creatorCooldownTriggeredAt: {
      type: Date,
      default: null,
      index: true,
    },

    /* =======================================================
       ADMIN MODE PERSISTENCE
    ======================================================= */

    adminMode: {
      type: String,
      enum: ["SYSTEM", "OPERATIONS"],
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

/* =========================================================
   MODEL
========================================================= */

export default mongoose.model<IUser>("User", UserSchema);
