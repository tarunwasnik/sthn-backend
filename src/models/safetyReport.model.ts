import mongoose, { Document, Schema } from "mongoose";

export const SAFETY_REPORT_REASONS = ["HARASSMENT", "THREATS", "SPAM", "IMPERSONATION", "INAPPROPRIATE_CONDUCT", "OTHER"] as const;
export type SafetyReportReason = typeof SAFETY_REPORT_REASONS[number];
export const SAFETY_REPORT_STATUSES = ["SUBMITTED", "UNDER_REVIEW", "RESOLVED", "DISMISSED"] as const;
export type SafetyReportStatus = typeof SAFETY_REPORT_STATUSES[number];

export interface SafetyReportDocument extends Document {
  reporterId: mongoose.Types.ObjectId; reportedUserId: mongoose.Types.ObjectId; reason: SafetyReportReason; explanation: string;
  bookingId?: mongoose.Types.ObjectId; messageId?: mongoose.Types.ObjectId; status: SafetyReportStatus;
  decision?: { outcome: "RESOLVED" | "DISMISSED"; rationale: string; decidedBy: mongoose.Types.ObjectId; decidedAt: Date };
  createdAt: Date; updatedAt: Date;
}
const schema = new Schema<SafetyReportDocument>({
  reporterId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true, index: true },
  reportedUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true, index: true },
  reason: { type: String, enum: SAFETY_REPORT_REASONS, required: true, immutable: true },
  explanation: { type: String, required: true, trim: true, minlength: 12, maxlength: 2000, immutable: true },
  bookingId: { type: Schema.Types.ObjectId, ref: "Booking", immutable: true, index: true },
  messageId: { type: Schema.Types.ObjectId, ref: "Chat", immutable: true, index: true },
  status: { type: String, enum: SAFETY_REPORT_STATUSES, default: "SUBMITTED", index: true },
  decision: { outcome: { type: String, enum: ["RESOLVED", "DISMISSED"] }, rationale: { type: String, maxlength: 2000 }, decidedBy: { type: Schema.Types.ObjectId, ref: "User" }, decidedAt: Date },
}, { timestamps: true });
schema.index({ reporterId: 1, createdAt: -1 }); schema.index({ status: 1, createdAt: -1 });
export const SafetyReport = mongoose.model<SafetyReportDocument>("SafetyReport", schema);
