import crypto from "crypto";
import mongoose, { Document, Schema, Types } from "mongoose";

export type InvestigationBranch = "CUSTOMER" | "CREATOR";
export type SubmissionKind = "STATEMENT" | "CLARIFICATION" | "EVIDENCE";

export interface IDisputeEvidence {
  evidenceReference: string;
  type: "IMAGE" | "DOCUMENT";
  url: string;
  publicId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  caption?: string;
}

export interface IDisputeInvestigationSubmission extends Document {
  submissionReference: string;
  disputeId: Types.ObjectId;
  bookingId: Types.ObjectId;
  submittedBy: Types.ObjectId;
  branch: InvestigationBranch;
  kind: SubmissionKind;
  text?: string;
  evidence: IDisputeEvidence[];
  sharedWithCounterpartyAt?: Date;
  sharedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const EvidenceSchema = new Schema<IDisputeEvidence>({
  evidenceReference: { type: String, required: true, immutable: true },
  type: { type: String, enum: ["IMAGE", "DOCUMENT"], required: true, immutable: true },
  url: { type: String, required: true, immutable: true }, publicId: { type: String, required: true, immutable: true },
  fileName: { type: String, required: true, immutable: true }, mimeType: { type: String, required: true, immutable: true },
  fileSize: { type: Number, required: true, immutable: true, min: 0 }, caption: { type: String, immutable: true, maxlength: 500 },
}, { _id: false, id: false });

const SubmissionSchema = new Schema<IDisputeInvestigationSubmission>({
  submissionReference: { type: String, required: true, immutable: true, unique: true, index: true, default: () => `DISPUTE_SUBMISSION_${crypto.randomBytes(10).toString("hex").toUpperCase()}` },
  disputeId: { type: Schema.Types.ObjectId, ref: "Dispute", required: true, immutable: true, index: true },
  bookingId: { type: Schema.Types.ObjectId, ref: "Booking", required: true, immutable: true, index: true },
  submittedBy: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  branch: { type: String, enum: ["CUSTOMER", "CREATOR"], required: true, immutable: true },
  kind: { type: String, enum: ["STATEMENT", "CLARIFICATION", "EVIDENCE"], required: true, immutable: true },
  text: { type: String, trim: true, maxlength: 4000, immutable: true },
  evidence: { type: [EvidenceSchema], default: [], immutable: true },
  sharedWithCounterpartyAt: Date, sharedBy: { type: Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });
SubmissionSchema.index({ disputeId: 1, createdAt: 1, _id: 1 });

export const DisputeInvestigationSubmission = mongoose.model<IDisputeInvestigationSubmission>("DisputeInvestigationSubmission", SubmissionSchema);
