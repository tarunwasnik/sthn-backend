import mongoose, { Document, Schema } from "mongoose";

/** A Creator-owned, directional admission rule for future booking requests. */
export interface CreatorCustomerBlockDocument extends Document {
  creatorId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CreatorCustomerBlockSchema = new Schema<CreatorCustomerBlockDocument>(
  {
    creatorId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true, index: true },
  },
  { timestamps: true },
);

CreatorCustomerBlockSchema.index({ creatorId: 1, customerId: 1 }, { unique: true });

export const CreatorCustomerBlock = mongoose.model<CreatorCustomerBlockDocument>(
  "CreatorCustomerBlock",
  CreatorCustomerBlockSchema,
);
