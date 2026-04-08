//backend/src/models/AdminActionMetric.model.ts


import mongoose, { Schema, Document } from "mongoose";
import {
  AdminActionMetricType,
  AdminActionRiskLevel,
} from "../services/adminActions/adminActionMetrics.types";

export interface IAdminActionMetric extends Document {
  type: AdminActionMetricType;

  timestamp: number;

  adminId: mongoose.Types.ObjectId;
  adminRole: string;

  actionKey: string;
  actionVersion: number;
  riskLevel: AdminActionRiskLevel;

  targetId: mongoose.Types.ObjectId;

  dryRun: boolean;
  outcome?: string;

  reason?: string;
}

const AdminActionMetricSchema = new Schema<IAdminActionMetric>(
  {
    type: {
      type: String,
      required: true,
      index: true,
    },

    timestamp: {
      type: Number,
      required: true,
      index: true,
    },

    adminId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    adminRole: {
      type: String,
      required: true,
    },

    actionKey: {
      type: String,
      required: true,
      index: true,
    },

    actionVersion: {
      type: Number,
      required: true,
    },

    riskLevel: {
      type: String,
      required: true,
      index: true,
    },

    targetId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    dryRun: {
      type: Boolean,
      required: true,
    },

    outcome: {
      type: String,
    },

    reason: {
      type: String,
    },
  },
  {
    timestamps: false,
  }
);

export default mongoose.model<IAdminActionMetric>(
  "AdminActionMetric",
  AdminActionMetricSchema
);
