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
import { ProfileVerificationPolicy } from "./profileVerificationRequest.model";

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
  profileMediaShadowAnalysis?: unknown;
  gatedPolicyAnalysis?: {
    policy: ProfileVerificationPolicy;
    gate1: { outcome: "PASS" | "LIVE_CAPTURE_TECHNICAL_FAILURE" | "LIVE_ANCHOR_INCOHERENT"; usableCaptureCount: number; weakestPeerMedian?: number; threshold: number; policyVersion: string };
    gate2?: { outcome: string; avatarAdmission?: string; optionalMediaSummary: { noFaceValidCount: number; usableFaceEvidenceCount: number; unusableEvidenceCount: number; mediaReadFailedCount: number } };
    gate3?: { conclusion: string; reasonCode?: string; avatarMembership: string; avatarMedianSimilarity?: number; membershipThreshold: number; multiFaceMinMargin: number; optionalPersonASupportCount: number; optionalAmbiguousMediaCount: number; optionalTechnicalFailureCount: number };
  };
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

const profileMediaCandidateSchema = new Schema({
  candidateIndex: { type: Number, required: true, immutable: true, min: 0, max: 49 }, comparisonCount: { type: Number, required: true, immutable: true, min: 0, max: 5 },
  minimumSimilarity: { type: Number, required: true, immutable: true, min: -1, max: 1 }, maximumSimilarity: { type: Number, required: true, immutable: true, min: -1, max: 1 },
  meanSimilarity: { type: Number, required: true, immutable: true, min: -1, max: 1 }, medianSimilarity: { type: Number, required: true, immutable: true, min: -1, max: 1 },
}, { _id: false, strict: "throw" });
const profileMediaShadowAnalysisSchema = new Schema({
  status: { type: String, required: true, immutable: true, enum: ["COMPLETED"] }, processedAt: { type: Date, required: true, immutable: true },
  reasonCode: { type: String, immutable: true, enum: ["MEDIA_SNAPSHOT_UNAVAILABLE", "INSUFFICIENT_USABLE_LIVE_CAPTURES"] },
  model: { identifier: { type: String, required: true, immutable: true, trim: true, maxlength: 120 }, version: { type: String, required: true, immutable: true, trim: true, maxlength: 120 } },
  summary: { submittedMediaCount: { type: Number, required: true, immutable: true, min: 0, max: 8 }, processedMediaCount: { type: Number, required: true, immutable: true, min: 0, max: 8 }, mediaWithNoFaceCount: { type: Number, required: true, immutable: true, min: 0, max: 8 }, mediaWithUsableFacesCount: { type: Number, required: true, immutable: true, min: 0, max: 8 }, multiFaceMediaCount: { type: Number, required: true, immutable: true, min: 0, max: 8 }, failedMediaCount: { type: Number, required: true, immutable: true, min: 0, max: 8 } },
  live: { usableCaptureCount: { type: Number, required: true, immutable: true, min: 0, max: 5 }, pairwiseComparisonCount: { type: Number, required: true, immutable: true, min: 0, max: 10 }, minimumSimilarity: { type: Number, immutable: true, min: -1, max: 1 }, maximumSimilarity: { type: Number, immutable: true, min: -1, max: 1 }, meanSimilarity: { type: Number, immutable: true, min: -1, max: 1 }, medianSimilarity: { type: Number, immutable: true, min: -1, max: 1 } },
  media: [{ _id: false, role: { type: String, required: true, immutable: true, enum: ["AVATAR", "COVER", "PROFILE_PHOTO"] }, profilePhotoIndex: { type: Number, immutable: true, min: 0, max: 5 }, status: { type: String, required: true, immutable: true, enum: ["NO_FACE", "NO_USABLE_FACE", "FACE_CANDIDATES_AVAILABLE", "MEDIA_READ_FAILED"] }, detectedFaceCount: { type: Number, required: true, immutable: true, min: 0, max: 50 }, usableFaceCount: { type: Number, required: true, immutable: true, min: 0, max: 50 }, candidateCount: { type: Number, required: true, immutable: true, min: 0, max: 50 }, bestCandidate: { type: profileMediaCandidateSchema, immutable: true }, secondBestMedianSimilarity: { type: Number, immutable: true, min: -1, max: 1 }, bestVsSecondMargin: { type: Number, immutable: true, min: -1, max: 1 } }],
}, { _id: false, strict: "throw" });
const policySchema = new Schema({ key: { type: String, required: true, enum: ["LEGACY_AVATAR_ONLY", "GATED_MULTI_MEDIA"] }, version: { type: String, required: true, trim: true, maxlength: 40 } }, { _id: false, strict: "throw" });
const gatedPolicyAnalysisSchema = new Schema({
  policy: { type: policySchema, required: true },
  gate1: {
    outcome: { type: String, required: true, immutable: true, enum: ["PASS", "LIVE_CAPTURE_TECHNICAL_FAILURE", "LIVE_ANCHOR_INCOHERENT"] },
    usableCaptureCount: { type: Number, required: true, immutable: true, min: 0, max: 5 },
    weakestPeerMedian: { type: Number, immutable: true, min: -1, max: 1 },
    threshold: { type: Number, required: true, immutable: true, min: -1, max: 1 },
    policyVersion: { type: String, required: true, immutable: true, trim: true, maxlength: 40 },
  },
  gate2: { type: new Schema({
    outcome: { type: String, required: true, immutable: true, enum: ["READY_FOR_GATE3", "AVATAR_INVALID", "MEDIA_SNAPSHOT_UNAVAILABLE", "LIVE_EVIDENCE_UNAVAILABLE"] },
    avatarAdmission: { type: String, immutable: true, enum: ["VALID_SINGLE_FACE", "AVATAR_INVALID_NO_FACE", "AVATAR_INVALID_FACE_UNUSABLE", "AVATAR_INVALID_MULTIPLE_FACES", "AVATAR_MEDIA_READ_FAILED"] },
    optionalMediaSummary: { noFaceValidCount: { type: Number, required: true, immutable: true, min: 0, max: 7 }, usableFaceEvidenceCount: { type: Number, required: true, immutable: true, min: 0, max: 7 }, unusableEvidenceCount: { type: Number, required: true, immutable: true, min: 0, max: 7 }, mediaReadFailedCount: { type: Number, required: true, immutable: true, min: 0, max: 7 } },
  }, { _id: false, strict: "throw" }), immutable: true },
  gate3: { type: new Schema({
    conclusion: { type: String, required: true, immutable: true, enum: ["LIKELY_MATCH", "LIKELY_MISMATCH", "UNABLE_TO_DETERMINE"] }, reasonCode: { type: String, immutable: true, maxlength: 80 },
    avatarMembership: { type: String, required: true, immutable: true, enum: ["PERSON_A_SUPPORTED", "PERSON_A_NOT_ESTABLISHED", "TECHNICAL_UNAVAILABLE"] }, avatarMedianSimilarity: { type: Number, immutable: true, min: -1, max: 1 }, membershipThreshold: { type: Number, required: true, immutable: true, min: -1, max: 1 }, multiFaceMinMargin: { type: Number, required: true, immutable: true, min: -1, max: 1 }, optionalPersonASupportCount: { type: Number, required: true, immutable: true, min: 0, max: 7 }, optionalAmbiguousMediaCount: { type: Number, required: true, immutable: true, min: 0, max: 7 }, optionalTechnicalFailureCount: { type: Number, required: true, immutable: true, min: 0, max: 7 },
  }, { _id: false, strict: "throw" }), immutable: true },
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
  profileMediaShadowAnalysis: { type: profileMediaShadowAnalysisSchema, required: false, default: undefined, immutable: true },
  gatedPolicyAnalysis: { type: gatedPolicyAnalysisSchema, required: false, default: undefined, immutable: true },
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
