import mongoose, { Document, Schema } from "mongoose";

export interface AccountPreferenceDocument extends Document {
  userId: mongoose.Types.ObjectId;
  /** Null means follow the browser's local time zone. */
  displayTimeZone: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const AccountPreferenceSchema = new Schema<AccountPreferenceDocument>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, immutable: true, index: true },
  displayTimeZone: { type: String, default: null, trim: true, maxlength: 64 },
}, { timestamps: true });

export const AccountPreference = mongoose.model<AccountPreferenceDocument>("AccountPreference", AccountPreferenceSchema);
