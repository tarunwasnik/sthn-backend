import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";
import { FaceVerificationEvidence } from "../../models/faceVerificationEvidence.model";
import { FaceVerificationSession } from "../../models/faceVerificationSession.model";
import { FaceVerificationChallenge } from "../../models/faceVerificationSession.model";
import { ensureActiveProfileVerificationRequest } from "../../services/profile/profileVerificationRequest.service";
import { getAdminProfileVerificationDetail, readAdminProfileVerificationCapture } from "../../services/profile/profileVerificationAdminRead.service";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const challenges: FaceVerificationChallenge[] = ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "BLINK"];
const reader = async () => ({ bytes: Buffer.from(png), byteLength: png.length, contentType: "image/png" });

const fixture = async (suffix: string) => {
  const user = await User.create({ email: `admin-detail-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" });
  const profile = await UserProfile.create({ userId: user._id, username: `admin-detail-${suffix}`, dateOfBirth: new Date("1990-01-01"), interests: ["Music"], bio: "Review profile", avatar: "https://ordinary.test/avatar.jpg", cover: "https://ordinary.test/cover.jpg", profilePhotos: ["https://ordinary.test/one.jpg", "https://ordinary.test/two.jpg"], profileStatus: "pending_verification", verificationSubmittedAt: new Date(), verificationSubmissionVersion: 1 });
  const { request } = await ensureActiveProfileVerificationRequest(profile);
  const session = await FaceVerificationSession.create({ sessionReference: `ADMIN_DETAIL_SESSION_${suffix}`, userId: user._id, profileId: profile._id, verificationRequestId: request._id, profileSubmissionVersion: 1, avatarFingerprint: "a".repeat(64), status: "CAPTURE_COMPLETE", isCurrent: true, challenges, requiredCaptureCount: 5, acceptedCaptureCount: 5, startedAt: new Date(), expiresAt: new Date(Date.now() + 60_000), captureCompletedAt: new Date() });
  await FaceVerificationEvidence.insertMany(challenges.map((challenge, challengeIndex) => ({ evidenceReference: `ADMIN_DETAIL_EVIDENCE_${suffix}_${challengeIndex}`, sessionId: session._id, userId: user._id, profileId: profile._id, verificationRequestId: request._id, challengeIndex, challenge, cloudinaryPublicId: `provider-secret-${suffix}-${challengeIndex}`, cloudinaryResourceType: "image", status: "STORED", mimeType: "image/png", format: "png", bytes: png.length, captureReceivedAt: new Date(), cleanupAfter: new Date(Date.now() + 60_000) })));
  return { user, profile, request, session };
};

before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

test("admin detail is exact-attempt ordered and excludes biometric storage internals", async () => {
  const data = await fixture("detail");
  const detail = await getAdminProfileVerificationDetail(data.request.verificationReference);
  assert.equal(detail.account.email, data.user.email);
  assert.equal(detail.profile.username, data.profile.username);
  assert.equal(detail.faceSession.sessionReference, data.session.sessionReference);
  assert.deepEqual(detail.shadowIdentityAnalysis, {
    status: "NOT_CONFIGURED",
    conclusion: null,
    similarity: null,
    threshold: null,
    model: null,
    processedAt: null,
    usableCaptureCount: null,
    reasonCode: null,
    reason: null,
  });
  assert.equal(detail.verificationRequest.decisionAuthority, null);
  assert.equal(detail.verificationRequest.aiDecisionSnapshot, null);
  assert.equal(detail.job, null);
  assert.deepEqual(detail.captures.map((capture) => capture.challengeIndex), [0, 1, 2, 3, 4]);
  const serialized = JSON.stringify(detail).toLowerCase();
  for (const marker of ["cloudinary", "provider-secret", "cleanupafter", "fingerprint", "base64", "buffer", "embedding", "landmark", "tensor", "geometry"]) assert.equal(serialized.includes(marker), false, marker);
});

test("every exact capture is returned through the protected storage boundary", async () => {
  const data = await fixture("captures");
  for (const challengeIndex of [0, 1, 2, 3, 4]) {
    const capture = await readAdminProfileVerificationCapture({ verificationReference: data.request.verificationReference, challengeIndex, storageReader: reader });
    assert.equal(capture.challengeIndex, challengeIndex);
    assert.deepEqual(capture.bytes, png);
  }
  await assert.rejects(() => readAdminProfileVerificationCapture({ verificationReference: data.request.verificationReference, challengeIndex: 5, storageReader: reader }));
});

test("expired, delete-pending, and cross-attempt evidence cannot be read as the current attempt", async () => {
  const expired = await fixture("expired");
  await (await import("../../models/profileVerificationRequest.model")).ProfileVerificationRequest.updateOne({ _id: expired.request._id }, { $set: { status: "EXPIRED", isActive: false, expiredAt: new Date() } });
  await assert.rejects(() => readAdminProfileVerificationCapture({ verificationReference: expired.request.verificationReference, challengeIndex: 0, storageReader: reader }));

  const deleted = await fixture("deleted");
  await FaceVerificationEvidence.updateOne({ sessionId: deleted.session._id, challengeIndex: 0 }, { $set: { status: "DELETE_PENDING" } });
  await assert.rejects(() => getAdminProfileVerificationDetail(deleted.request.verificationReference));

  const v1 = await fixture("v1");
  const v2 = await fixture("v2");
  await FaceVerificationEvidence.deleteOne({ sessionId: v1.session._id, challengeIndex: 4 });
  await FaceVerificationEvidence.updateOne({ sessionId: v2.session._id, challengeIndex: 4 }, { $set: { sessionId: v1.session._id, verificationRequestId: v1.request._id } });
  await assert.rejects(() => getAdminProfileVerificationDetail(v2.request.verificationReference));
});
