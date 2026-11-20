import {
  ProfileVerificationAvatarFinding,
  ProfileVerificationCaptureUsabilityFinding,
  ProfileVerificationCrossCaptureFinding,
  ProfileVerificationFaceCountFinding,
} from "../../enums/profileVerificationInference.enums";
import { ProfileVerificationPolicy } from "../../models/profileVerificationRequest.model";

/**
 * V1 is a pure, non-persistent, non-authoritative classification contract.
 * It deliberately has no approved automatic matching policy, so it never
 * emits POTENTIALLY_ELIGIBLE. A later, explicitly approved contract version
 * may add that authority only with its own policy and validation evidence.
 */
export const PROFILE_VERIFICATION_SHADOW_ELIGIBILITY_CONTRACT_VERSION = "STHN_SHADOW_VERIFICATION_ELIGIBILITY_V1" as const;

export type ProfileVerificationShadowEligibilityTarget = "USER_PROFILE" | "CREATOR_APPLICATION";
export type ProfileVerificationShadowEligibilityCategory = "POTENTIALLY_ELIGIBLE" | "ADMIN_REVIEW_REQUIRED" | "NOT_EVALUABLE";
export type ProfileVerificationShadowEligibilityReasonCode =
  | "REQUEST_TARGET_INVALID"
  | "INFERENCE_AUTHORITY_MISMATCH"
  | "EVIDENCE_AUTHORITY_STALE"
  | "MEDIA_AUTHORITY_STALE"
  | "INFERENCE_NOT_COMPLETED"
  | "EVIDENCE_INCOMPLETE"
  | "CAPTURE_DETECTION_UNAVAILABLE"
  | "EMBEDDING_UNAVAILABLE"
  | "CROSS_CAPTURE_NOT_AVAILABLE"
  | "AVATAR_COMPARISON_NOT_AVAILABLE"
  | "TECHNICAL_OR_UNCERTAIN"
  | "INVALID_NUMERIC_FINDING"
  | "POLICY_MISSING"
  | "POLICY_UNSUPPORTED"
  | "POLICY_NOT_APPROVED";

export interface ProfileVerificationShadowEligibilityAuthority {
  target: ProfileVerificationShadowEligibilityTarget;
  targetId: string;
  ownerUserId: string;
  verificationRequestId: string;
  verificationRevision: number;
  submittedMediaFingerprint: string;
}

export interface ProfileVerificationShadowEligibilityCapture {
  challengeIndex: number;
  faceCount: ProfileVerificationFaceCountFinding;
  usability: ProfileVerificationCaptureUsabilityFinding;
  embeddingAvailable: boolean;
}

export interface ProfileVerificationShadowEligibilityInference {
  completed: boolean;
  authority: ProfileVerificationShadowEligibilityAuthority;
  captures: readonly ProfileVerificationShadowEligibilityCapture[];
  crossCapture: { status: ProfileVerificationCrossCaptureFinding; usableCaptureCount: number; outlierCaptureCount: number; comparisonAvailable: boolean };
  avatar: { status: ProfileVerificationAvatarFinding; comparisonAvailable: boolean };
  /** Existing advisory score fields, if present, must remain finite. */
  numericFindings?: readonly (number | undefined)[];
}

export interface ProfileVerificationShadowEligibilityInput {
  authority: ProfileVerificationShadowEligibilityAuthority;
  /** Current server-authoritative request/revision/media binding re-read by the caller. */
  currentAuthority: ProfileVerificationShadowEligibilityAuthority;
  /** Absent means the historical request has no immutable policy snapshot. */
  verificationPolicy?: ProfileVerificationPolicy;
  inference?: ProfileVerificationShadowEligibilityInference;
}

export interface ProfileVerificationShadowEligibilityResult {
  contractVersion: typeof PROFILE_VERIFICATION_SHADOW_ELIGIBILITY_CONTRACT_VERSION;
  target: ProfileVerificationShadowEligibilityTarget;
  verificationRequestId: string;
  verificationRevision: number;
  category: ProfileVerificationShadowEligibilityCategory;
  reasonCodes: readonly ProfileVerificationShadowEligibilityReasonCode[];
  authoritative: false;
}

const validText = (value: string) => typeof value === "string" && value.trim().length > 0;
const validRevision = (value: number) => Number.isInteger(value) && value >= 1;
const sameAuthority = (left: ProfileVerificationShadowEligibilityAuthority, right: ProfileVerificationShadowEligibilityAuthority) => (
  left.target === right.target
  && left.targetId === right.targetId
  && left.ownerUserId === right.ownerUserId
  && left.verificationRequestId === right.verificationRequestId
  && left.verificationRevision === right.verificationRevision
);
const validAuthority = (authority: ProfileVerificationShadowEligibilityAuthority) => (
  (authority.target === "USER_PROFILE" || authority.target === "CREATOR_APPLICATION")
  && validText(authority.targetId)
  && validText(authority.ownerUserId)
  && validText(authority.verificationRequestId)
  && validRevision(authority.verificationRevision)
  && validText(authority.submittedMediaFingerprint)
);

const result = (
  authority: ProfileVerificationShadowEligibilityAuthority,
  category: ProfileVerificationShadowEligibilityCategory,
  ...reasonCodes: ProfileVerificationShadowEligibilityReasonCode[]
): ProfileVerificationShadowEligibilityResult => ({
  contractVersion: PROFILE_VERIFICATION_SHADOW_ELIGIBILITY_CONTRACT_VERSION,
  target: authority.target,
  verificationRequestId: authority.verificationRequestId,
  verificationRevision: authority.verificationRevision,
  category,
  reasonCodes,
  authoritative: false,
});

/**
 * Classifies an already-read verification attempt. This function does not read
 * storage, persist results, schedule work, or call any decision transaction.
 */
export const evaluateProfileVerificationShadowEligibility = (
  input: ProfileVerificationShadowEligibilityInput,
): ProfileVerificationShadowEligibilityResult => {
  const authority = input.authority;
  if (!validAuthority(authority) || !validAuthority(input.currentAuthority)) {
    return result(authority, "NOT_EVALUABLE", "REQUEST_TARGET_INVALID");
  }
  if (!sameAuthority(authority, input.currentAuthority)) {
    return result(authority, "NOT_EVALUABLE", "EVIDENCE_AUTHORITY_STALE");
  }
  if (authority.submittedMediaFingerprint !== input.currentAuthority.submittedMediaFingerprint) {
    return result(authority, "NOT_EVALUABLE", "MEDIA_AUTHORITY_STALE");
  }

  const inference = input.inference;
  if (!inference?.completed) return result(authority, "NOT_EVALUABLE", "INFERENCE_NOT_COMPLETED");
  if (!validAuthority(inference.authority) || !sameAuthority(authority, inference.authority)) {
    return result(authority, "NOT_EVALUABLE", "INFERENCE_AUTHORITY_MISMATCH");
  }
  if (inference.authority.submittedMediaFingerprint !== authority.submittedMediaFingerprint) {
    return result(authority, "NOT_EVALUABLE", "MEDIA_AUTHORITY_STALE");
  }
  if (!inference.captures || inference.captures.length !== 5
    || new Set(inference.captures.map((capture) => capture.challengeIndex)).size !== 5
    || inference.captures.some((capture) => !Number.isInteger(capture.challengeIndex) || capture.challengeIndex < 0 || capture.challengeIndex > 4)) {
    return result(authority, "NOT_EVALUABLE", "EVIDENCE_INCOMPLETE");
  }
  if (inference.captures.some((capture) => capture.faceCount === "NOT_RUN" || capture.usability === "NOT_RUN")) {
    return result(authority, "NOT_EVALUABLE", "CAPTURE_DETECTION_UNAVAILABLE");
  }
  if (inference.captures.some((capture) => capture.faceCount !== "ONE" || capture.usability !== "USABLE")) {
    return result(authority, "ADMIN_REVIEW_REQUIRED", "TECHNICAL_OR_UNCERTAIN");
  }
  if (inference.captures.some((capture) => !capture.embeddingAvailable)) {
    return result(authority, "NOT_EVALUABLE", "EMBEDDING_UNAVAILABLE");
  }
  if (!inference.crossCapture.comparisonAvailable || inference.crossCapture.status === "NOT_RUN") {
    return result(authority, "NOT_EVALUABLE", "CROSS_CAPTURE_NOT_AVAILABLE");
  }
  if (inference.crossCapture.status !== "CONSISTENT") {
    return result(authority, "ADMIN_REVIEW_REQUIRED", "TECHNICAL_OR_UNCERTAIN");
  }
  if (!inference.avatar.comparisonAvailable || inference.avatar.status === "NOT_RUN") {
    return result(authority, "NOT_EVALUABLE", "AVATAR_COMPARISON_NOT_AVAILABLE");
  }
  if (inference.avatar.status !== "MATCH_SUPPORTED") {
    return result(authority, "ADMIN_REVIEW_REQUIRED", "TECHNICAL_OR_UNCERTAIN");
  }
  if (!Number.isInteger(inference.crossCapture.usableCaptureCount) || inference.crossCapture.usableCaptureCount !== 5
    || !Number.isInteger(inference.crossCapture.outlierCaptureCount) || inference.crossCapture.outlierCaptureCount < 0
    || inference.numericFindings?.some((value) => value !== undefined && !Number.isFinite(value))) {
    return result(authority, "NOT_EVALUABLE", "INVALID_NUMERIC_FINDING");
  }
  if (!input.verificationPolicy) return result(authority, "ADMIN_REVIEW_REQUIRED", "POLICY_MISSING");
  if (input.verificationPolicy.key !== "LEGACY_AVATAR_ONLY" && input.verificationPolicy.key !== "GATED_MULTI_MEDIA") {
    return result(authority, "ADMIN_REVIEW_REQUIRED", "POLICY_UNSUPPORTED");
  }
  if ((input.verificationPolicy.key === "LEGACY_AVATAR_ONLY" && input.verificationPolicy.version !== "V1")
    || (input.verificationPolicy.key === "GATED_MULTI_MEDIA" && !["V1", "V2"].includes(input.verificationPolicy.version))) {
    return result(authority, "ADMIN_REVIEW_REQUIRED", "POLICY_UNSUPPORTED");
  }
  return result(authority, "ADMIN_REVIEW_REQUIRED", "POLICY_NOT_APPROVED");
};
