import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { NextFunction, Request, Response } from "express";

import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";
import { ProfileVerificationRequest } from "../../models/profileVerificationRequest.model";
import { FaceVerificationSession, FaceVerificationChallenge } from "../../models/faceVerificationSession.model";
import { FaceVerificationEvidence } from "../../models/faceVerificationEvidence.model";
import { ProfileVerificationInferenceResult } from "../../models/profileVerificationInferenceResult.model";
import { authEntry } from "../../controllers/authEntry.controller";
import { getMyProfile } from "../../controllers/profile.controller";
import { getUserPublicProfile } from "../../controllers/user.controller";
import { listPendingProfiles, approveProfile } from "../../controllers/profileVerification.controller";
import { errorHandler } from "../../middlewares/errorHandler";
import { ensureActiveProfileVerificationRequest, expireProfileVerificationRequests } from "../../services/profile/profileVerificationRequest.service";
import { finalizeProfileVerificationInference } from "../../services/profile/profileVerificationInference.service";
import { ProfileVerificationInferenceAdapter } from "../../services/profile/profileVerificationInferenceAdapter";
import { ProfileVerificationInferenceFindings } from "../../services/profile/profileVerificationInference.types";
import { ProfileVerificationInferenceError } from "../../errors/profile/ProfileVerificationInferenceError";
import { readProfileVerificationEvidenceBytes } from "../../services/profile/faceVerificationEvidenceRead.service";
import { toFaceVerificationSessionDto } from "../../services/profile/faceVerificationSession.service";
import { FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS } from "../../services/profile/faceVerification.constants";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";

const challenges: FaceVerificationChallenge[] = ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "BLINK"];
const privateMarkers = [
  "cloudinaryPublicId", "secure_url", "signed", "cleanupAfter", "deletionClaimToken", "deletionClaimedAt",
  "retentionDeadline", "evidenceSetFingerprint", "pipelineManifestFingerprint", "inferenceRunFingerprint",
  "embedding", "landmark", "geometry", "similarity", "base64", "private-provider", "opaque-private",
];

type Invocation = { statusCode?: number; body?: unknown; error?: unknown };

const invoke = (
  controller: (request: Request, response: Response, next: NextFunction) => unknown,
  request: Partial<Request>,
) => new Promise<Invocation>((resolve) => {
  const result: Invocation = {};
  const response = {
    status: (statusCode: number) => { result.statusCode = statusCode; return response; },
    json: (body: unknown) => { result.body = body; resolve(result); return response; },
  } as unknown as Response;
  const next: NextFunction = (error) => { result.error = error; resolve(result); };
  controller(request as Request, response, next);
});

const errorBody = (error: unknown) => {
  const originalError = console.error;
  try {
    console.error = () => undefined;
    let body: unknown;
    errorHandler(error, {} as Request, {
      status: () => ({ json: (value: unknown) => { body = value; return value; } }),
    } as unknown as Response, (() => undefined) as NextFunction);
    return body as Record<string, unknown>;
  } finally {
    console.error = originalError;
  }
};

const assertNoPrivateMarker = (value: unknown) => {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const marker of privateMarkers) assert.equal(serialized.includes(marker.toLowerCase()), false, `${marker} must remain internal`);
};

const captureError = async (operation: () => Promise<unknown>) => {
  let captured: unknown;
  try {
    await operation();
  } catch (error) {
    captured = error;
  }
  assert.ok(captured, "operation must fail");
  return captured;
};

const findings = (): ProfileVerificationInferenceFindings => ({
  captures: challenges.map((challenge, challengeIndex) => ({ challengeIndex, challenge, faceCount: "NOT_RUN", usability: "NOT_RUN", reasonCodes: [] })),
  crossCapture: { status: "NOT_RUN", usableCaptureCount: 0, outlierCaptureCount: 0 },
  avatar: { status: "NOT_RUN" }, antiSpoof: { status: "NOT_RUN" },
});

const adapter: ProfileVerificationInferenceAdapter = {
  pipelineManifest: { kind: "TEST_SYNTHETIC", pipelineVersion: "H4C_D_PRIVACY", runtimeIdentifier: "STHN_TEST_ADAPTER_ONLY", runtimeVersion: "1" },
  async infer() { return findings(); },
};

const makeBoundFixture = async (suffix: string) => {
  const user = await User.create({ email: `retention-privacy-${suffix}@test.local`, password: "test-password", status: "active", governanceState: "ACTIVE" });
  const profile = await UserProfile.create({
    userId: user._id, username: `retention-privacy-${suffix}`, dateOfBirth: new Date("1990-01-01"), interests: [], bio: "Privacy fixture.",
    avatar: "https://example.test/avatar.jpg", cover: "https://example.test/cover.jpg", profilePhotos: ["https://example.test/one.jpg", "https://example.test/two.jpg"],
    profileStatus: "pending_verification", verificationSubmittedAt: new Date(), verificationSubmissionVersion: 1,
  });
  const { request } = await ensureActiveProfileVerificationRequest(profile);
  const session = await FaceVerificationSession.create({
    sessionReference: `FACE_SESSION_PRIVACY_${suffix}`, userId: user._id, profileId: profile._id, verificationRequestId: request._id,
    profileSubmissionVersion: 1, avatarFingerprint: "a".repeat(64), status: "CAPTURE_COMPLETE", isCurrent: true, challenges,
    requiredCaptureCount: 5, acceptedCaptureCount: 5, startedAt: new Date(), expiresAt: new Date(Date.now() + 60_000), captureCompletedAt: new Date(),
  });
  await FaceVerificationEvidence.insertMany(challenges.map((challenge, challengeIndex) => ({
    evidenceReference: `FACE_EVIDENCE_PRIVACY_${suffix}_${challengeIndex}`, sessionId: session._id, userId: user._id, profileId: profile._id,
    verificationRequestId: request._id, challengeIndex, challenge, cloudinaryPublicId: `opaque-private-${suffix}-${challengeIndex}`,
    cloudinaryResourceType: "image", status: "STORED", mimeType: "image/jpeg", bytes: 10, format: "jpg", captureReceivedAt: new Date(),
    cleanupAfter: new Date(Date.now() + 60_000), deletionClaimToken: "private-provider-cleanup-claim", deletionClaimedAt: new Date(),
  })));
  return { user, profile, request, session };
};

before(async () => {
  await connectPhase7HDatabase();
  await ProfileVerificationInferenceResult.init();
}, { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

test("auth entry, self profile, public profile, and session DTO do not serialize linked verification internals", async () => {
  const fixture = await makeBoundFixture("user");
  const outcome = await finalizeProfileVerificationInference({ verificationRequestId: String(fixture.request._id), adapter });
  assert.ok(outcome.result);

  const entry = await invoke(authEntry, { user: { id: String(fixture.user._id), _id: fixture.user._id, status: "active", role: "user" } as unknown as Request["user"] });
  assert.equal(entry.statusCode, 200);
  assert.deepEqual(Object.keys(entry.body as Record<string, unknown>).sort(), ["entryRoute", "entryType", "userId"]);
  assertNoPrivateMarker(entry.body);

  const self = await invoke(getMyProfile, { user: { id: String(fixture.user._id), role: "user", status: "active" } });
  assert.equal(self.statusCode, undefined);
  assertNoPrivateMarker(self.body);

  const publicProfile = await invoke(getUserPublicProfile, { params: { userId: String(fixture.user._id) } });
  assert.equal(publicProfile.statusCode, 200);
  assertNoPrivateMarker(publicProfile.body);

  const sessionDto = toFaceVerificationSessionDto(fixture.session);
  assert.deepEqual(Object.keys(sessionDto).sort(), ["acceptedCaptureCount", "captureComplete", "challenges", "expiresAt", "requiredCaptureCount", "sessionReference", "status"]);
  assertNoPrivateMarker(sessionDto);
});

test("Admin verification queues use bounded DTOs and expose no linked storage or inference authority", async () => {
  const fixture = await makeBoundFixture("queue");
  await finalizeProfileVerificationInference({ verificationRequestId: String(fixture.request._id), adapter });
  const result = await invoke(listPendingProfiles, {});
  const profiles = (result.body as { profiles: Array<Record<string, unknown>> }).profiles;
  assert.equal(profiles.length, 1);
  assert.deepEqual(Object.keys(profiles[0].verificationRequest as Record<string, unknown>).sort(), [
    "adminReviewReason", "adminReviewReasonCode", "adminReviewRequiredAt", "attemptNumber", "profileSubmissionVersion", "status", "submittedAt", "verificationReference",
  ]);
  assertNoPrivateMarker(result.body);
});

test("expired Admin and evidence/inference failures render only bounded messages", async () => {
  const expired = await makeBoundFixture("expired");
  await ProfileVerificationRequest.collection.updateOne({ _id: expired.request._id }, { $set: { submittedAt: new Date(Date.now() - FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS - 1) } });
  await expireProfileVerificationRequests(new Date());
  const admin = await User.create({ email: "retention-privacy-admin@test.local", password: "test-password", role: "admin", status: "active", governanceState: "ACTIVE" });
  const decision = await invoke(approveProfile, { user: { id: String(admin._id), role: "admin", status: "active" }, params: { profileId: String(expired.profile._id) } });
  assert.ok(decision.error);
  const expiredError = errorBody(decision.error);
  assert.equal(expiredError.message, "Verification attempt expired; fresh submission required");
  assertNoPrivateMarker(expiredError);

  const unavailable = await makeBoundFixture("unavailable");
  const evidenceError = await captureError(
    () => readProfileVerificationEvidenceBytes({
      verificationRequestId: String(unavailable.request._id),
      storageReader: async () => { throw new ProfileVerificationInferenceError("signed=https://private-provider.test/opaque-private", "EVIDENCE_NOT_AVAILABLE", 409); },
    }),
  );
  const sanitizedEvidenceError = errorBody(evidenceError);
  assert.equal(sanitizedEvidenceError.message, "Face evidence is not available");
  assertNoPrivateMarker(sanitizedEvidenceError);

  const retentionExpired = await makeBoundFixture("inference-expired");
  await ProfileVerificationRequest.collection.updateOne({ _id: retentionExpired.request._id }, { $set: { submittedAt: new Date(Date.now() - FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS - 1) } });
  const inferenceError = await captureError(() => finalizeProfileVerificationInference({ verificationRequestId: String(retentionExpired.request._id), adapter }));
  const sanitizedInferenceError = errorBody(inferenceError);
  assert.equal(sanitizedInferenceError.message, "Verification biometric retention expired");
  assertNoPrivateMarker(sanitizedInferenceError);
});

test("persisted inference records contain bounded findings but no raw biometric or provider material", async () => {
  const fixture = await makeBoundFixture("persisted");
  const outcome = await finalizeProfileVerificationInference({ verificationRequestId: String(fixture.request._id), adapter });
  assert.ok(outcome.result);
  const result = await ProfileVerificationInferenceResult.findById(outcome.result._id).lean();
  assert.ok(result);
  assert.equal(result.findings.captures.length, 5);
  assert.ok(result.retentionDeadline);
  for (const field of [
    "bytes", "base64", "url", "cloudinaryPublicId", "secure_url", "signedUrl", "storageKey", "providerResponse",
    "landmarks", "geometry", "boundingBox", "detectorScore", "similarity", "embedding", "alignedCrop", "rawOutput",
  ]) assert.equal(field in result, false, `${field} must not be persisted`);
  assert.equal(JSON.stringify(result).includes("opaque-private"), false);
});
