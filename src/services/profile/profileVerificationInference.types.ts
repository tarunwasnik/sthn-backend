import {
  ProfileVerificationAntiSpoofFinding,
  ProfileVerificationAvatarFinding,
  ProfileVerificationCaptureReasonCode,
  ProfileVerificationCaptureUsabilityFinding,
  ProfileVerificationCrossCaptureFinding,
  ProfileVerificationFaceCountFinding,
  ProfileVerificationInferencePipelineKind,
} from "../../enums/profileVerificationInference.enums";
import { FaceVerificationChallenge } from "../../models/faceVerificationSession.model";
import { ProfileVerificationPolicy, ProfileVerificationSubmittedMediaSnapshot } from "../../models/profileVerificationRequest.model";
import { ProfileVerificationGate1LiveAnchorResult } from "./profileVerificationGate1LiveAnchorPolicy.service";

export interface ProfileVerificationShadowIdentityAnalysis {
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  conclusion?: "LIKELY_MATCH" | "LIKELY_MISMATCH" | "UNABLE_TO_DETERMINE";
  similarity?: number;
  threshold?: number;
  model?: { identifier: string; version: string };
  processedAt?: Date;
  reasonCode?: string;
  reason?: string;
}

export interface ProfileVerificationInferencePipelineComponent {
  identifier: string;
  version: string;
  artifactSha256: string;
}

export interface ProfileVerificationInferencePipelineManifest {
  kind: ProfileVerificationInferencePipelineKind;
  pipelineVersion: string;
  runtimeIdentifier: string;
  runtimeVersion: string;
  preprocessingVersion?: string;
  detector?: ProfileVerificationInferencePipelineComponent;
  embedding?: ProfileVerificationInferencePipelineComponent;
}

export interface ProfileVerificationInferenceCaptureInput {
  challengeIndex: number;
  challenge: FaceVerificationChallenge;
  evidenceReference: string;
}

export interface ProfileVerificationInferenceInputDescriptor {
  verificationRequestId: string;
  profileId: string;
  userId: string;
  profileSubmissionVersion: number;
  faceVerificationSessionId: string;
  avatarFingerprint: string;
  evidenceSetFingerprint: string;
  pipelineManifest: ProfileVerificationInferencePipelineManifest;
  verificationPolicy: ProfileVerificationPolicy;
  captures: readonly ProfileVerificationInferenceCaptureInput[];
  submittedMedia?: ProfileVerificationSubmittedMediaSnapshot;
}

export interface ProfileVerificationGatedPolicyAnalysis {
  policy: ProfileVerificationPolicy;
  gate1: ProfileVerificationGate1LiveAnchorResult;
  gate2?: { outcome: "READY_FOR_GATE3" | "AVATAR_INVALID" | "MEDIA_SNAPSHOT_UNAVAILABLE" | "LIVE_EVIDENCE_UNAVAILABLE"; avatarAdmission?: string; optionalMediaSummary: { noFaceValidCount: number; usableFaceEvidenceCount: number; unusableEvidenceCount: number; mediaReadFailedCount: number } };
  gate3?: { conclusion: "LIKELY_MATCH" | "LIKELY_MISMATCH" | "UNABLE_TO_DETERMINE"; reasonCode?: string; avatarMembership: "PERSON_A_SUPPORTED" | "PERSON_A_NOT_ESTABLISHED" | "TECHNICAL_UNAVAILABLE"; avatarMedianSimilarity?: number; membershipThreshold: number; multiFaceMinMargin: number; optionalPersonASupportCount: number; optionalAmbiguousMediaCount: number; optionalTechnicalFailureCount: number };
}

export interface ProfileVerificationProfileMediaShadowAnalysis {
  status: "COMPLETED";
  processedAt: Date;
  reasonCode?: "MEDIA_SNAPSHOT_UNAVAILABLE" | "INSUFFICIENT_USABLE_LIVE_CAPTURES";
  model: { identifier: string; version: string };
  summary: { submittedMediaCount: number; processedMediaCount: number; mediaWithNoFaceCount: number; mediaWithUsableFacesCount: number; multiFaceMediaCount: number; failedMediaCount: number };
  live: { usableCaptureCount: number; pairwiseComparisonCount: number; minimumSimilarity?: number; maximumSimilarity?: number; meanSimilarity?: number; medianSimilarity?: number };
  media: Array<{ role: "AVATAR" | "COVER" | "PROFILE_PHOTO"; profilePhotoIndex?: number; status: "NO_FACE" | "NO_USABLE_FACE" | "FACE_CANDIDATES_AVAILABLE" | "MEDIA_READ_FAILED"; detectedFaceCount: number; usableFaceCount: number; candidateCount: number; bestCandidate?: { candidateIndex: number; comparisonCount: number; minimumSimilarity: number; maximumSimilarity: number; meanSimilarity: number; medianSimilarity: number }; secondBestMedianSimilarity?: number; bestVsSecondMargin?: number }>;
}

export interface ProfileVerificationPerCaptureFinding {
  challengeIndex: number;
  challenge: FaceVerificationChallenge;
  faceCount: ProfileVerificationFaceCountFinding;
  usability: ProfileVerificationCaptureUsabilityFinding;
  reasonCodes: readonly ProfileVerificationCaptureReasonCode[];
}

export interface ProfileVerificationInferenceFindings {
  captures: readonly ProfileVerificationPerCaptureFinding[];
  crossCapture: {
    status: ProfileVerificationCrossCaptureFinding;
    usableCaptureCount: number;
    outlierCaptureCount: number;
  };
  avatar: { status: ProfileVerificationAvatarFinding };
  antiSpoof: { status: ProfileVerificationAntiSpoofFinding };
}

export interface ProfileVerificationInferenceOutput {
  findings: ProfileVerificationInferenceFindings;
  shadowIdentityAnalysis?: ProfileVerificationShadowIdentityAnalysis;
  profileMediaShadowAnalysis?: ProfileVerificationProfileMediaShadowAnalysis;
  gatedPolicyAnalysis?: ProfileVerificationGatedPolicyAnalysis;
}
