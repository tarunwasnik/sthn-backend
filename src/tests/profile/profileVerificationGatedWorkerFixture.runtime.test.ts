import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";
import "dotenv/config";

import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";
import { FaceVerificationSession, FaceVerificationChallenge } from "../../models/faceVerificationSession.model";
import { FaceVerificationEvidence } from "../../models/faceVerificationEvidence.model";
import { ProfileVerificationInferenceResult } from "../../models/profileVerificationInferenceResult.model";
import { ProfileVerificationJob } from "../../models/profileVerificationJob.model";
import { ProfileVerificationRequest } from "../../models/profileVerificationRequest.model";
import { ensureActiveProfileVerificationRequest } from "../../services/profile/profileVerificationRequest.service";
import { ensureProfileVerificationJob, processNextProfileVerificationJob } from "../../services/profile/profileVerificationJob.service";
import { createSFaceProfileVerificationAdapter } from "../../services/profile/profileVerificationSFaceAdapter";
import { getAdminProfileVerificationDetail } from "../../services/profile/profileVerificationAdminRead.service";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";
const root = "D:\\STHN-Evaluation\\VGGFace2\\test\\test\\n000775";
const names = ["0003_01.jpg", "0008_01.jpg", "0011_01.jpg", "0014_01.jpg", "0023_01.jpg", "0024_01.jpg", "0025_01.jpg", "0031_01.jpg", "0031_02.jpg", "0032_01.jpg", "0032_04.jpg", "0033_01.jpg", "0034_01.jpg"];
const challenges: FaceVerificationChallenge[] = ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "BLINK"];
const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

/** Test-only explicit map; production code cannot import or select this reader. */
const fixtureReader = (mapping: Map<string, Buffer>) => async (item: { sourceReference: string }) => {
  const bytes = mapping.get(item.sourceReference);
  if (!bytes) throw new Error("Unknown test fixture reference");
  return bytes;
};

const createGatedWorkerFixture = async (suffix: string) => {
  const references = Array.from({ length: 8 }, (_, index) => `fixture://y4ms1/${suffix}/${index}`);
  const user = await User.create({ email: `y4ms1-${suffix}@fixture.test`, password: "test-password", status: "active", governanceState: "ACTIVE" });
  const profile = await UserProfile.create({ userId: user._id, username: `y4ms1-${suffix}`, dateOfBirth: new Date("1990-01-01"), interests: [], bio: "Fixture.", avatar: references[0], cover: references[1], profilePhotos: references.slice(2), profileStatus: "pending_verification", verificationSubmittedAt: new Date(), verificationSubmissionVersion: 1 });
  const request = (await ensureActiveProfileVerificationRequest(profile)).request;
  const session = await FaceVerificationSession.create({ sessionReference: `FACE_SESSION_Y4MS1_${suffix}`, userId: user._id, profileId: profile._id, verificationRequestId: request._id, profileSubmissionVersion: 1, avatarFingerprint: hash(references[0]), status: "CAPTURE_COMPLETE", isCurrent: true, challenges, requiredCaptureCount: 5, acceptedCaptureCount: 5, startedAt: new Date(), expiresAt: new Date(Date.now() + 60_000), captureCompletedAt: new Date() });
  await FaceVerificationEvidence.insertMany(challenges.map((challenge, index) => ({ evidenceReference: `FACE_EVIDENCE_Y4MS1_${suffix}_${index}`, sessionId: session._id, userId: user._id, profileId: profile._id, verificationRequestId: request._id, challengeIndex: index, challenge, cloudinaryPublicId: `fixture-${suffix}-${index}`, cloudinaryResourceType: "image", status: "STORED", mimeType: "image/jpeg", bytes: 100, format: "jpg", captureReceivedAt: new Date() })));
  await ensureProfileVerificationJob(request);
  return { profile, request };
};

const boundedGatedAdapter = (analysis: Record<string, unknown>) => {
  const pipelineManifest = createSFaceProfileVerificationAdapter().pipelineManifest;
  return { pipelineManifest, infer: async () => ({ findings: { captures: challenges.map((challenge, challengeIndex) => ({ challengeIndex, challenge, faceCount: "ONE", usability: "USABLE", reasonCodes: [] })), crossCapture: { status: "NOT_RUN", usableCaptureCount: 5, outlierCaptureCount: 0 }, avatar: { status: "NO_USABLE_FACE" }, antiSpoof: { status: "NOT_RUN" } }, gatedPolicyAnalysis: analysis }) } as any;
};

before(async () => { await connectPhase7HDatabase(); await ProfileVerificationInferenceResult.init(); }, { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

test("canonical worker runs real YuNet/SFace gated shadow inference from explicit test-only fixture readers", { timeout: 180_000 }, async () => {
  const previous = process.env.STHN_PROFILE_VERIFICATION_POLICY; const threshold = process.env.STHN_SFACE_IDENTITY_APPROVAL_THRESHOLD;
  process.env.STHN_PROFILE_VERIFICATION_POLICY = "GATED_MULTI_MEDIA_V1"; delete process.env.STHN_SFACE_IDENTITY_APPROVAL_THRESHOLD;
  try {
    const bytes = await Promise.all(names.map((name) => fs.readFile(path.join(root, name))));
    const refs = names.map((_, index) => `fixture://y4ms1/person-a/${index}`);
    const mapping = new Map(refs.map((reference, index) => [reference, bytes[index]]));
    const user = await User.create({ email: "y4ms1@fixture.test", password: "test-password", status: "active", governanceState: "ACTIVE" });
    const profile = await UserProfile.create({ userId: user._id, username: "y4ms1", dateOfBirth: new Date("1990-01-01"), interests: [], bio: "Fixture.", avatar: refs[5], cover: refs[6], profilePhotos: refs.slice(7, 13), profileStatus: "pending_verification", verificationSubmittedAt: new Date(), verificationSubmissionVersion: 1 });
    const request = (await ensureActiveProfileVerificationRequest(profile)).request;
    assert.equal(request.verificationPolicy?.key, "GATED_MULTI_MEDIA"); assert.equal(request.submittedMedia?.profilePhotos.length, 6); assert.equal(new Set([request.submittedMedia?.avatar, request.submittedMedia?.cover, ...request.submittedMedia!.profilePhotos]).size, 8);
    const session = await FaceVerificationSession.create({ sessionReference: "FACE_SESSION_Y4MS1", userId: user._id, profileId: profile._id, verificationRequestId: request._id, profileSubmissionVersion: 1, avatarFingerprint: hash(refs[5]), status: "CAPTURE_COMPLETE", isCurrent: true, challenges, requiredCaptureCount: 5, acceptedCaptureCount: 5, startedAt: new Date(), expiresAt: new Date(Date.now() + 60_000), captureCompletedAt: new Date() });
    await FaceVerificationEvidence.insertMany(challenges.map((challenge, index) => ({ evidenceReference: `FACE_EVIDENCE_Y4MS1_${index}`, sessionId: session._id, userId: user._id, profileId: profile._id, verificationRequestId: request._id, challengeIndex: index, challenge, cloudinaryPublicId: `fixture-capture-${index}`, cloudinaryResourceType: "image", status: "STORED", mimeType: "image/jpeg", bytes: bytes[index].length, format: "jpg", captureReceivedAt: new Date() })));
    await ensureProfileVerificationJob(request);
    const outcome = await processNextProfileVerificationJob({ workerId: "y4ms1", adapterFactory: () => {
      const adapter = createSFaceProfileVerificationAdapter({ evidenceReader: async () => ({ evidence: challenges.map((challenge, index) => ({ challengeIndex: index, challenge, mimeType: "image/jpeg", format: "jpeg", byteLength: bytes[index].length, bytes: bytes[index] })), noOp: null }), submittedMediaReader: fixtureReader(mapping) });
      return { ...adapter, infer: async (input) => {
        const output = await adapter.infer(input);
        return output;
      } };
    } });
    const stored = await ProfileVerificationRequest.findById(request._id); const result = await ProfileVerificationInferenceResult.findOne({ verificationRequestId: request._id }); const job = await ProfileVerificationJob.findOne({ verificationRequestId: request._id });
    assert.ok(outcome?.result); assert.equal(stored?.status, "ADMIN_REVIEW_REQUIRED"); assert.equal(stored?.decision, undefined); assert.equal((await UserProfile.findById(profile._id))?.profileStatus, "pending_verification"); assert.equal(job?.status, "COMPLETED");
    assert.equal(result?.gatedPolicyAnalysis?.policy.key, "GATED_MULTI_MEDIA"); assert.equal(result?.gatedPolicyAnalysis?.gate1.outcome, "PASS"); assert.equal(result?.gatedPolicyAnalysis?.gate2?.outcome, "READY_FOR_GATE3"); assert.equal(result?.gatedPolicyAnalysis?.gate3?.conclusion, "LIKELY_MATCH");
    assert.equal(JSON.stringify(result?.toObject()).match(/fixture:\/\/|landmarks?|aligned.*image|raw.*bytes|pixels?/i), null);
    const detail = await getAdminProfileVerificationDetail(request.verificationReference); assert.equal(detail.verificationRequest.verificationPolicy.key, "GATED_MULTI_MEDIA"); assert.ok(detail.gatedVerification);
    const replay = await processNextProfileVerificationJob({ workerId: "y4ms1-replay", adapterFactory: () => { throw new Error("completed job must not invoke inference"); } });
    assert.equal(replay, null); assert.equal((await ProfileVerificationInferenceResult.countDocuments({ verificationRequestId: request._id })), 1); assert.equal((await ProfileVerificationRequest.findById(request._id))?.status, "ADMIN_REVIEW_REQUIRED");
  } finally { if (previous === undefined) delete process.env.STHN_PROFILE_VERIFICATION_POLICY; else process.env.STHN_PROFILE_VERIFICATION_POLICY = previous; if (threshold === undefined) delete process.env.STHN_SFACE_IDENTITY_APPROVAL_THRESHOLD; else process.env.STHN_SFACE_IDENTITY_APPROVAL_THRESHOLD = threshold; }
});

test("canonical worker completes bounded Gate-1 technical failure and Gate-2 invalid-avatar shadow outcomes without retry or rejection", async () => {
  const previous = process.env.STHN_PROFILE_VERIFICATION_POLICY; const threshold = process.env.STHN_SFACE_IDENTITY_APPROVAL_THRESHOLD;
  process.env.STHN_PROFILE_VERIFICATION_POLICY = "GATED_MULTI_MEDIA_V1"; process.env.STHN_SFACE_IDENTITY_APPROVAL_THRESHOLD = "0.90";
  try {
    for (const [suffix, analysis] of [["gate1-technical", { policy: { key: "GATED_MULTI_MEDIA", version: "V1" }, gate1: { outcome: "LIVE_CAPTURE_TECHNICAL_FAILURE", usableCaptureCount: 4, threshold: .28, policyVersion: "V1" } }], ["gate2-invalid", { policy: { key: "GATED_MULTI_MEDIA", version: "V1" }, gate1: { outcome: "PASS", usableCaptureCount: 5, weakestPeerMedian: .5, threshold: .28, policyVersion: "V1" }, gate2: { outcome: "AVATAR_INVALID", avatarAdmission: "AVATAR_INVALID_NO_FACE", optionalMediaSummary: { noFaceValidCount: 0, usableFaceEvidenceCount: 0, unusableEvidenceCount: 0, mediaReadFailedCount: 0 } } }]] as const) {
      const { request, profile } = await createGatedWorkerFixture(suffix);
      const outcome = await processNextProfileVerificationJob({ workerId: `y4ms1-${suffix}`, adapterFactory: () => boundedGatedAdapter(analysis) });
      const result = await ProfileVerificationInferenceResult.findOne({ verificationRequestId: request._id }); const job = await ProfileVerificationJob.findOne({ verificationRequestId: request._id }); const stored = await ProfileVerificationRequest.findById(request._id);
      assert.ok(outcome?.result); assert.equal(stored?.status, "ADMIN_REVIEW_REQUIRED"); assert.equal(stored?.decision, undefined); assert.equal(job?.status, "COMPLETED"); assert.equal((await UserProfile.findById(profile._id))?.profileStatus, "pending_verification");
      assert.equal(result?.gatedPolicyAnalysis?.gate1.outcome, analysis.gate1.outcome); assert.equal(result?.gatedPolicyAnalysis?.gate2?.outcome, analysis.gate2?.outcome); assert.equal(result?.gatedPolicyAnalysis?.gate3, undefined);
    }
  } finally { if (previous === undefined) delete process.env.STHN_PROFILE_VERIFICATION_POLICY; else process.env.STHN_PROFILE_VERIFICATION_POLICY = previous; if (threshold === undefined) delete process.env.STHN_SFACE_IDENTITY_APPROVAL_THRESHOLD; else process.env.STHN_SFACE_IDENTITY_APPROVAL_THRESHOLD = threshold; }
});

test("canonical worker keeps a real-model Person-B avatar mismatch in Admin review", { timeout: 180_000 }, async () => {
  const previous = process.env.STHN_PROFILE_VERIFICATION_POLICY; const threshold = process.env.STHN_SFACE_IDENTITY_APPROVAL_THRESHOLD;
  process.env.STHN_PROFILE_VERIFICATION_POLICY = "GATED_MULTI_MEDIA_V1"; delete process.env.STHN_SFACE_IDENTITY_APPROVAL_THRESHOLD;
  try {
    const live = await Promise.all(names.slice(0, 5).map((name) => fs.readFile(path.join(root, name))));
    const personBRoot = "D:\\STHN-Evaluation\\VGGFace2\\test\\test\\n000001"; const personBNames = ["0001_01.jpg", "0002_01.jpg", "0003_01.jpg", "0004_01.jpg", "0005_01.jpg", "0006_01.jpg", "0007_01.jpg", "0008_01.jpg"];
    const personB = await Promise.all(personBNames.map((name) => fs.readFile(path.join(personBRoot, name))));
    const { profile, request } = await createGatedWorkerFixture("real-mismatch");
    const mapping = new Map(personB.map((bytes, index) => [`fixture://y4ms1/real-mismatch/${index}`, bytes]));
    const outcome = await processNextProfileVerificationJob({ workerId: "y4ms1-real-mismatch", adapterFactory: () => createSFaceProfileVerificationAdapter({ evidenceReader: async () => ({ evidence: challenges.map((challenge, index) => ({ challengeIndex: index, challenge, mimeType: "image/jpeg", format: "jpeg", byteLength: live[index].length, bytes: live[index] })), noOp: null }), submittedMediaReader: fixtureReader(mapping) }) });
    const result = await ProfileVerificationInferenceResult.findOne({ verificationRequestId: request._id }); const stored = await ProfileVerificationRequest.findById(request._id); const job = await ProfileVerificationJob.findOne({ verificationRequestId: request._id });
    assert.ok(outcome?.result); assert.equal(result?.gatedPolicyAnalysis?.gate1.outcome, "PASS"); assert.equal(result?.gatedPolicyAnalysis?.gate2?.outcome, "READY_FOR_GATE3"); assert.equal(result?.gatedPolicyAnalysis?.gate3?.conclusion, "LIKELY_MISMATCH"); assert.ok((result?.gatedPolicyAnalysis?.gate3?.avatarMedianSimilarity ?? 1) < .36); assert.equal(stored?.status, "ADMIN_REVIEW_REQUIRED"); assert.equal(stored?.decision, undefined); assert.equal(job?.status, "COMPLETED");
    const detail = await getAdminProfileVerificationDetail(request.verificationReference); assert.ok(detail.gatedVerification); assert.equal(JSON.stringify(detail.gatedVerification).match(/fixture:\/\/|VGGFace2|embedding|landmarks?|pixels?/i), null);
    const replay = await processNextProfileVerificationJob({ workerId: "y4ms1-real-mismatch-replay", adapterFactory: () => { throw new Error("completed job must not invoke inference"); } }); assert.equal(replay, null); assert.equal(await ProfileVerificationInferenceResult.countDocuments({ verificationRequestId: request._id }), 1);
  } finally { if (previous === undefined) delete process.env.STHN_PROFILE_VERIFICATION_POLICY; else process.env.STHN_PROFILE_VERIFICATION_POLICY = previous; if (threshold === undefined) delete process.env.STHN_SFACE_IDENTITY_APPROVAL_THRESHOLD; else process.env.STHN_SFACE_IDENTITY_APPROVAL_THRESHOLD = threshold; }
});

test("canonical worker records a real-model mixed-identity live anchor as incoherent without retry", { timeout: 180_000 }, async () => {
  const previous = process.env.STHN_PROFILE_VERIFICATION_POLICY; const threshold = process.env.STHN_SFACE_IDENTITY_APPROVAL_THRESHOLD;
  process.env.STHN_PROFILE_VERIFICATION_POLICY = "GATED_MULTI_MEDIA_V1"; delete process.env.STHN_SFACE_IDENTITY_APPROVAL_THRESHOLD;
  try {
    const livePaths = [path.join(root, "0003_01.jpg"), "D:\\STHN-Evaluation\\VGGFace2\\test\\test\\n000001\\0001_01.jpg", "D:\\STHN-Evaluation\\VGGFace2\\test\\test\\n000009\\0001_01.jpg", "D:\\STHN-Evaluation\\VGGFace2\\test\\test\\n000029\\0001_01.jpg", "D:\\STHN-Evaluation\\VGGFace2\\test\\test\\n000040\\0001_01.jpg"];
    const live = await Promise.all(livePaths.map((file) => fs.readFile(file)));
    const mediaRoot = "D:\\STHN-Evaluation\\VGGFace2\\test\\test\\n000001"; const media = await Promise.all(["0001_01.jpg", "0002_01.jpg", "0003_01.jpg", "0004_01.jpg", "0005_01.jpg", "0006_01.jpg", "0007_01.jpg", "0008_01.jpg"].map((name) => fs.readFile(path.join(mediaRoot, name))));
    const { request } = await createGatedWorkerFixture("real-incoherent"); const mapping = new Map(media.map((bytes, index) => [`fixture://y4ms1/real-incoherent/${index}`, bytes]));
    const outcome = await processNextProfileVerificationJob({ workerId: "y4ms1-real-incoherent", adapterFactory: () => createSFaceProfileVerificationAdapter({ evidenceReader: async () => ({ evidence: challenges.map((challenge, index) => ({ challengeIndex: index, challenge, mimeType: "image/jpeg", format: "jpeg", byteLength: live[index].length, bytes: live[index] })), noOp: null }), submittedMediaReader: fixtureReader(mapping) }) });
    const result = await ProfileVerificationInferenceResult.findOne({ verificationRequestId: request._id }); const stored = await ProfileVerificationRequest.findById(request._id); const job = await ProfileVerificationJob.findOne({ verificationRequestId: request._id });
    assert.ok(outcome?.result); assert.equal(result?.gatedPolicyAnalysis?.gate1.usableCaptureCount, 5); assert.equal(result?.gatedPolicyAnalysis?.gate1.outcome, "LIVE_ANCHOR_INCOHERENT"); assert.ok((result?.gatedPolicyAnalysis?.gate1.weakestPeerMedian ?? 1) < .28); assert.equal(result?.gatedPolicyAnalysis?.gate2, undefined); assert.equal(result?.gatedPolicyAnalysis?.gate3, undefined); assert.equal(stored?.status, "ADMIN_REVIEW_REQUIRED"); assert.equal(stored?.decision, undefined); assert.equal(job?.status, "COMPLETED");
  } finally { if (previous === undefined) delete process.env.STHN_PROFILE_VERIFICATION_POLICY; else process.env.STHN_PROFILE_VERIFICATION_POLICY = previous; if (threshold === undefined) delete process.env.STHN_SFACE_IDENTITY_APPROVAL_THRESHOLD; else process.env.STHN_SFACE_IDENTITY_APPROVAL_THRESHOLD = threshold; }
});

test("injected gated technical failure preserves canonical retries and never falls back to legacy authority", async () => {
  const previous = process.env.STHN_PROFILE_VERIFICATION_POLICY; const threshold = process.env.STHN_SFACE_IDENTITY_APPROVAL_THRESHOLD;
  process.env.STHN_PROFILE_VERIFICATION_POLICY = "GATED_MULTI_MEDIA_V1"; process.env.STHN_SFACE_IDENTITY_APPROVAL_THRESHOLD = "0.90";
  try {
    const { request } = await createGatedWorkerFixture("technical-retry"); let now = new Date();
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const outcome = await processNextProfileVerificationJob({ workerId: `y4ms1-failure-${attempt}`, now, adapterFactory: () => ({ pipelineManifest: createSFaceProfileVerificationAdapter().pipelineManifest, infer: async () => { throw new Error("test-only technical reader failure"); } }) });
      assert.equal(outcome?.result, null); const job = await ProfileVerificationJob.findOne({ verificationRequestId: request._id }); const stored = await ProfileVerificationRequest.findById(request._id); assert.equal(stored?.verificationPolicy?.key, "GATED_MULTI_MEDIA"); assert.equal(stored?.decision, undefined); assert.equal((await ProfileVerificationInferenceResult.countDocuments({ verificationRequestId: request._id })), 0);
      if (attempt < 3) { assert.equal(job?.status, "RETRY_WAIT"); now = new Date(job!.nextAttemptAt!.getTime() + 1); } else { assert.equal(job?.status, "FAILED"); assert.equal(stored?.status, "ADMIN_REVIEW_REQUIRED"); assert.equal(stored?.adminReviewReasonCode, "MODEL_FAILURE"); }
    }
  } finally { if (previous === undefined) delete process.env.STHN_PROFILE_VERIFICATION_POLICY; else process.env.STHN_PROFILE_VERIFICATION_POLICY = previous; if (threshold === undefined) delete process.env.STHN_SFACE_IDENTITY_APPROVAL_THRESHOLD; else process.env.STHN_SFACE_IDENTITY_APPROVAL_THRESHOLD = threshold; }
});
