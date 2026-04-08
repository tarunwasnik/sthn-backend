//backend/src/models/appeal.model.ts


import mongoose, { Schema, Document, Types } from "mongoose";

export type AppealStatus =
  | "OPEN"
  | "UPHELD"
  | "REJECTED";

export interface IAppeal extends Document {
  disputeId: Types.ObjectId;

  raisedBy: Types.ObjectId;
  raisedByRole: "USER" | "CREATOR";

  reason: string;
  evidence?: string[]; // URLs / references (no files for now)

  status: AppealStatus;

  decision?: {
    action: "REVERSE_DECISION" | "CONFIRM_DECISION";
    note?: string;
    decidedBy: Types.ObjectId;
    decidedAt: Date;
  };

  createdAt: Date;
  updatedAt: Date;
}

const AppealSchema = new Schema<IAppeal>(
  {
    disputeId: {
      type: Schema.Types.ObjectId,
      ref: "Dispute",
      required: true,
      unique: true, // 🔒 one appeal per dispute
      index: true,
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
      maxlength: 1500,
    },
    evidence: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ["OPEN", "UPHELD", "REJECTED"],
      default: "OPEN",
      index: true,
    },
    decision: {
      action: {
        type: String,
        enum: ["REVERSE_DECISION", "CONFIRM_DECISION"],
      },
      note: String,
      decidedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
      decidedAt: Date,
    },
  },
  { timestamps: true }
);

export const Appeal = mongoose.model<IAppeal>(
  "Appeal",
  AppealSchema
);