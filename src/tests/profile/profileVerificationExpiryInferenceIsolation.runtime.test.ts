import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { NextFunction, Request, Response } from "express";
import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";
import { ProfileVerificationRequest } from "../../models/profileVerificationRequest.model";
import { ProfileVerificationInferenceResult } from "../../models/profileVerificationInferenceResult.model";
import { FaceVerificationSession } from "../../models/faceVerificationSession.model";
import { upsertProfile } from "../../controllers/profile.controller";
import { finalizeProfileVerificationInference } from "../../services/profile/profileVerificationInference.service";
import { ProfileVerificationInferenceAdapter } from "../../services/profile/profileVerificationInferenceAdapter";
import { ProfileVerificationInferenceFindings, ProfileVerificationInferenceInputDescriptor } from "../../services/profile/profileVerificationInference.types";
import { acceptFaceVerificationCapture, startFaceVerificationSession } from "../../services/profile/faceVerificationSession.service";
import { expireProfileVerificationRequests } from "../../services/profile/profileVerificationRequest.service";
import { reconcileFaceVerificationEvidenceRetention } from "../../services/profile/faceVerificationEvidenceCleanup.service";
import { FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS } from "../../services/profile/faceVerification.constants";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";

const storage = require("../../services/profile/faceVerificationEvidenceStorage.service") as {
  storeFaceVerificationEvidence: (input: { buffer: Buffer; publicId: string }) => Promise<unknown>;
  deleteFaceVerificationEvidence: (publicId: string) => Promise<"DELETED" | "ALREADY_MISSING" | "RETRYABLE_FAILURE" | "PROVIDER_FAILURE">;
};
const originalStore = storage.storeFaceVerificationEvidence;
const originalDelete = storage.deleteFaceVerificationEvidence;
const avatar = "https://example.test/inference-isolation-avatar.jpg";
const captureFile = (index: number) => ({ buffer: Buffer.from([0xff, 0xd8, 0xff, index]), mimetype: "image/jpeg", size: 4, originalname: "capture.jpg" }) as Express.Multer.File;
const submission = {
  username: "inference-isolation", realName: "Inference Isolation", dateOfBirth: "1990-01-01",
  mobileCountryCode: "+91", mobileNumber: "9876543210", country: "India", city: "Mumbai",
  languages: ["English"], interests: [], bio: "Cross-attempt inference isolation.", avatar,
  cover: "https://example.test/cover.jpg", profilePhotos: ["https://example.test/one.jpg", "https://example.test/two.jpg"],
};
const invokeSubmission = (user: Record<string, unknown>) => new Promise<void>((resolve, reject) => {
  const response = { status: () => response, json: () => { resolve(); return response; } } as unknown as Response;
  upsertProfile({ user, body: submission } as unknown as Request, response, reject as NextFunction);
});
const completeSession = async (userId: string, sessionReference: string) => {
  for (let index = 0; index < 5; index += 1) await acceptFaceVerificationCapture({ userId, sessionReference, challengeIndex: String(index), file: captureFile(index) });
};
const findings = (input: Readonly<ProfileVerificationInferenceInputDescriptor>, variant: "V1" | "V2"): ProfileVerificationInferenceFindings => ({
  captures: input.captures.map(({ challenge, challengeIndex }) => ({
    challenge, challengeIndex,
    faceCount: variant === "V1" ? "ONE" as const : "MULTIPLE" as const,
    usability: variant === "V1" ? "USABLE" as const : "UNUSABLE" as const,
    reasonCodes: variant === "V1" ? [] : ["FACE_TOO_SMALL" as const],
  })),
  crossCapture: variant === "V1" ? { status: "CONSISTENT", usableCaptureCount: 5, outlierCaptureCount: 0 } : { status: "INCONSISTENT", usableCaptureCount: 0, outlierCaptureCount: 5 },
  avatar: { status: variant === "V1" ? "MATCH_SUPPORTED" : "MATCH_UNCERTAIN" }, antiSpoof: { status: "NOT_RUN" },
});
class SyntheticAdapter implements ProfileVerificationInferenceAdapter {
  readonly pipelineManifest = { kind: "TEST_SYNTHETIC" as const, pipelineVersion: "B3_ISOLATION_V1", runtimeIdentifier: "STHN_TEST_ADAPTER_ONLY", runtimeVersion: "1" };
  constructor(private readonly variant: "V1" | "V2") {}
  async infer(input: Readonly<ProfileVerificationInferenceInputDescriptor>) { return findings(input, this.variant); }
}

before(async () => { await connectPhase7HDatabase(); await ProfileVerificationInferenceResult.init(); }, { timeout: 120_000 });
beforeEach(async () => {
  await clearPhase7HDatabase();
  storage.storeFaceVerificationEvidence = async (input) => ({ publicId: input.publicId, bytes: input.buffer.length, format: "jpeg", mimeType: "image/jpeg" });
  storage.deleteFaceVerificationEvidence = async () => "DELETED";
});
after(async () => { storage.storeFaceVerificationEvidence = originalStore; storage.deleteFaceVerificationEvidence = originalDelete; await disconnectPhase7HDatabase(); }, { timeout: 30_000 });

test("V1 inference result cannot collide with, replay into, or survive V2 authority", async () => {
  const user = await User.create({ email: "inference-isolation@test.local", password: "test-password", status: "pending_profile", governanceState: "ACTIVE" });
  const s1 = await startFaceVerificationSession({ userId: String(user._id), avatar });
  await completeSession(String(user._id), s1.sessionReference);
  await invokeSubmission({ id: String(user._id), role: "user", status: "pending_profile" });
  const v1 = await ProfileVerificationRequest.findOne({ profileId: s1.profileId, isActive: true });
  assert.ok(v1);
  const firstV1 = await finalizeProfileVerificationInference({ verificationRequestId: String(v1?._id), adapter: new SyntheticAdapter("V1") });
  const replayV1 = await finalizeProfileVerificationInference({ verificationRequestId: String(v1?._id), adapter: new SyntheticAdapter("V1") });
  const r1 = firstV1.result!;
  assert.equal(firstV1.replayed, false);
  assert.equal(replayV1.replayed, true);
  assert.equal(String(replayV1.result?._id), String(r1._id));
  assert.equal(await ProfileVerificationInferenceResult.countDocuments({ verificationRequestId: v1?._id }), 1);

  await expireProfileVerificationRequests(new Date(v1!.submittedAt.getTime() + FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS));
  const expiredReplay = await finalizeProfileVerificationInference({ verificationRequestId: String(v1._id), adapter: new SyntheticAdapter("V1") });
  assert.equal(expiredReplay.noOp, "TERMINAL_REQUEST");
  assert.equal(await ProfileVerificationInferenceResult.countDocuments({ verificationRequestId: v1._id }), 1);
  assert.equal((await FaceVerificationSession.findById(s1._id))?.isCurrent, false);

  const profileAfterExpiry = await UserProfile.findById(s1.profileId);
  assert.equal(profileAfterExpiry?.verificationSubmissionVersion, 1);
  const s2 = await startFaceVerificationSession({ userId: String(user._id), avatar });
  assert.equal(s2.profileSubmissionVersion, 2);
  assert.notEqual(String(s2._id), String(s1._id));
  await completeSession(String(user._id), s2.sessionReference);
  await invokeSubmission({ id: String(user._id), role: "user", status: "active" });
  const v2 = await ProfileVerificationRequest.findOne({ profileId: s2.profileId, isActive: true });
  assert.ok(v2);
  const firstV2 = await finalizeProfileVerificationInference({ verificationRequestId: String(v2?._id), adapter: new SyntheticAdapter("V2") });
  const replayV2 = await finalizeProfileVerificationInference({ verificationRequestId: String(v2?._id), adapter: new SyntheticAdapter("V2") });
  const r2 = firstV2.result!;
  assert.equal(firstV2.replayed, false);
  assert.equal(replayV2.replayed, true);
  assert.equal(String(replayV2.result?._id), String(r2._id));
  assert.notEqual(String(r2._id), String(r1._id));
  assert.notEqual(String(r2.verificationRequestId), String(r1.verificationRequestId));
  assert.notEqual(String(r2.faceVerificationSessionId), String(r1.faceVerificationSessionId));
  assert.notEqual(r2.profileSubmissionVersion, r1.profileSubmissionVersion);
  assert.notEqual(r2.evidenceSetFingerprint, r1.evidenceSetFingerprint);
  assert.notEqual(r2.inferenceRunFingerprint, r1.inferenceRunFingerprint);
  assert.equal(r2.pipelineManifestFingerprint, r1.pipelineManifestFingerprint);
  assert.equal(r2.profileSubmissionVersion, 2);
  assert.equal(String(r2.verificationRequestId), String(v2?._id));
  assert.equal(String(r2.faceVerificationSessionId), String(s2._id));
  assert.equal(await ProfileVerificationInferenceResult.countDocuments({ profileId: s2.profileId }), 2);
  assert.equal(r1.findings.captures[0].faceCount, "ONE");
  assert.equal(r2.findings.captures[0].faceCount, "MULTIPLE");
  assert.equal(r2.retentionDeadline.getTime(), v2!.submittedAt.getTime() + FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS);
  assert.notEqual(r2.retentionDeadline.getTime(), r1.retentionDeadline.getTime());

  await FaceVerificationSession.updateOne({ _id: s2._id }, { $set: { profileSubmissionVersion: 1 } });
  const staleV2 = await finalizeProfileVerificationInference({ verificationRequestId: String(v2!._id), adapter: new SyntheticAdapter("V2") });
  assert.equal(staleV2.noOp, "STALE_SUBMISSION");
  assert.equal(await ProfileVerificationInferenceResult.countDocuments({ profileId: s2.profileId }), 2);

  await reconcileFaceVerificationEvidenceRetention(r1.retentionDeadline);
  assert.equal(await ProfileVerificationInferenceResult.findById(r1._id), null);
  assert.ok(await ProfileVerificationInferenceResult.findById(r2._id));
});
