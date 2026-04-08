// backend/src/models/featureFlagAlertEvent.model.ts
import mongoose, { Schema, Document } from "mongoose";

export interface FeatureFlagEventDocument extends Document {
  flagKey: string;
  userId?: string;
  role?: string;
  context?: string;
  timestamp: Date;
}

const FeatureFlagEventSchema = new Schema<FeatureFlagEventDocument>(
  {
    flagKey: { type: String, required: true, index: true },
    userId: { type: String, index: true },
    role: { type: String, index: true },
    context: { type: String },
    timestamp: { type: Date, required: true },
  },
  {
    versionKey: false,
  }
);

export const FeatureFlagEvent = mongoose.model<FeatureFlagEventDocument>(
  "FeatureFlagEvent",
  FeatureFlagEventSchema
);
