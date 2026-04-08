//backend/src/models/adminActionLog.model.ts


import mongoose, { Schema, Document } from "mongoose";

export type AdminActionStatus = "SUCCESS" | "FAILED";

export interface IAdminActionLog extends Document {
  adminId: mongoose.Types.ObjectId;

  actionKey: string;
  actionLabel: string;
  actionVersion: number; // 🕰️ Phase 25

  targetType: string;
  targetId: mongoose.Types.ObjectId;

  params: Record<string, any>;
  reason: string;

  status: AdminActionStatus;

  result?: Record<string, any>;
  error?: {
    message: string;
    stack?: string;
  };

  createdAt: Date;
}

const AdminActionLogSchema = new Schema<IAdminActionLog>(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    actionKey: {
      type: String,
      required: true,
      index: true,
    },

    actionLabel: {
      type: String,
      required: true,
    },

    // 🕰️ Phase 25 — version binding
    actionVersion: {
      type: Number,
      required: true,
      index: true,
    },

    targetType: {
      type: String,
      required: true,
      index: true,
    },

    targetId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    params: {
      type: Schema.Types.Mixed,
    },

    reason: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["SUCCESS", "FAILED"],
      required: true,
      index: true,
    },

    result: {
      type: Schema.Types.Mixed,
    },

    error: {
      message: String,
      stack: String,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export default mongoose.model<IAdminActionLog>(
  "AdminActionLog",
  AdminActionLogSchema
);