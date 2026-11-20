import mongoose, { Document, Schema } from "mongoose";

export interface AuthSessionDocument extends Document { userId: mongoose.Types.ObjectId; expiresAt: Date; revokedAt: Date | null; lastSeenAt: Date; createdAt: Date; }
const schema = new Schema<AuthSessionDocument>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true, immutable: true },
  expiresAt: { type: Date, required: true, immutable: true },
  revokedAt: { type: Date, default: null, index: true },
  lastSeenAt: { type: Date, required: true, default: Date.now },
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const AuthSession = mongoose.model<AuthSessionDocument>("AuthSession", schema);
