import mongoose, { Document, Schema } from "mongoose";
import {
  PROFILE_VERIFICATION_ANTI_SPOOF_FINDINGS,
  PROFILE_VERIFICATION_AVATAR_FINDINGS,
  PROFILE_VERIFICATION_CAPTURE_REASON_CODES,
  PROFILE_VERIFICATION_CAPTURE_USABILITY_FINDINGS,
  PROFILE_VERIFICATION_CROSS_CAPTURE_FINDINGS,
  PROFILE_VERIFICATION_FACE_COUNT_FINDINGS,
  PROFILE_VERIFICATION_INFERENCE_PIPELINE_KINDS,
  ProfileVerificationAntiSpoofFinding,
  ProfileVerificationAvatarFinding,
  ProfileVerificationCaptureReasonCode,
  ProfileVerificationCaptureUsabilityFinding,
  ProfileVerificationCrossCaptureFinding,
  ProfileVerificationFaceCountFinding,
  ProfileVerificationInferencePipelineKind,
  ProfileVerificationShadowIdentityConclusion,
  ProfileVerificationShadowIdentityStatus,
  PROFILE_VERIFICATION_SHADOW_IDENTITY_CONCLUSIONS,
  PROFILE_VERIFICATION_SHADOW_IDENTITY_STATUSES,
} from "../enums/profileVerificationInference.enums";
import { FaceVerificationChallenge } from "./faceVerificationSession.model";

export interface ProfileVerificationInferencePipelineComponentDocument {
  identifier: string;
  version: string;
  artifactSha256: string;
}

export interface ProfileVerificationInferenceResultDocument extends Document {
  inferenceReference: string;
  inferenceRunFingerprint: string;
  verificationRequestId: mongoose.Types.ObjectId;
  profileId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  profileSubmissionVersion: number;
  faceVerificationSessionId: mongoose.Types.ObjectId;
  evidenceSetFingerprint: string;
  pipelineManifestFingerprint: string;
  pipeline: {
    kind: ProfileVerificationInferencePipelineKind;
    pipelineVersion: string;
    runtimeIdentifier: string;
    runtimeVersion: string;
    preprocessingVersion?: string;
    detector?: ProfileVerificationInferencePipelineComponentDocument;
    embedding?: ProfileVerificationInferencePipelineComponentDocument;
  };
  findings: {
    captures: Array<{
      challengeIndex: number;
      challenge: FaceVerificationChallenge;
      faceCount: ProfileVerificationFaceCountFinding;
      usability: ProfileVerificationCaptureUsabilityFinding;
      reasonCodes: ProfileVerificationCaptureReasonCode[];
    }>;
    crossCapture: { status: ProfileVerificationCrossCaptureFinding; usableCaptureCount: number; outlierCaptureCount: number };
    avatar: { status: ProfileVerificationAvatarFinding };
    antiSpoof: { status: ProfileVerificationAntiSpoofFinding };
  };
  shadowIdentityAnalysis?: { status: ProfileVerificationShadowIdentityStatus; conclusion?: ProfileVerificationShadowIdentityConclusion; similarity?: number; threshold?: number; model?: { identifier: string; version: string }; processedAt?: Date; reasonCode?: string; reason?: string };
  retentionDeadline: Date;
  createdAt: Date;
  updatedAt: Date;
}

const componentSchema = new Schema<ProfileVerificationInferencePipelineComponentDocument>({
  identifier: { type: String, required: true, immutable: true, trim: true, maxlength: 120 },
  version: { type: String, required: true, immutable: true, trim: true, maxlength: 120 },
  artifactSha256: { type: String, required: true, immutable: true, lowercase: true, match: /^[a-f0-9]{64}$/ },
}, { _id: false, strict: "throw" });

const shadowIdentityAnalysisSchema = new Schema({
  status: { type: String, enum: PROFILE_VERIFICATION_SHADOW_IDENTITY_STATUSES, required: true, immutable: true },
  conclusion: { type: String, enum: PROFILE_VERIFICATION_SHADOW_IDENTITY_CONCLUSIONS, immutable: true },
  similarity: { type: Number, immutable: true, min: -1, max: 1 },
  threshold: { type: Number, immutable: true, min: -1, max: 1 },
  model: {
    identifier: { type: String, immutable: true, trim: true, maxlength: 120 },
    version: { type: String, immutable: true, trim: true, maxlength: 120 },
  },
  processedAt: { type: Date, immutable: true },
  reasonCode: { type: String, immutable: true, trim: true, maxlength: 80 },
  reason: { type: String, immutable: true, trim: true, maxlength: 500 },
}, { _id: false, strict: "throw" });

const schema = new Schema<ProfileVerificationInferenceResultDocument>({
  inferenceReference: { type: String, required: true, unique: true, immutable: true, index: true, trim: true, maxlength: 96 },
  inferenceRunFingerprint: { type: String, required: true, unique: true, immutable: true, index: true, lowercase: true, match: /^[a-f0-9]{64}$/ },
  verificationRequestId: { type: Schema.Types.ObjectId, ref: "ProfileVerificationRequest", required: true, immutable: true, index: true },
  profileId: { type: Schema.Types.ObjectId, ref: "UserProfile", required: true, immutable: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true, index: true },
  profileSubmissionVersion: { type: Number, required: true, immutable: true, min: 1, index: true },
  faceVerificationSessionId: { type: Schema.Types.ObjectId, ref: "FaceVerificationSession", required: true, immutable: true, index: true },
  evidenceSetFingerprint: { type: String, required: true, immutable: true, lowercase: true, match: /^[a-f0-9]{64}$/ },
  pipelineManifestFingerprint: { type: String, required: true, immutable: true, lowercase: true, match: /^[a-f0-9]{64}$/ },
  pipeline: {
    kind: { type: String, required: true, immutable: true, enum: PROFILE_VERIFICATION_INFERENCE_PIPELINE_KINDS },
    pipelineVersion: { type: String, required: true, immutable: true, trim: true, maxlength: 120 },
    runtimeIdentifier: { type: String, required: true, immutable: true, trim: true, maxlength: 120 },
    runtimeVersion: { type: String, required: true, immutable: true, trim: true, maxlength: 120 },
    preprocessingVersion: { type: String, immutable: true, trim: true, maxlength: 120 },
    detector: { type: componentSchema, immutable: true },
    embedding: { type: componentSchema, immutable: true },
  },
  findings: {
    captures: [{
      _id: false,
      challengeIndex: { type: Number, required: true, immutable: true, min: 0, max: 4 },
      challenge: { type: String, required: true, immutable: true, enum: ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "LOOK_DOWN", "BLINK"] },
      faceCount: { type: String, required: true, immutable: true, enum: PROFILE_VERIFICATION_FACE_COUNT_FINDINGS },
      usability: { type: String, required: true, immutable: true, enum: PROFILE_VERIFICATION_CAPTURE_USABILITY_FINDINGS },
      reasonCodes: { type: [String], required: true, immutable: true, enum: PROFILE_VERIFICATION_CAPTURE_REASON_CODES, validate: { validator: (value: string[]) => value.length <= 5 && new Set(value).size === value.length, message: "Capture reason codes must be unique and bounded" } },
    }],
    crossCapture: {
      status: { type: String, required: true, immutable: true, enum: PROFILE_VERIFICATION_CROSS_CAPTURE_FINDINGS },
      usableCaptureCount: { type: Number, required: true, immutable: true, min: 0, max: 5 },
      outlierCaptureCount: { type: Number, required: true, immutable: true, min: 0, max: 5 },
    },
    avatar: { status: { type: String, required: true, immutable: true, enum: PROFILE_VERIFICATION_AVATAR_FINDINGS } },
    antiSpoof: { status: { type: String, required: true, immutable: true, enum: PROFILE_VERIFICATION_ANTI_SPOOF_FINDINGS } },
  },
  shadowIdentityAnalysis: { type: shadowIdentityAnalysisSchema, required: false, default: undefined, immutable: true },
  retentionDeadline: { type: Date, required: true, immutable: true, index: true },
}, { timestamps: true, strict: "throw" });

schema.path("findings.captures").validate((value: Array<{ challengeIndex?: unknown }>) => (
  value.length === 5
  && new Set(value.map((capture) => capture.challengeIndex)).size === 5
  && value.every((capture) => Number.isInteger(capture.challengeIndex) && Number(capture.challengeIndex) >= 0 && Number(capture.challengeIndex) <= 4)
), "Exactly five distinct per-capture findings at indexes 0 through 4 are required");
schema.pre(["updateOne", "updateMany", "findOneAndUpdate", "replaceOne"], function rejectInferenceResultMutation() {
  const update = this.getUpdate() as { $set?: Record<string, unknown> } | undefined;
  const set = update?.$set;
  if (set && set.retentionDeadline instanceof Date
    && Object.keys(set).every((key) => key === "retentionDeadline" || key === "updatedAt")) return;
  throw new Error("Profile verification inference results are immutable except for retention deadline shortening");
});
schema.index(
  { verificationRequestId: 1, profileSubmissionVersion: 1, faceVerificationSessionId: 1, evidenceSetFingerprint: 1, pipelineManifestFingerprint: 1 },
  { unique: true, name: "one_profile_verification_inference_result_per_exact_run" },
);
schema.index({ retentionDeadline: 1, _id: 1 }, { name: "profile_verification_inference_retention_cleanup" });

export const ProfileVerificationInferenceResult = mongoose.model<ProfileVerificationInferenceResultDocument>("ProfileVerificationInferenceResult", schema);
