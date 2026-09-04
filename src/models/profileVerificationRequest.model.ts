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
export type ProfileVerificationPolicyKey = "LEGACY_AVATAR_ONLY" | "GATED_MULTI_MEDIA";
export interface ProfileVerificationPolicy { key: ProfileVerificationPolicyKey; version: string; }
export type ProfileVerificationSubmittedMediaRole = "AVATAR" | "COVER" | "PROFILE_PHOTO";
export interface ProfileVerificationSubmittedMediaItem {
  role: ProfileVerificationSubmittedMediaRole;
  profilePhotoIndex?: number;
  sourceReference: string;
  fingerprint: string;
}
export interface ProfileVerificationSubmittedMediaSnapshot {
  avatar: ProfileVerificationSubmittedMediaItem;
  cover: ProfileVerificationSubmittedMediaItem;
  profilePhotos: ProfileVerificationSubmittedMediaItem[];
}
export type ProfileVerificationAdminReviewReasonCode =
  | "FACE_MATCH_UNCERTAIN"
  | "LIVENESS_UNCERTAIN"
  | "TEXT_MODERATION_UNCERTAIN"
  | "IMAGE_MODERATION_UNCERTAIN"
  | "CONFLICTING_CHECKS"
  | "PROCESSING_TIMEOUT"
  | "MODEL_FAILURE"
  | "OTHER";
export interface ProfileVerificationAiDecisionSnapshot { source: "AI"; model: { identifier: string; version: string }; similarity: number; threshold: number; decidedAt: Date; }

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
  aiDecisionSnapshot?: ProfileVerificationAiDecisionSnapshot;
  /** Immutable selection for new requests; absent historical requests are legacy. */
  verificationPolicy?: ProfileVerificationPolicy;
  /** Immutable media authority captured with this exact submission; absent only for legacy requests. */
  submittedMedia?: ProfileVerificationSubmittedMediaSnapshot;
  createdAt: Date;
  updatedAt: Date;
}

const submittedMediaItemSchema = new Schema<ProfileVerificationSubmittedMediaItem>({
  role: { type: String, required: true, immutable: true, enum: ["AVATAR", "COVER", "PROFILE_PHOTO"] },
  profilePhotoIndex: { type: Number, immutable: true, min: 0, max: 5 },
  sourceReference: { type: String, required: true, immutable: true, trim: true, minlength: 1, maxlength: 2048 },
  fingerprint: { type: String, required: true, immutable: true, lowercase: true, match: /^[a-f0-9]{64}$/ },
}, { _id: false, strict: "throw" });

const submittedMediaSnapshotSchema = new Schema<ProfileVerificationSubmittedMediaSnapshot>({
  avatar: { type: submittedMediaItemSchema, required: true, immutable: true },
  cover: { type: submittedMediaItemSchema, required: true, immutable: true },
  profilePhotos: { type: [submittedMediaItemSchema], required: true, immutable: true, validate: {
    validator: (value: ProfileVerificationSubmittedMediaItem[]) => Array.isArray(value)
      && value.length >= 2 && value.length <= 6
      && value.every((item, index) => item.role === "PROFILE_PHOTO" && item.profilePhotoIndex === index),
    message: "Submitted profile media must preserve the ordered gallery authority",
  } },
}, { _id: false, strict: "throw" });
const verificationPolicySchema = new Schema<ProfileVerificationPolicy>({
  key: { type: String, required: true, immutable: true, enum: ["LEGACY_AVATAR_ONLY", "GATED_MULTI_MEDIA"] },
  version: { type: String, required: true, immutable: true, trim: true, maxlength: 40 },
}, { _id: false, strict: "throw" });

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
    aiDecisionSnapshot: { type: new Schema({ source: { type: String, required: true, enum: ["AI"] }, model: { identifier: { type: String, required: true, trim: true, maxlength: 120 }, version: { type: String, required: true, trim: true, maxlength: 120 } }, similarity: { type: Number, required: true, min: -1, max: 1 }, threshold: { type: Number, required: true, min: -1, max: 1 }, decidedAt: { type: Date, required: true } }, { _id: false, strict: "throw" }), default: undefined },
    verificationPolicy: { type: verificationPolicySchema, required: false, default: undefined, immutable: true },
    submittedMedia: { type: submittedMediaSnapshotSchema, required: false, default: undefined, immutable: true },
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
