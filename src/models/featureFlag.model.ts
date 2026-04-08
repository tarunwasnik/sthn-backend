// backend/src/models/featureFlag.model.ts

import mongoose, { Schema, Document } from "mongoose";

export type FeatureFlagScope = "GLOBAL" | "ROLE" | "USER";

export type FeatureFlagSeverity =
  | "low"
  | "medium"
  | "high"
  | "critical";

/**
 * Phase 30.6.5 — Alert configuration
 */
export interface FeatureFlagAlertConfig {
  severity: FeatureFlagSeverity;
  threshold: number;       // block count
  windowMinutes: number;   // rolling window
}

/**
 * Phase 30.6.9 — Auto-disable configuration (OPT-IN ONLY)
 */
export interface FeatureFlagAutoDisableConfig {
  enabled: boolean;
  afterMinutes: number; // sustained critical duration
}

export interface FeatureFlagDocument extends Document {
  key: string;
  description?: string;
  enabled: boolean;
  scope: FeatureFlagScope;

  conditions?: {
    roles?: string[];
    userIds?: mongoose.Types.ObjectId[];
  };

  // 🔔 Alerting metadata
  alertConfig?: FeatureFlagAlertConfig;

  // 🧯 Auto-disable on sustained critical alerts
  autoDisableOnCritical?: FeatureFlagAutoDisableConfig;

  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const FeatureFlagSchema = new Schema<FeatureFlagDocument>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    description: {
      type: String,
    },

    enabled: {
      type: Boolean,
      default: false,
    },

    scope: {
      type: String,
      enum: ["GLOBAL", "ROLE", "USER"],
      default: "GLOBAL",
    },

    conditions: {
      roles: [{ type: String }],
      userIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    },

    // 🔔 Phase 30.6.5 — Alert configuration
    alertConfig: {
      severity: {
        type: String,
        enum: ["low", "medium", "high", "critical"],
        default: "low",
      },
      threshold: {
        type: Number,
        default: 50,
      },
      windowMinutes: {
        type: Number,
        default: 30,
      },
    },

    // 🧯 Phase 30.6.9 — Auto-disable (explicit opt-in)
    autoDisableOnCritical: {
      enabled: {
        type: Boolean,
        default: false,
      },
      afterMinutes: {
        type: Number,
        default: 15,
      },
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  { timestamps: true }
);

export const FeatureFlag = mongoose.model<FeatureFlagDocument>(
  "FeatureFlag",
  FeatureFlagSchema
);