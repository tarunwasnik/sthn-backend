//backend/src/models/dispute.model.ts

import mongoose, { Schema, Document, Types } from "mongoose";

export type DisputeStatus = "OPEN" | "RESOLVED" | "REJECTED";
export type EscalationLevel = "NONE" | "SOFT" | "HARD";
export type DisputeSignal =
  | "SLA_SOFT_BREACH"
  | "SLA_HARD_BREACH"
  | "REPEAT_OFFENDER";
export type DisputeInputState = "OPEN" | "CLOSED";

export interface IDisputeInputAccess {
  state: DisputeInputState;
  changedAt?: Date;
  changedBy?: Types.ObjectId;
}

export interface IDispute extends Document {
  bookingId: Types.ObjectId;
  raisedBy: Types.ObjectId;
  raisedByRole: "USER" | "CREATOR";
  reason: string;

  status: DisputeStatus;

  /** Private-branch submission permission; one shared dispute, two branches. */
  customerInput: IDisputeInputAccess;
  creatorInput: IDisputeInputAccess;

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
  finalDecision?: { customerOutcome:"NO_ADVERSE_FINDING"|"ADVERSE_FINDING"|"MIXED"|"INCONCLUSIVE"; customerSummary:string; creatorOutcome:"NO_ADVERSE_FINDING"|"ADVERSE_FINDING"|"MIXED"|"INCONCLUSIVE"; creatorSummary:string; summary:string; financialReviewRequired:boolean; governanceReviewRequired:boolean; finalizedBy:Types.ObjectId; finalizedAt:Date; };

  createdAt: Date;
  updatedAt: Date;
}

const DisputeInputAccessSchema = new Schema<IDisputeInputAccess>(
  {
    state: { type: String, enum: ["OPEN", "CLOSED"], required: true, default: "OPEN" },
    changedAt: Date,
    changedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { _id: false, id: false },
);

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

    customerInput: {
      type: DisputeInputAccessSchema,
      required: true,
      default: () => ({ state: "OPEN" }),
    },
    creatorInput: {
      type: DisputeInputAccessSchema,
      required: true,
      default: () => ({ state: "OPEN" }),
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
    finalDecision:{type:{customerOutcome:{type:String,enum:["NO_ADVERSE_FINDING","ADVERSE_FINDING","MIXED","INCONCLUSIVE"]},customerSummary:{type:String,maxlength:2000},creatorOutcome:{type:String,enum:["NO_ADVERSE_FINDING","ADVERSE_FINDING","MIXED","INCONCLUSIVE"]},creatorSummary:{type:String,maxlength:2000},summary:{type:String,maxlength:4000},financialReviewRequired:Boolean,governanceReviewRequired:Boolean,finalizedBy:{type:Schema.Types.ObjectId,ref:"User"},finalizedAt:Date},default:undefined},
  },
  { timestamps: true }
);

export const Dispute = mongoose.model<IDispute>(
  "Dispute",
  DisputeSchema
);
