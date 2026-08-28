import mongoose, { Document, Schema } from "mongoose";

export type ProfileVerificationRequestStatus =
  | "PENDING"
  | "PROCESSING"
  | "ADMIN_REVIEW_REQUIRED"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED";

export type ProfileVerificationDecision = "APPROVE" | "REJECT";
export type ProfileVerificationDecisionAuthority = "ADMIN" | "AI";
export type ProfileVerificationAdminReviewReasonCode =
  | "FACE_MATCH_UNCERTAIN"
  | "LIVENESS_UNCERTAIN"
  | "TEXT_MODERATION_UNCERTAIN"
  | "IMAGE_MODERATION_UNCERTAIN"
  | "CONFLICTING_CHECKS"
  | "PROCESSING_TIMEOUT"
  | "MODEL_FAILURE"
  | "OTHER";

export interface ProfileVerificationRequestDocument extends Document {
  verificationReference: string;
  profileId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  attemptNumber: number;
  profileSubmissionVersion: number;
  status: ProfileVerificationRequestStatus;
  isActive: boolean;
  submittedAt: Date;
  expiredAt?: Date;
  processingStartedAt?: Date;
  adminReviewRequiredAt?: Date;
  adminReviewReasonCode?: ProfileVerificationAdminReviewReasonCode;
  adminReviewReason?: string;
  decision?: ProfileVerificationDecision;
  decisionAuthority?: ProfileVerificationDecisionAuthority;
  decisionReason?: string;
  decidedAt?: Date;
  decidedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ProfileVerificationRequestSchema = new Schema<ProfileVerificationRequestDocument>(
  {
    verificationReference: { type: String, required: true, unique: true, index: true, trim: true, maxlength: 80 },
    profileId: { type: Schema.Types.ObjectId, ref: "UserProfile", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    attemptNumber: { type: Number, required: true, min: 1 },
    profileSubmissionVersion: { type: Number, required: true, min: 1 },
    status: { type: String, required: true, enum: ["PENDING", "PROCESSING", "ADMIN_REVIEW_REQUIRED", "APPROVED", "REJECTED", "EXPIRED"], default: "PENDING", index: true },
    isActive: { type: Boolean, required: true, default: true, index: true },
    submittedAt: { type: Date, required: true, immutable: true, default: Date.now, index: true },
    expiredAt: { type: Date, index: true },
    processingStartedAt: { type: Date },
    adminReviewRequiredAt: { type: Date, index: true },
    adminReviewReasonCode: { type: String, enum: ["FACE_MATCH_UNCERTAIN", "LIVENESS_UNCERTAIN", "TEXT_MODERATION_UNCERTAIN", "IMAGE_MODERATION_UNCERTAIN", "CONFLICTING_CHECKS", "PROCESSING_TIMEOUT", "MODEL_FAILURE", "OTHER"] },
    adminReviewReason: { type: String, trim: true, maxlength: 500 },
    decision: { type: String, enum: ["APPROVE", "REJECT"] },
    decisionAuthority: { type: String, enum: ["ADMIN", "AI"] },
    decisionReason: { type: String, trim: true, maxlength: 2000 },
    decidedAt: { type: Date },
    decidedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

ProfileVerificationRequestSchema.index(
  { profileId: 1 },
  { unique: true, partialFilterExpression: { isActive: true }, name: "one_active_profile_verification_request" },
);
ProfileVerificationRequestSchema.index({ profileId: 1, attemptNumber: -1 });
ProfileVerificationRequestSchema.index({ status: 1, submittedAt: -1 });
ProfileVerificationRequestSchema.index({ status: 1, adminReviewRequiredAt: -1 });

export const ProfileVerificationRequest = mongoose.model<ProfileVerificationRequestDocument>(
  "ProfileVerificationRequest",
  ProfileVerificationRequestSchema,
);
