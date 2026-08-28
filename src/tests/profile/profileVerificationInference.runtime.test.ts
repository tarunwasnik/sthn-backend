import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";
import { ProfileVerificationRequest } from "../../models/profileVerificationRequest.model";
import { ProfileVerificationInferenceResult } from "../../models/profileVerificationInferenceResult.model";
import { FaceVerificationSession } from "../../models/faceVerificationSession.model";
import { FaceVerificationEvidence } from "../../models/faceVerificationEvidence.model";
import { FaceVerificationChallenge } from "../../models/faceVerificationSession.model";
import { ensureActiveProfileVerificationRequest } from "../../services/profile/profileVerificationRequest.service";
import { finalizeProfileVerificationInference } from "../../services/profile/profileVerificationInference.service";
import { ProfileVerificationInferenceAdapter } from "../../services/profile/profileVerificationInferenceAdapter";
import { ProfileVerificationInferenceFindings } from "../../services/profile/profileVerificationInference.types";
import { ProfileVerificationInferenceError } from "../../errors/profile/ProfileVerificationInferenceError";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";

const testManifest = (pipelineVersion = "TEST_SYNTHETIC_CONTRACT_V1") => ({
  kind: "TEST_SYNTHETIC" as const,
  pipelineVersion,
  runtimeIdentifier: "STHN_TEST_ADAPTER_ONLY",
  runtimeVersion: "1",
});

const testChallenges: FaceVerificationChallenge[] = ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "BLINK"];

const findingsFor = (): ProfileVerificationInferenceFindings => ({
  captures: [0, 1, 2, 3, 4].map((challengeIndex) => ({
    challengeIndex,
    challenge: testChallenges[challengeIndex],
    faceCount: "NOT_RUN" as const,
    usability: "NOT_RUN" as const,
    reasonCodes: [],
  })),
  crossCapture: { status: "NOT_RUN", usableCaptureCount: 0, outlierCaptureCount: 0 },
  avatar: { status: "NOT_RUN" },
  antiSpoof: { status: "NOT_RUN" },
});

class TestSyntheticAdapter implements ProfileVerificationInferenceAdapter {
  readonly pipelineManifest;
  constructor(pipelineVersion?: string, private readonly output: ProfileVerificationInferenceFindings = findingsFor()) {
    this.pipelineManifest = testManifest(pipelineVersion);
  }
  async infer() { return this.output; }
}

const makeCompleteInput = async (suffix: string) => {
  const user = await User.create({ email: `inference-${suffix}@test.local`, password: "test-password", status: "active", governanceState: "ACTIVE" });
  const profile = await UserProfile.create({
    userId: user._id, username: `inference-${suffix}`, dateOfBirth: new Date("1990-01-01"), interests: [], bio: "Inference test profile.",
    avatar: "https://example.test/avatar.jpg", cover: "https://example.test/cover.jpg", profilePhotos: ["https://example.test/one.jpg", "https://example.test/two.jpg"],
    profileStatus: "pending_verification", verificationSubmittedAt: new Date(), verificationSubmissionVersion: 1,
  });
  const { request } = await ensureActiveProfileVerificationRequest(profile);
  const challenges = [...testChallenges];
  const session = await FaceVerificationSession.create({
    sessionReference: `FACE_SESSION_INFERENCE_${suffix}`, userId: user._id, profileId: profile._id, verificationRequestId: request._id,
    profileSubmissionVersion: 1, avatarFingerprint: "a".repeat(64), status: "CAPTURE_COMPLETE", isCurrent: true, challenges,
    requiredCaptureCount: 5, acceptedCaptureCount: 5, startedAt: new Date(), expiresAt: new Date(Date.now() + 60_000), captureCompletedAt: new Date(),
  });
  await FaceVerificationEvidence.insertMany(challenges.map((challenge, challengeIndex) => ({
    evidenceReference: `FACE_EVIDENCE_INFERENCE_${suffix}_${challengeIndex}`, sessionId: session._id, userId: user._id, profileId: profile._id,
    verificationRequestId: request._id, challengeIndex, challenge, cloudinaryPublicId: `opaque-${suffix}-${challengeIndex}`,
    cloudinaryResourceType: "image", status: "STORED", mimeType: "image/jpeg", bytes: 1000, format: "jpg", captureReceivedAt: new Date(),
  })));
  return { user, profile, request, session };
};

const rejectsWith = async (operation: () => Promise<unknown>, code: string) => {
  await assert.rejects(operation, (error: unknown) => error instanceof ProfileVerificationInferenceError && error.code === code);
};

before(async () => {
  await connectPhase7HDatabase();
  await ProfileVerificationInferenceResult.init();
}, { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

test("a bound completed session with exactly five stored captures persists a bounded immutable result", async () => {
  const { request } = await makeCompleteInput("valid");
  const outcome = await finalizeProfileVerificationInference({ verificationRequestId: String(request._id), adapter: new TestSyntheticAdapter() });
  assert.ok(outcome.result);
  assert.equal(outcome.replayed, false);
  assert.equal(outcome.result.findings.captures.length, 5);
  assert.equal(outcome.result.findings.antiSpoof.status, "NOT_RUN");
  assert.equal(outcome.result.shadowIdentityAnalysis, undefined);
  assert.match(outcome.result.evidenceSetFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(outcome.result.toObject()).match(/cloudinary|base64|embedding|landmark|https?:\/\//i), null);

  outcome.result.findings.avatar.status = "MATCH_UNCERTAIN";
  await assert.rejects(() => outcome.result!.save());
  await assert.rejects(() => ProfileVerificationInferenceResult.updateOne({ _id: outcome.result!._id }, { $set: { "findings.avatar.status": "MATCH_UNCERTAIN" } }));
  const persisted = await ProfileVerificationInferenceResult.findById(outcome.result._id);
  assert.equal(persisted?.findings.avatar.status, "NOT_RUN");
  assert.equal(persisted?.shadowIdentityAnalysis, undefined);
});

test("shadow identity analysis is optional, but validates its bounded contract when supplied", async () => {
  const { request } = await makeCompleteInput("shadow-optional");
  const outcome = await finalizeProfileVerificationInference({ verificationRequestId: String(request._id), adapter: new TestSyntheticAdapter() });
  assert.ok(outcome.result);

  const source = outcome.result.toObject();
  const validShadowResult = new ProfileVerificationInferenceResult({
    ...source,
    inferenceReference: "PROFILE_INFERENCE_SHADOW_OPTIONAL_VALID",
    inferenceRunFingerprint: "b".repeat(64),
    shadowIdentityAnalysis: {
      status: "COMPLETED",
      conclusion: "LIKELY_MATCH",
      similarity: 0.94,
      threshold: 0.9,
      model: { identifier: "TEST_SHADOW_MODEL", version: "1" },
      processedAt: new Date(),
    },
  });
  await validShadowResult.validate();

  const malformedShadowResult = new ProfileVerificationInferenceResult({
    ...source,
    inferenceReference: "PROFILE_INFERENCE_SHADOW_OPTIONAL_INVALID",
    inferenceRunFingerprint: "c".repeat(64),
    shadowIdentityAnalysis: { conclusion: "LIKELY_MATCH" },
  });
  await assert.rejects(() => malformedShadowResult.validate(), /shadowIdentityAnalysis\.status/);
});

test("a real adapter output persists only bounded shadow identity analysis fields", async () => {
  const { request } = await makeCompleteInput("shadow-output");
  const adapter: ProfileVerificationInferenceAdapter = {
    pipelineManifest: testManifest("SFACE_SHADOW_CONTRACT_V1"),
    async infer() {
      return {
        findings: findingsFor(),
        shadowIdentityAnalysis: {
          status: "COMPLETED",
          conclusion: "UNABLE_TO_DETERMINE",
          similarity: 0.87,
          model: { identifier: "OPENCV_ZOO_SFACE", version: "face_recognition_sface_2021dec" },
          processedAt: new Date(),
          reasonCode: "THRESHOLD_NOT_CONFIGURED",
          reason: "No configured threshold is available for this shadow analysis.",
        },
      };
    },
  };
  const outcome = await finalizeProfileVerificationInference({ verificationRequestId: String(request._id), adapter });
  assert.equal(outcome.result?.shadowIdentityAnalysis?.conclusion, "UNABLE_TO_DETERMINE");
  assert.equal(outcome.result?.shadowIdentityAnalysis?.similarity, 0.87);
  assert.equal(JSON.stringify(outcome.result?.shadowIdentityAnalysis).match(/embedding|tensor|landmark|pixel|path/i), null);
});

test("incomplete, unbound, or inconsistent evidence cannot finalize an inference result", async () => {
  const partial = await makeCompleteInput("partial");
  await FaceVerificationEvidence.deleteOne({ sessionId: partial.session._id, challengeIndex: 4 });
  await rejectsWith(() => finalizeProfileVerificationInference({ verificationRequestId: String(partial.request._id), adapter: new TestSyntheticAdapter() }), "EVIDENCE_INCOMPLETE");

  const unbound = await makeCompleteInput("unbound");
  await FaceVerificationSession.updateOne({ _id: unbound.session._id }, { $unset: { verificationRequestId: 1 } });
  await rejectsWith(() => finalizeProfileVerificationInference({ verificationRequestId: String(unbound.request._id), adapter: new TestSyntheticAdapter() }), "SESSION_NOT_COMPLETE");

  const wrongOwner = await makeCompleteInput("wrong-owner");
  await FaceVerificationEvidence.updateOne({ sessionId: wrongOwner.session._id, challengeIndex: 0 }, { $set: { profileId: wrongOwner.user._id } });
  await rejectsWith(() => finalizeProfileVerificationInference({ verificationRequestId: String(wrongOwner.request._id), adapter: new TestSyntheticAdapter() }), "EVIDENCE_INCOMPLETE");
});

test("identical inference runs replay safely, concurrent callers preserve one result, and changed pipeline identity creates a new result", async () => {
  const { request } = await makeCompleteInput("replay");
  const adapter = new TestSyntheticAdapter();
  const [first, second] = await Promise.all([
    finalizeProfileVerificationInference({ verificationRequestId: String(request._id), adapter }),
    finalizeProfileVerificationInference({ verificationRequestId: String(request._id), adapter }),
  ]);
  assert.ok(first.result && second.result);
  assert.equal(String(first.result._id), String(second.result._id));
  assert.equal(await ProfileVerificationInferenceResult.countDocuments({ verificationRequestId: request._id }), 1);

  const newerPipeline = await finalizeProfileVerificationInference({ verificationRequestId: String(request._id), adapter: new TestSyntheticAdapter("TEST_SYNTHETIC_CONTRACT_V2") });
  assert.ok(newerPipeline.result);
  assert.notEqual(String(newerPipeline.result._id), String(first.result._id));
  assert.equal(await ProfileVerificationInferenceResult.countDocuments({ verificationRequestId: request._id }), 2);
});

test("invalid manifests and arbitrary/invalid findings are rejected before persistence", async () => {
  const { request } = await makeCompleteInput("validation");
  const invalidManifest = new TestSyntheticAdapter();
  (invalidManifest.pipelineManifest as { pipelineVersion: string }).pipelineVersion = "";
  await rejectsWith(() => finalizeProfileVerificationInference({ verificationRequestId: String(request._id), adapter: invalidManifest }), "PIPELINE_IDENTITY_INVALID");

  const invalidFindings = findingsFor() as ProfileVerificationInferenceFindings & { arbitraryBlob?: { bytes: string } };
  invalidFindings.captures = invalidFindings.captures.slice(0, 4);
  invalidFindings.arbitraryBlob = { bytes: "not-persisted" };
  await rejectsWith(() => finalizeProfileVerificationInference({ verificationRequestId: String(request._id), adapter: new TestSyntheticAdapter(undefined, invalidFindings) }), "FINDINGS_INVALID");
  assert.equal(await ProfileVerificationInferenceResult.countDocuments({ verificationRequestId: request._id }), 0);
});

test("terminal requests are bounded no-ops and technical adapter failures produce no result", async () => {
  const terminal = await makeCompleteInput("terminal");
  await ProfileVerificationRequest.updateOne({ _id: terminal.request._id }, { $set: { status: "APPROVED", isActive: false, decision: "APPROVE", decidedAt: new Date() } });
  const noOp = await finalizeProfileVerificationInference({ verificationRequestId: String(terminal.request._id), adapter: new TestSyntheticAdapter() });
  assert.equal(noOp.noOp, "TERMINAL_REQUEST");
  assert.equal(noOp.result, null);
  assert.equal(await ProfileVerificationInferenceResult.countDocuments({ verificationRequestId: terminal.request._id }), 0);

  const technical = await makeCompleteInput("technical");
  const unavailable: ProfileVerificationInferenceAdapter = {
    pipelineManifest: testManifest(),
    async infer() { throw new ProfileVerificationInferenceError("Synthetic adapter outage", "TECHNICAL_FAILURE", 503); },
  };
  await rejectsWith(() => finalizeProfileVerificationInference({ verificationRequestId: String(technical.request._id), adapter: unavailable }), "TECHNICAL_FAILURE");
  assert.equal(await ProfileVerificationInferenceResult.countDocuments({ verificationRequestId: technical.request._id }), 0);
});
