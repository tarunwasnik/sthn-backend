import mongoose, { Document, Schema } from "mongoose";

export type ProfileVerificationJobType = "PROFILE_VERIFICATION_PROCESSING";
export type ProfileVerificationJobStatus = "PENDING" | "RUNNING" | "RETRY_WAIT" | "COMPLETED" | "FAILED";

export interface ProfileVerificationJobDocument extends Document {
  jobReference: string;
  verificationRequestId: mongoose.Types.ObjectId;
  profileId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  profileSubmissionVersion: number;
  jobType: ProfileVerificationJobType;
  status: ProfileVerificationJobStatus;
  attemptCount: number;
  maxRetryCount: number;
  nextAttemptAt: Date;
  claimedAt?: Date;
  leaseExpiresAt?: Date;
  workerId?: string;
  lastStartedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProfileVerificationJobSchema = new Schema<ProfileVerificationJobDocument>({
  jobReference: { type: String, required: true, unique: true, trim: true, maxlength: 96, index: true },
  verificationRequestId: { type: Schema.Types.ObjectId, ref: "ProfileVerificationRequest", required: true, index: true },
  profileId: { type: Schema.Types.ObjectId, ref: "UserProfile", required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  profileSubmissionVersion: { type: Number, required: true, min: 1 },
  jobType: { type: String, required: true, enum: ["PROFILE_VERIFICATION_PROCESSING"], index: true },
  status: { type: String, required: true, enum: ["PENDING", "RUNNING", "RETRY_WAIT", "COMPLETED", "FAILED"], default: "PENDING", index: true },
  attemptCount: { type: Number, required: true, default: 0, min: 0 },
  maxRetryCount: { type: Number, required: true, default: 3, min: 1, max: 10 },
  nextAttemptAt: { type: Date, required: true, default: Date.now, index: true },
  claimedAt: { type: Date },
  leaseExpiresAt: { type: Date, index: true },
  workerId: { type: String, trim: true, maxlength: 160 },
  lastStartedAt: { type: Date },
  completedAt: { type: Date },
  failedAt: { type: Date },
  lastErrorCode: { type: String, trim: true, maxlength: 80 },
  lastErrorMessage: { type: String, trim: true, maxlength: 500 },
}, { timestamps: true });

ProfileVerificationJobSchema.index(
  { verificationRequestId: 1, jobType: 1 },
  { unique: true, name: "one_profile_verification_processing_job" },
);
ProfileVerificationJobSchema.index({ status: 1, nextAttemptAt: 1 });
ProfileVerificationJobSchema.index({ status: 1, leaseExpiresAt: 1 });
ProfileVerificationJobSchema.index({ profileId: 1, profileSubmissionVersion: 1 });

export const ProfileVerificationJob = mongoose.model<ProfileVerificationJobDocument>(
  "ProfileVerificationJob",
  ProfileVerificationJobSchema,
);
