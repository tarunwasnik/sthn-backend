//backend/src/models/adminControl.model.ts

import mongoose, { Schema, Document } from "mongoose";
import {
  AdminControlScope,
  GlobalAdminMode,
  ActionControlMode,
  EmergencyAppliesTo,
  EmergencyControlMode,
} from "../utils/adminControl.types";

export interface IAdminControl extends Document {
  scope: AdminControlScope;

  // Global
  mode?: GlobalAdminMode | ActionControlMode | EmergencyControlMode;

  // Action-level
  actionKey?: string;

  // Emergency
  appliesTo?: EmergencyAppliesTo;

  reason: string;
  createdBy: mongoose.Types.ObjectId;

  createdAt: Date;
  expiresAt?: Date;
}

const AdminControlSchema = new Schema<IAdminControl>(
  {
    scope: {
      type: String,
      enum: ["GLOBAL", "ACTION", "EMERGENCY"],
      required: true,
      index: true,
    },

    mode: {
      type: String,
      required: true,
    },

    // Action-level control
    actionKey: {
      type: String,
      index: true,
      sparse: true,
    },

    // Emergency control
    appliesTo: {
      type: String,
      enum: ["ALL", "HIGH_RISK"],
      sparse: true,
    },

    reason: {
      type: String,
      required: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Admin",
    },

    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },

    /**
     * TTL-enforced expiry.
     * Mongo will auto-delete expired controls.
     */
    expiresAt: {
      type: Date,
      index: {
        expireAfterSeconds: 0,
      },
    },
  },
  {
    versionKey: false,
  }
);

// ----------------------------------
// Indexes for fast evaluation
// ----------------------------------

// Ensure fast lookup of global controls
AdminControlSchema.index({ scope: 1, createdAt: -1 });

// Ensure fast lookup of action-specific controls
AdminControlSchema.index({ scope: 1, actionKey: 1, createdAt: -1 });

// Ensure fast lookup of emergency controls
AdminControlSchema.index({ scope: 1, appliesTo: 1, createdAt: -1 });

export const AdminControl =
  mongoose.models.AdminControl ||
  mongoose.model<IAdminControl>("AdminControl", AdminControlSchema);