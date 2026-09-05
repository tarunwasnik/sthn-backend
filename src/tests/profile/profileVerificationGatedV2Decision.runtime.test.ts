import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import { Types } from "mongoose";

import User from "../../models/User";
import { ProfileVerificationInferenceResult } from "../../models/profileVerificationInferenceResult.model";
import { ProfileVerificationRequest } from "../../models/profileVerificationRequest.model";
import { UserProfile } from "../../models/userProfile.model";
import { applyProfileVerificationAiDecision, mapGatedV2AutomatedDecision } from "../../services/profile/profileVerificationAiDecision.service";
import { SFACE_ARTIFACT } from "../../services/profile/profileVerificationFaceEmbeddingAdapter";
import { ensureActiveProfileVerificationRequest } from "../../services/profile/profileVerificationRequest.service";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const optionalSummary = { noFaceValidCount: 0, usableFaceEvidenceCount: 7, unusableEvidenceCount: 0, mediaReadFailedCount: 0 };
const gate3 = (conclusion: "LIKELY_MATCH" | "LIKELY_MISMATCH" | "UNABLE_TO_DETERMINE", reasonCode?: string) => ({
  conclusion, ...(reasonCode ? { reasonCode } : {}),
  avatarMembership: conclusion === "LIKELY_MATCH" ? "PERSON_A_SUPPORTED" : conclusion === "UNABLE_TO_DETERMINE" ? "TECHNICAL_UNAVAILABLE" : "PERSON_A_NOT_ESTABLISHED",
  ...(conclusion === "UNABLE_TO_DETERMINE" ? {} : { avatarMedianSimilarity: conclusion === "LIKELY_MATCH" ? 0.4289849647 : 0.25 }),
  membershipThreshold: 0.36, multiFaceMinMargin: 0.04, optionalPersonASupportCount: 0, optionalAmbiguousMediaCount: 0, optionalTechnicalFailureCount: 0,
});
const gated = (version: "V1" | "V2", overrides: Record<string, unknown> = {}) => ({
  policy: { key: "GATED_MULTI_MEDIA", version },
  gate1: { outcome: "PASS", usableCaptureCount: 5, weakestPeerMedian: 0.6128890532, threshold: 0.28, policyVersion: "V1" },
  gate2: { outcome: "READY_FOR_GATE3", avatarAdmission: "VALID_SINGLE_FACE", optionalMediaSummary: optionalSummary },
  gate3: gate3("LIKELY_MATCH"),
  ...overrides,
});
const setup = async (suffix: string, version: "V1" | "V2") => {
  const previous = process.env.STHN_PROFILE_VERIFICATION_POLICY;
  process.env.STHN_PROFILE_VERIFICATION_POLICY = `GATED_MULTI_MEDIA_${version}`;
  try {
    const user = await User.create({ email: `gated-v2-${suffix}@test.local`, password: "test-password", status: "active", governanceState: "ACTIVE" });
    const profile = await UserProfile.create({ userId: user._id, username: `gated-v2-${suffix}`, dateOfBirth: new Date("1990-01-01"), interests: [], bio: "Test.", avatar: "https://example.test/avatar.jpg", cover: "https://example.test/cover.jpg", profilePhotos: Array.from({ length: 6 }, (_, index) => `https://example.test/${index}.jpg`), profileStatus: "pending_verification", verificationSubmittedAt: new Date(), verificationSubmissionVersion: 1 });
    return { user, profile, request: (await ensureActiveProfileVerificationRequest(profile)).request };
  } finally { if (previous === undefined) delete process.env.STHN_PROFILE_VERIFICATION_POLICY; else process.env.STHN_PROFILE_VERIFICATION_POLICY = previous; }
};
const inference = (request: Awaited<ReturnType<typeof setup>>["request"], analysis: ReturnType<typeof gated>) => ProfileVerificationInferenceResult.create({
  inferenceReference: `PROFILE_INFERENCE_V2_${new Types.ObjectId()}`, inferenceRunFingerprint: hash(String(new Types.ObjectId())), verificationRequestId: request._id, profileId: request.profileId, userId: request.userId, profileSubmissionVersion: request.profileSubmissionVersion, faceVerificationSessionId: new Types.ObjectId(), evidenceSetFingerprint: hash(`e-${new Types.ObjectId()}`), pipelineManifestFingerprint: hash(`p-${new Types.ObjectId()}`), pipeline: { kind: "MODEL_RUNTIME", pipelineVersion: "test", runtimeIdentifier: "test", runtimeVersion: "1" },
  findings: { captures: [0, 1, 2, 3, 4].map((challengeIndex) => ({ challengeIndex, challenge: "NEUTRAL", faceCount: "ONE", usability: "USABLE", reasonCodes: [] })), crossCapture: { status: "NOT_RUN", usableCaptureCount: 5, outlierCaptureCount: 0 }, avatar: { status: "MATCH_UNCERTAIN" }, antiSpoof: { status: "NOT_RUN" } },
  profileMediaShadowAnalysis: { status: "COMPLETED", processedAt: new Date(), model: { identifier: SFACE_ARTIFACT.identifier, version: SFACE_ARTIFACT.version }, summary: { submittedMediaCount: 8, processedMediaCount: 8, mediaWithNoFaceCount: 0, mediaWithUsableFacesCount: 8, multiFaceMediaCount: 0, failedMediaCount: 0 }, live: { usableCaptureCount: 5, pairwiseComparisonCount: 10, minimumSimilarity: 0.6, maximumSimilarity: 0.7, meanSimilarity: 0.65, medianSimilarity: 0.65 }, media: [] },
  gatedPolicyAnalysis: analysis as never, retentionDeadline: new Date(Date.now() + 86_400_000),
});

before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

test("Attempt-3-equivalent V2 result uses Gate 3 .36 and canonical AI approval", async () => {
  const { user, profile, request } = await setup("match", "V2");
  const originalLegacyThreshold = process.env.STHN_SFACE_IDENTITY_APPROVAL_THRESHOLD;
  process.env.STHN_SFACE_IDENTITY_APPROVAL_THRESHOLD = "0.99";
  try { await applyProfileVerificationAiDecision({ request, result: await inference(request, gated("V2")) }); }
  finally { if (originalLegacyThreshold === undefined) delete process.env.STHN_SFACE_IDENTITY_APPROVAL_THRESHOLD; else process.env.STHN_SFACE_IDENTITY_APPROVAL_THRESHOLD = originalLegacyThreshold; }
  const stored = await ProfileVerificationRequest.findById(request._id).orFail();
  assert.equal(stored.status, "APPROVED"); assert.equal(stored.decision, "APPROVE"); assert.equal(stored.decisionAuthority, "AI");
  assert.equal(stored.aiDecisionSnapshot?.similarity, 0.4289849647); assert.equal(stored.aiDecisionSnapshot?.threshold, 0.36);
  assert.equal((await UserProfile.findById(profile._id))?.profileStatus, "verified");
  assert.equal((await User.findById(user._id))?.governanceState, "ACTIVE");
});

test("V2 clear Gate 1, Gate 2, and Gate 3 failures are corrective AI rejections", async () => {
  const cases = [
    ["technical", gated("V2", { gate1: { outcome: "LIVE_CAPTURE_TECHNICAL_FAILURE", usableCaptureCount: 4, threshold: 0.28, policyVersion: "V1" }, gate2: undefined, gate3: undefined }), "LIVE_CAPTURE_TECHNICAL_FAILURE"],
    ["coherence", gated("V2", { gate1: { outcome: "LIVE_ANCHOR_INCOHERENT", usableCaptureCount: 5, weakestPeerMedian: 0.2, threshold: 0.28, policyVersion: "V1" }, gate2: undefined, gate3: undefined }), "LIVE_ANCHOR_INCOHERENT"],
    ["avatar", gated("V2", { gate2: { outcome: "AVATAR_INVALID", avatarAdmission: "AVATAR_INVALID_NO_FACE", optionalMediaSummary: optionalSummary }, gate3: undefined }), "MANDATORY_AVATAR_INVALID"],
    ["mismatch", gated("V2", { gate3: gate3("LIKELY_MISMATCH") }), "IDENTITY_MISMATCH"],
  ] as const;
  for (const [suffix, analysis, reasonCode] of cases) {
    const { user, profile, request } = await setup(suffix, "V2");
    await applyProfileVerificationAiDecision({ request, result: await inference(request, analysis) });
    const stored = await ProfileVerificationRequest.findById(request._id).orFail();
    assert.equal(stored.status, "REJECTED"); assert.equal(stored.decisionAuthority, "AI"); assert.equal(stored.decisionReasonCode, reasonCode);
    assert.equal((await UserProfile.findById(profile._id))?.profileStatus, "rejected"); assert.equal((await User.findById(user._id))?.governanceState, "ACTIVE");
  }
});

test("V2 uncertainty, contradictory identity evidence, and required-media read failure route to Admin", async () => {
  const cases = [
    gated("V2", { gate3: gate3("UNABLE_TO_DETERMINE") }),
    gated("V2", { gate3: gate3("UNABLE_TO_DETERMINE", "CONTRADICTORY_IDENTITY_EVIDENCE") }),
    gated("V2", { gate2: { outcome: "AVATAR_INVALID", avatarAdmission: "AVATAR_MEDIA_READ_FAILED", optionalMediaSummary: optionalSummary }, gate3: undefined }),
  ];
  for (const [index, analysis] of cases.entries()) {
    const { profile, request } = await setup(`admin-${index}`, "V2");
    await applyProfileVerificationAiDecision({ request, result: await inference(request, analysis) });
    assert.equal((await ProfileVerificationRequest.findById(request._id))?.status, "ADMIN_REVIEW_REQUIRED");
    assert.equal((await UserProfile.findById(profile._id))?.profileStatus, "pending_verification");
  }
});

test("V1 match and mismatch remain shadow-only Admin review and policy snapshots stay immutable", async () => {
  for (const [suffix, conclusion] of [["match", "LIKELY_MATCH"], ["mismatch", "LIKELY_MISMATCH"]] as const) {
    const { profile, request } = await setup(`v1-${suffix}`, "V1");
    await ProfileVerificationRequest.updateOne({ _id: request._id }, { $set: { "verificationPolicy.version": "V2" } });
    const persisted = await ProfileVerificationRequest.findById(request._id).orFail();
    assert.equal(persisted.verificationPolicy?.version, "V1");
    await applyProfileVerificationAiDecision({ request: persisted, result: await inference(persisted, gated("V1", { gate3: gate3(conclusion) })) });
    assert.equal((await ProfileVerificationRequest.findById(request._id))?.status, "ADMIN_REVIEW_REQUIRED");
    assert.equal((await UserProfile.findById(profile._id))?.profileStatus, "pending_verification");
  }
});

test("pure V2 mapping sends malformed model/config evidence to Admin review", () => {
  const base = { gatedPolicyAnalysis: gated("V2"), profileMediaShadowAnalysis: { model: SFACE_ARTIFACT } } as never;
  assert.equal(mapGatedV2AutomatedDecision(base).type, "APPROVE");
  assert.equal(mapGatedV2AutomatedDecision({ gatedPolicyAnalysis: gated("V2", { gate3: { ...gate3("LIKELY_MATCH"), membershipThreshold: 0.35 } }), profileMediaShadowAnalysis: { model: SFACE_ARTIFACT } } as never).type, "ADMIN_REVIEW");
  assert.equal(mapGatedV2AutomatedDecision({ gatedPolicyAnalysis: gated("V2"), profileMediaShadowAnalysis: { model: { identifier: "OTHER", version: "1" } } } as never).type, "ADMIN_REVIEW");
});
