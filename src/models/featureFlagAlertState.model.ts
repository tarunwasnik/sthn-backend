// backend/src/models/featureFlagAlertState.model.ts

import mongoose, { Schema, Document } from "mongoose";

export interface FeatureFlagAlertStateDocument
  extends Document {
  flagKey: string;

  // Last time an alert was emitted (for cooldown / dedup)
  lastAlertAt: Date;

  // Phase 30.6.9 — first time critical severity was observed
  firstCriticalAt?: Date;
}

const FeatureFlagAlertStateSchema =
  new Schema<FeatureFlagAlertStateDocument>(
    {
      flagKey: {
        type: String,
        required: true,
        unique: true,
        index: true,
      },

      lastAlertAt: {
        type: Date,
        required: true,
      },

      // 🧯 Used to detect sustained critical alerts
      firstCriticalAt: {
        type: Date,
      },
    },
    {
      versionKey: false,
      timestamps: false,
    }
  );

export const FeatureFlagAlertState =
  mongoose.model<FeatureFlagAlertStateDocument>(
    "FeatureFlagAlertState",
    FeatureFlagAlertStateSchema
  );