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
  captures: readonly ProfileVerificationInferenceCaptureInput[];
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
}
