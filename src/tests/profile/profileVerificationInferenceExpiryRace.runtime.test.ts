import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";
import { ProfileVerificationRequest } from "../../models/profileVerificationRequest.model";
import { ProfileVerificationInferenceResult } from "../../models/profileVerificationInferenceResult.model";
import { FaceVerificationSession, FaceVerificationChallenge } from "../../models/faceVerificationSession.model";
import { FaceVerificationEvidence } from "../../models/faceVerificationEvidence.model";
import { finalizeProfileVerificationInference } from "../../services/profile/profileVerificationInference.service";
import { ProfileVerificationInferenceAdapter } from "../../services/profile/profileVerificationInferenceAdapter";
import { ProfileVerificationInferenceFindings } from "../../services/profile/profileVerificationInference.types";
import { profileVerificationRequestRepository } from "../../repositories/profileVerificationRequest.repository";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";
const challenges: FaceVerificationChallenge[] = ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "BLINK"];
const findings = (): ProfileVerificationInferenceFindings => ({ captures: challenges.map((challenge, challengeIndex) => ({ challenge, challengeIndex, faceCount: "NOT_RUN", usability: "NOT_RUN", reasonCodes: [] })), crossCapture: { status: "NOT_RUN", usableCaptureCount: 0, outlierCaptureCount: 0 }, avatar: { status: "NOT_RUN" }, antiSpoof: { status: "NOT_RUN" } });
class PausedAdapter implements ProfileVerificationInferenceAdapter {
  readonly pipelineManifest = { kind: "TEST_SYNTHETIC" as const, pipelineVersion: "EXPIRY_RACE_V1", runtimeIdentifier: "STHN_TEST_ADAPTER_ONLY", runtimeVersion: "1" };
  private release!: () => void; private readonly gate = new Promise<void>((resolve) => { this.release = resolve; });
  private started!: () => void; readonly startedGate = new Promise<void>((resolve) => { this.started = resolve; }); completed = false;
  async infer() { this.started(); await this.gate; this.completed = true; return findings(); }
  resume() { this.release(); }
}
const fixture = async (suffix: string) => {
  const user = await User.create({ email: `expiry-race-${suffix}@test.local`, password: "test-password", status: "active", governanceState: "ACTIVE" });
  const profile = await UserProfile.create({ userId: user._id, username: `expiry-race-${suffix}`, dateOfBirth: new Date("1990-01-01"), interests: [], bio: "Inference race.", avatar: "a", cover: "c", profilePhotos: ["one", "two"], profileStatus: "pending_verification", verificationSubmittedAt: new Date(), verificationSubmissionVersion: 1 });
  const request = await ProfileVerificationRequest.create({ verificationReference: `PROFILE_INFERENCE_EXPIRY_${suffix}`, profileId: profile._id, userId: user._id, attemptNumber: 1, profileSubmissionVersion: 1, submittedAt: new Date() });
  const session = await FaceVerificationSession.create({ sessionReference: `FACE_INFERENCE_EXPIRY_${suffix}`, userId: user._id, profileId: profile._id, verificationRequestId: request._id, profileSubmissionVersion: 1, avatarFingerprint: "a".repeat(64), status: "CAPTURE_COMPLETE", isCurrent: true, challenges, requiredCaptureCount: 5, acceptedCaptureCount: 5, startedAt: new Date(), expiresAt: new Date(Date.now() + 60_000), captureCompletedAt: new Date() });
  await FaceVerificationEvidence.insertMany(challenges.map((challenge, challengeIndex) => ({ evidenceReference: `FACE_INFERENCE_EXPIRY_${suffix}_${challengeIndex}`, sessionId: session._id, userId: user._id, profileId: profile._id, verificationRequestId: request._id, challengeIndex, challenge, cloudinaryPublicId: `opaque-${suffix}-${challengeIndex}`, cloudinaryResourceType: "image", status: "STORED", mimeType: "image/jpeg", bytes: 20, format: "jpg", captureReceivedAt: new Date() })));
  return { profile, request };
};
before(async () => { await connectPhase7HDatabase(); await ProfileVerificationInferenceResult.init(); }, { timeout: 120_000 }); beforeEach(async () => clearPhase7HDatabase()); after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });
test("active request survives paused adapter and persists exactly one result", async () => { const { request } = await fixture("control"); const adapter = new PausedAdapter(); const work = finalizeProfileVerificationInference({ verificationRequestId: String(request._id), adapter }); await adapter.startedGate; adapter.resume(); const outcome = await work; assert.equal(adapter.completed, true); assert.ok(outcome.result); assert.equal(await ProfileVerificationInferenceResult.countDocuments({ verificationRequestId: request._id }), 1); });
test("expiry during adapter execution prevents final result persistence", async () => { const { profile, request } = await fixture("expired"); const adapter = new PausedAdapter(); const work = finalizeProfileVerificationInference({ verificationRequestId: String(request._id), adapter }); await adapter.startedGate; const expired = await profileVerificationRequestRepository.transitionToExpired({ requestId: request._id, now: new Date(), retentionDeadline: new Date() }); assert.equal(expired?.status, "EXPIRED"); adapter.resume(); await assert.rejects(work, (error: unknown) => (error as { code?: string }).code === "BIOMETRIC_RETENTION_EXPIRED"); const [reloaded, reloadedProfile] = await Promise.all([ProfileVerificationRequest.findById(request._id), UserProfile.findById(profile._id)]); assert.equal(adapter.completed, true); assert.equal(await ProfileVerificationInferenceResult.countDocuments({ verificationRequestId: request._id }), 0); assert.equal(reloaded?.status, "EXPIRED"); assert.equal(reloaded?.isActive, false); assert.equal(reloaded?.decision, undefined); assert.notEqual(reloadedProfile?.profileStatus, "verified"); assert.notEqual(reloadedProfile?.profileStatus, "rejected"); });
