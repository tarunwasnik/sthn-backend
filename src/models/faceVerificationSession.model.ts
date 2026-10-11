import mongoose, { Document, Schema, SchemaDefinitionProperty } from "mongoose";

export type FaceVerificationSessionStatus = "CREATED" | "CAPTURING" | "CAPTURE_COMPLETE" | "CANCELLED" | "EXPIRED" | "INVALIDATED";
export type FaceVerificationChallenge = "NEUTRAL" | "TURN_LEFT" | "TURN_RIGHT" | "LOOK_UP" | "LOOK_DOWN" | "BLINK";
export type FaceVerificationAvatarCandidate = Readonly<{
  kind: "PROFILE_REFERENCE";
  trustedMediaReference: string;
  fingerprint: string;
}> | Readonly<{
  kind: "ADMISSION";
  admissionId: mongoose.Types.ObjectId;
  admissionReference: string;
  assetId: mongoose.Types.ObjectId;
  trustedMediaReference: string;
  contentSha256: string;
  fingerprint: string;
  expiresAt: Date;
}>;

export interface FaceVerificationSessionDocument extends Document {
  sessionReference: string;
  userId: mongoose.Types.ObjectId;
  profileId: mongoose.Types.ObjectId;
  verificationRequestId?: mongoose.Types.ObjectId;
  profileSubmissionVersion: number;
  avatarFingerprint: string;
  /** Optional for legacy sessions; new candidate-backed sessions retain immutable server authority. */
  avatarCandidate?: FaceVerificationAvatarCandidate;
  status: FaceVerificationSessionStatus;
  isCurrent: boolean;
  challenges: FaceVerificationChallenge[];
  requiredCaptureCount: number;
  acceptedCaptureCount: number;
  startedAt: Date;
  expiresAt: Date;
  captureCompletedAt?: Date;
  cancelledAt?: Date;
  invalidatedAt?: Date;
  invalidationCode?: string;
  cleanupAfter?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const fingerprint = { type: String, required: true, immutable: true, trim: true, minlength: 64, maxlength: 64 };
const candidateSchema = new Schema({
  kind: { type: String, required: true, immutable: true, enum: ["PROFILE_REFERENCE", "ADMISSION"] },
  trustedMediaReference: { type: String, required: true, immutable: true, trim: true, minlength: 1, maxlength: 2048 },
  fingerprint,
  admissionId: { type: Schema.Types.ObjectId, ref: "ImageAdmission", immutable: true, required: function (this: { kind: string }) { return this.kind === "ADMISSION"; } },
  admissionReference: { type: String, immutable: true, trim: true, maxlength: 80, required: function (this: { kind: string }) { return this.kind === "ADMISSION"; } },
  assetId: { type: Schema.Types.ObjectId, ref: "ImageModerationAsset", immutable: true, required: function (this: { kind: string }) { return this.kind === "ADMISSION"; } },
  contentSha256: { type: String, immutable: true, lowercase: true, match: /^[a-f0-9]{64}$/, required: function (this: { kind: string }) { return this.kind === "ADMISSION"; } },
  expiresAt: { type: Date, immutable: true, required: function (this: { kind: string }) { return this.kind === "ADMISSION"; } },
}, { _id: false, strict: "throw" });

const avatarCandidateField = {
  type: candidateSchema,
  immutable: true,
  validate: {
    validator: function (this: FaceVerificationSessionDocument, value: FaceVerificationAvatarCandidate | undefined) {
      if (!value || value.fingerprint !== this.avatarFingerprint) return false;
      if (value.kind === "PROFILE_REFERENCE") {
        const profileCandidate = value as unknown as Record<string, unknown>;
        return ["admissionId", "admissionReference", "assetId", "contentSha256", "expiresAt"].every((key) => profileCandidate[key] === undefined);
      }
      return Boolean(value.admissionId && value.admissionReference && value.assetId && value.contentSha256 && value.expiresAt);
    },
    message: "Face verification avatar candidate fingerprint must match avatarFingerprint",
  },
} as unknown as SchemaDefinitionProperty<FaceVerificationAvatarCandidate | undefined, FaceVerificationSessionDocument>;

const schema = new Schema<FaceVerificationSessionDocument>({
  sessionReference: { type: String, required: true, unique: true, index: true, trim: true, maxlength: 96 },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  profileId: { type: Schema.Types.ObjectId, ref: "UserProfile", required: true, index: true },
  verificationRequestId: { type: Schema.Types.ObjectId, ref: "ProfileVerificationRequest", index: true },
  profileSubmissionVersion: { type: Number, required: true, min: 1, index: true },
  avatarFingerprint: { type: String, required: true, trim: true, minlength: 64, maxlength: 64 },
  avatarCandidate: avatarCandidateField,
  status: { type: String, required: true, enum: ["CREATED", "CAPTURING", "CAPTURE_COMPLETE", "CANCELLED", "EXPIRED", "INVALIDATED"], default: "CREATED", index: true },
  isCurrent: { type: Boolean, required: true, default: true, index: true },
  challenges: { type: [String], required: true, immutable: true, validate: { validator: (value: string[]) => value.length === 5 && new Set(value).size === 5, message: "Exactly five unique challenges are required" } },
  requiredCaptureCount: { type: Number, required: true, default: 5, immutable: true, min: 5, max: 5 },
  acceptedCaptureCount: { type: Number, required: true, default: 0, min: 0, max: 5 },
  startedAt: { type: Date, required: true, default: Date.now },
  expiresAt: { type: Date, required: true, index: true },
  captureCompletedAt: { type: Date },
  cancelledAt: { type: Date },
  invalidatedAt: { type: Date },
  invalidationCode: { type: String, trim: true, maxlength: 80 },
  cleanupAfter: { type: Date, index: true },
}, { timestamps: true });

schema.index({ profileId: 1 }, { unique: true, partialFilterExpression: { isCurrent: true }, name: "one_current_face_verification_session" });
schema.index({ userId: 1, status: 1, expiresAt: 1 });
schema.index({ verificationRequestId: 1, profileSubmissionVersion: 1 });

export const FaceVerificationSession = mongoose.model<FaceVerificationSessionDocument>("FaceVerificationSession", schema);
