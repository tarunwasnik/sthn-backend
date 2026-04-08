//backend/src/models/auditLog.model.ts


import mongoose, { Schema, Document } from "mongoose";

export type AuditActorType = "ADMIN" | "SYSTEM";

export interface IAuditLog extends Document {
  actorId?: mongoose.Types.ObjectId; // null for system jobs
  actorType: AuditActorType;

  action: string; // e.g. USER_SUSPENDED, DISPUTE_RESOLVED
  entityType: string; // USER | BOOKING | DISPUTE | CREATOR_PROFILE
  entityId: mongoose.Types.ObjectId;

  before?: Record<string, any>;
  after?: Record<string, any>;

  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    actorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    actorType: {
      type: String,
      enum: ["ADMIN", "SYSTEM"],
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    entityType: {
      type: String,
      required: true,
      index: true,
    },
    entityId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    before: {
      type: Schema.Types.Mixed,
    },
    after: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const AuditLog = mongoose.model<IAuditLog>(
  "AuditLog",
  AuditLogSchema
);
