import mongoose, { Document, Schema } from "mongoose";

export type AuthThrottleScope = "LOGIN_IP" | "LOGIN_IDENTIFIER" | "REGISTER_IP" | "REGISTER_IDENTIFIER" | "PASSWORD_CHANGE_IP";

export interface IAuthThrottle extends Document {
  scope: AuthThrottleScope;
  keyHash: string;
  windowStartedAt: Date;
  count: number;
  blockedUntil: Date | null;
  expiresAt: Date;
}

const AuthThrottleSchema = new Schema<IAuthThrottle>({
  scope: { type: String, required: true, index: true },
  keyHash: { type: String, required: true },
  windowStartedAt: { type: Date, required: true },
  count: { type: Number, required: true, min: 0 },
  blockedUntil: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

AuthThrottleSchema.index({ scope: 1, keyHash: 1 }, { unique: true });
AuthThrottleSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AuthThrottle = mongoose.model<IAuthThrottle>("AuthThrottle", AuthThrottleSchema);
