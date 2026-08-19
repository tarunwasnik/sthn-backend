import crypto from "crypto";
import mongoose, { Document, Schema, Types } from "mongoose";

export type DisputeRequestTarget = "CUSTOMER" | "CREATOR" | "BOTH";
export interface IDisputeAdminRequest extends Document {
  requestReference: string; disputeId: Types.ObjectId; requestedBy: Types.ObjectId; target: DisputeRequestTarget; text: string; createdAt: Date; updatedAt: Date;
}
const schema = new Schema<IDisputeAdminRequest>({
  requestReference: { type: String, required: true, immutable: true, unique: true, index: true, default: () => `DISPUTE_REQUEST_${crypto.randomBytes(10).toString("hex").toUpperCase()}` },
  disputeId: { type: Schema.Types.ObjectId, ref: "Dispute", required: true, immutable: true, index: true },
  requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  target: { type: String, enum: ["CUSTOMER", "CREATOR", "BOTH"], required: true, immutable: true },
  text: { type: String, required: true, trim: true, maxlength: 4000, immutable: true },
}, { timestamps: true });
schema.index({ disputeId: 1, createdAt: 1, _id: 1 });
export const DisputeAdminRequest = mongoose.model<IDisputeAdminRequest>("DisputeAdminRequest", schema);
