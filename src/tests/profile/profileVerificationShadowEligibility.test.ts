import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateProfileVerificationShadowEligibility,
  PROFILE_VERIFICATION_SHADOW_ELIGIBILITY_CONTRACT_VERSION,
  ProfileVerificationShadowEligibilityInput,
} from "../../services/profile/profileVerificationShadowEligibility.service";

const authority = (target: "USER_PROFILE" | "CREATOR_APPLICATION" = "USER_PROFILE") => ({
  target,
  targetId: target === "USER_PROFILE" ? "profile-1" : "application-1",
  ownerUserId: "user-1",
  verificationRequestId: target === "USER_PROFILE" ? "request-user-1" : "request-creator-1",
  verificationRevision: 3,
  submittedMediaFingerprint: "a".repeat(64),
});

const validInput = (target: "USER_PROFILE" | "CREATOR_APPLICATION" = "USER_PROFILE"): ProfileVerificationShadowEligibilityInput => {
  const requestAuthority = authority(target);
  return {
    authority: requestAuthority,
    currentAuthority: { ...requestAuthority },
    verificationPolicy: { key: "GATED_MULTI_MEDIA", version: "V2" },
    inference: {
      completed: true,
      authority: { ...requestAuthority },
      captures: [0, 1, 2, 3, 4].map((challengeIndex) => ({ challengeIndex, faceCount: "ONE" as const, usability: "USABLE" as const, embeddingAvailable: true })),
      crossCapture: { status: "CONSISTENT", usableCaptureCount: 5, outlierCaptureCount: 0, comparisonAvailable: true },
      avatar: { status: "MATCH_SUPPORTED", comparisonAvailable: true },
      numericFindings: [0, 0.2, 1],
    },
  };
};

test("shadow eligibility builds a versioned, non-authoritative conservative contract", () => {
  const input = validInput();
  const before = JSON.stringify(input);
  const evaluated = evaluateProfileVerificationShadowEligibility(input);
  assert.equal(evaluated.contractVersion, PROFILE_VERIFICATION_SHADOW_ELIGIBILITY_CONTRACT_VERSION);
  assert.equal(evaluated.category, "ADMIN_REVIEW_REQUIRED");
  assert.deepEqual(evaluated.reasonCodes, ["POLICY_NOT_APPROVED"]);
  assert.equal(evaluated.authoritative, false);
  assert.equal(JSON.stringify(input), before);
});

test("shadow eligibility isolates User and Creator authorities", () => {
  const user = validInput("USER_PROFILE");
  const creator = validInput("CREATOR_APPLICATION");
  assert.equal(evaluateProfileVerificationShadowEligibility(user).target, "USER_PROFILE");
  assert.equal(evaluateProfileVerificationShadowEligibility(creator).target, "CREATOR_APPLICATION");
  creator.inference!.authority.targetId = "profile-1";
  assert.deepEqual(evaluateProfileVerificationShadowEligibility(creator).reasonCodes, ["INFERENCE_AUTHORITY_MISMATCH"]);
});

test("shadow eligibility fails closed for incomplete inference, missing evidence, and unavailable comparisons", () => {
  const incomplete = validInput(); incomplete.inference!.completed = false;
  assert.deepEqual(evaluateProfileVerificationShadowEligibility(incomplete).reasonCodes, ["INFERENCE_NOT_COMPLETED"]);
  const missingCapture = validInput(); missingCapture.inference!.captures = missingCapture.inference!.captures.slice(0, 4);
  assert.deepEqual(evaluateProfileVerificationShadowEligibility(missingCapture).reasonCodes, ["EVIDENCE_INCOMPLETE"]);
  const noDetection = validInput(); noDetection.inference!.captures[0].faceCount = "NOT_RUN";
  assert.deepEqual(evaluateProfileVerificationShadowEligibility(noDetection).reasonCodes, ["CAPTURE_DETECTION_UNAVAILABLE"]);
  const noEmbedding = validInput(); noEmbedding.inference!.captures[0].embeddingAvailable = false;
  assert.deepEqual(evaluateProfileVerificationShadowEligibility(noEmbedding).reasonCodes, ["EMBEDDING_UNAVAILABLE"]);
  const noCrossCapture = validInput(); noCrossCapture.inference!.crossCapture.status = "NOT_RUN";
  assert.deepEqual(evaluateProfileVerificationShadowEligibility(noCrossCapture).reasonCodes, ["CROSS_CAPTURE_NOT_AVAILABLE"]);
  const noAvatar = validInput(); noAvatar.inference!.avatar.status = "NOT_RUN";
  assert.deepEqual(evaluateProfileVerificationShadowEligibility(noAvatar).reasonCodes, ["AVATAR_COMPARISON_NOT_AVAILABLE"]);
});

test("shadow eligibility routes uncertain findings and unsupported policy to Admin review", () => {
  const uncertain = validInput(); uncertain.inference!.crossCapture.status = "UNCERTAIN";
  assert.equal(evaluateProfileVerificationShadowEligibility(uncertain).category, "ADMIN_REVIEW_REQUIRED");
  assert.deepEqual(evaluateProfileVerificationShadowEligibility(uncertain).reasonCodes, ["TECHNICAL_OR_UNCERTAIN"]);
  const unsupported = validInput(); unsupported.verificationPolicy = { key: "GATED_MULTI_MEDIA", version: "V999" };
  assert.deepEqual(evaluateProfileVerificationShadowEligibility(unsupported).reasonCodes, ["POLICY_UNSUPPORTED"]);
  const missing = validInput(); missing.verificationPolicy = undefined;
  assert.deepEqual(evaluateProfileVerificationShadowEligibility(missing).reasonCodes, ["POLICY_MISSING"]);
});

test("shadow eligibility rejects nonfinite findings and stale request or media authority", () => {
  const nonfinite = validInput(); nonfinite.inference!.numericFindings = [Number.NaN];
  assert.deepEqual(evaluateProfileVerificationShadowEligibility(nonfinite).reasonCodes, ["INVALID_NUMERIC_FINDING"]);
  const staleRequest = validInput(); staleRequest.currentAuthority.verificationRevision += 1;
  assert.deepEqual(evaluateProfileVerificationShadowEligibility(staleRequest).reasonCodes, ["EVIDENCE_AUTHORITY_STALE"]);
  const staleMedia = validInput(); staleMedia.currentAuthority.submittedMediaFingerprint = "b".repeat(64);
  assert.deepEqual(evaluateProfileVerificationShadowEligibility(staleMedia).reasonCodes, ["MEDIA_AUTHORITY_STALE"]);
  const staleInferenceMedia = validInput(); staleInferenceMedia.inference!.authority.submittedMediaFingerprint = "c".repeat(64);
  assert.deepEqual(evaluateProfileVerificationShadowEligibility(staleInferenceMedia).reasonCodes, ["MEDIA_AUTHORITY_STALE"]);
});

test("shadow eligibility is deterministic for duplicate evaluation and never mutates application authority", () => {
  const input = validInput("CREATOR_APPLICATION");
  Object.freeze(input.inference!.captures);
  Object.freeze(input.inference!);
  Object.freeze(input.currentAuthority);
  Object.freeze(input.authority);
  Object.freeze(input);
  const first = evaluateProfileVerificationShadowEligibility(input);
  const second = evaluateProfileVerificationShadowEligibility(input);
  assert.deepEqual(second, first);
  assert.equal(first.category, "ADMIN_REVIEW_REQUIRED");
  assert.equal(first.authoritative, false);
});
