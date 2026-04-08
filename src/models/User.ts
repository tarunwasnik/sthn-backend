//backend/src/models/User.ts

import mongoose, { Schema, Document, Types } from "mongoose";
import { ROLES, Role } from "../constants/roles";
import { AdminMode } from "../types/adminMode.types";

export interface IUser extends Document {
  // 🔐 Authentication Identity
  email: string;
  password?: string | null;
  authProvider: "local" | "google";
  googleId?: string | null;

  role: Role;
  status: "pending_profile" | "active" | "suspended" | "banned";

  // 🆕 Creator Elevation Lifecycle
  creatorStatus: "none" | "pending" | "approved" | "rejected";

  // 🔐 Trust & abuse control
  abuseScore: number;

  // Cooldown system (admin actions)
  userCooldownUntil?: Date | null;
  userCooldownReason?: string | null;
  userCooldownBy?: Types.ObjectId | null;

  creatorCooldownUntil?: Date | null;

  // 🔑 Admin intent
  adminMode?: AdminMode | null;

  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    // 🔐 Authentication Identity
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

    // 🆕 Creator Elevation Lifecycle
    creatorStatus: {
      type: String,
      enum: ["none", "pending", "approved", "rejected"],
      default: "none",
      index: true,
    },

    // 🔐 Trust & abuse system
    abuseScore: {
      type: Number,
      default: 0,
      index: true,
    },

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

    creatorCooldownUntil: {
      type: Date,
      default: null,
      index: true,
    },

    // 🔑 Admin mode persistence
    adminMode: {
      type: String,
      enum: ["SYSTEM", "OPERATIONS"],
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model<IUser>("User", UserSchema);