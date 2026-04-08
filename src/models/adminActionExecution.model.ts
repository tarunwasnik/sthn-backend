//backend/src/models/adminActionExecution.model.ts


import mongoose, { Schema, Document } from "mongoose";

export type AdminActionExecutionStatus =
  | "IN_PROGRESS"
  | "EXECUTED";

export interface IAdminActionExecution extends Document {
  idempotencyKey: string;

  adminId: mongoose.Types.ObjectId;
  actionKey: string;
  targetId: mongoose.Types.ObjectId;

  status: AdminActionExecutionStatus;

  createdAt: Date;
}

const AdminActionExecutionSchema = new Schema<IAdminActionExecution>(
  {
    idempotencyKey: {
      type: String,
      required: true,
      unique: true, // 🔐 core replay protection
      index: true,
    },

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

    targetId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["IN_PROGRESS", "EXECUTED"],
      required: true,
      index: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export default mongoose.model<IAdminActionExecution>(
  "AdminActionExecution",
  AdminActionExecutionSchema
);
