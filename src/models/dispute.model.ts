//backend/src/models/dispute.model.ts

import mongoose, { Schema, Document, Types } from "mongoose";

export type DisputeStatus = "OPEN" | "RESOLVED" | "REJECTED";
export type EscalationLevel = "NONE" | "SOFT" | "HARD";
export type DisputeSignal =
  | "SLA_SOFT_BREACH"
  | "SLA_HARD_BREACH"
  | "REPEAT_OFFENDER";

export interface IDispute extends Document {
  bookingId: Types.ObjectId;
  raisedBy: Types.ObjectId;
  raisedByRole: "USER" | "CREATOR";
  reason: string;

  status: DisputeStatus;

  // ⏱ SLA & escalation
  slaHours: number;
  escalatedAt?: Date;
  escalationLevel: EscalationLevel;

  // 🚩 Auto flags (signals only)
  signals: DisputeSignal[];

  resolution?: {
    action: "REFUND_USER" | "PAY_CREATOR" | "NO_ACTION";
    note?: string;
    resolvedBy: Types.ObjectId;
    resolvedAt: Date;
  };

  createdAt: Date;
  updatedAt: Date;
}

const DisputeSchema = new Schema<IDispute>(
  {
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      unique: true,
    },
    raisedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    raisedByRole: {
      type: String,
      enum: ["USER", "CREATOR"],
      required: true,
    },
    reason: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: ["OPEN", "RESOLVED", "REJECTED"],
      default: "OPEN",
      index: true,
    },

    /* ================= SLA ================= */

    slaHours: {
      type: Number,
      default: 48,
      min: 1,
    },
    escalatedAt: Date,
    escalationLevel: {
      type: String,
      enum: ["NONE", "SOFT", "HARD"],
      default: "NONE",
      index: true,
    },

    /* ================= SIGNALS ================= */

    signals: {
      type: [String],
      default: [],
      index: true,
    },

    /* ================= RESOLUTION ================= */

    resolution: {
      action: {
        type: String,
        enum: ["REFUND_USER", "PAY_CREATOR", "NO_ACTION"],
      },
      note: String,
      resolvedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
      resolvedAt: Date,
    },
  },
  { timestamps: true }
);

export const Dispute = mongoose.model<IDispute>(
  "Dispute",
  DisputeSchema
);
