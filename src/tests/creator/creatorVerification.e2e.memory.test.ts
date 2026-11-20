import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import mongoose from "mongoose";
import http from "node:http";
import jwt from "jsonwebtoken";
import app from "../../app";
import { createAuthSession } from "../../services/authSession.service";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import User from "../../models/User";
import { CreatorApplication } from "../../models/creatorApplication.model";
import { CreatorProfile } from "../../models/creatorProfile.model";
import { UserProfile } from "../../models/userProfile.model";
import { FaceVerificationSession } from "../../models/faceVerificationSession.model";
import { FaceVerificationEvidence } from "../../models/faceVerificationEvidence.model";
import { ProfileVerificationRequest } from "../../models/profileVerificationRequest.model";
import { ProfileVerificationJob } from "../../models/profileVerificationJob.model";
import { ProfileVerificationInferenceResult } from "../../models/profileVerificationInferenceResult.model";
import { ImageModerationAsset } from "../../models/imageModerationAsset.model";
import { ProviderAssetGuard } from "../../models/providerAssetGuard.model";
import { ProviderAssetReference } from "../../models/providerAssetReference.model";
import { startCreatorVerificationSession, getOwnedCreatorVerificationSession, acceptCreatorVerificationCapture, submitCreatorVerificationRequest, creatorVerificationStatus } from "../../services/creator/creatorVerification.service";
import { getAdminCreatorVerificationCase, listAdminCreatorVerificationCases, readAdminCreatorVerificationCapture } from "../../services/creator/creatorVerificationAdminRead.service";
import { processNextProfileVerificationJob } from "../../services/profile/profileVerificationJob.service";
import { ProfileVerificationInferenceAdapter } from "../../services/profile/profileVerificationInferenceAdapter";
import { approveCreatorApplication } from "../../controllers/adminCreatorApproval.controller";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const binary = "D:/StHn/backend/node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe";
const storage = new Map<string, Buffer>();
let replicaSet: MongoMemoryReplSet;
const originalEnabled = process.env.STHN_CREATOR_VERIFICATION_ENABLED;
const originalTransition = process.env.STHN_CREATOR_VERIFICATION_INDEX_TRANSITION_READY;
const originalPolicy = process.env.STHN_PROFILE_VERIFICATION_POLICY;

const restore = (key: string, value: string | undefined) => {
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
};

const storedEvidence = async ({ buffer, publicId }: { buffer: Buffer; publicId: string }) => {
  storage.set(publicId, Buffer.from(buffer));
  return { publicId, bytes: buffer.length, format: "png", mimeType: "image/png" };
};

const evidenceReader = async ({ publicId }: { publicId: string }) => {
  const bytes = storage.get(publicId);
  if (!bytes) throw new Error("controlled evidence was not stored");
  return { bytes: Buffer.from(bytes), byteLength: bytes.length, contentType: "image/png" };
};

const inferenceAdapter: ProfileVerificationInferenceAdapter = {
  pipelineManifest: { kind: "TEST_SYNTHETIC", pipelineVersion: "CREATOR_E2E_V1", runtimeIdentifier: "STHN_TEST_ADAPTER_ONLY", runtimeVersion: "1" },
  infer: async (descriptor) => ({
    findings: {
      captures: descriptor.captures.map((capture) => ({ challengeIndex: capture.challengeIndex, challenge: capture.challenge, faceCount: "ONE" as const, usability: "USABLE" as const, reasonCodes: [] })),
      crossCapture: { status: "CONSISTENT" as const, usableCaptureCount: 5, outlierCaptureCount: 0 },
      avatar: { status: "MATCH_SUPPORTED" as const }, antiSpoof: { status: "NOT_RUN" as const },
    },
  }),
};

const createDirectFixture = async (suffix: string) => {
  const user = await User.create({ email: `creator-e2e-${suffix}@example.test`, password: "test", role: "user", status: "pending_profile", creatorStatus: "none", governanceState: "ACTIVE", creatorOnboardingIntent: "direct_creator", realName: "Direct Applicant", dateOfBirth: new Date("1990-01-01"), mobileCountryCode: "+91", mobileNumber: `900000${suffix.slice(-4).padStart(4, "0")}` });
  const application = await CreatorApplication.create({ userId: user._id, applicationJourney: "direct_creator", draftVersion: 1, verificationRevision: 1, displayName: `Direct Creator ${suffix}`, primaryCategory: "Music", country: "IN", city: "Kolkata", currency: "INR", services: [], publicBio: "Direct creator biography", languages: ["English"], avatarUrl: `https://trusted.example/${suffix}-avatar.jpg`, coverUrl: `https://trusted.example/${suffix}-cover.jpg`, media: [`https://trusted.example/${suffix}-gallery-1.jpg`, `https://trusted.example/${suffix}-gallery-2.jpg`], status: "draft", rejectionReason: "" });
  const media = [{ slot: "avatar", reference: application.avatarUrl! }, { slot: "cover", reference: application.coverUrl! }, ...application.media!.map((reference, index) => ({ slot: `media:${index}`, reference }))];
  for (const [index, item] of media.entries()) {
    const asset = await ImageModerationAsset.create({ assetReference: `creator-e2e-asset-${suffix}-${index}`, actorId: user._id, contentSha256: `${index}`.repeat(64), providerAssetId: `creator-e2e-provider-${suffix}-${index}`, trustedMediaReference: item.reference, status: "COMMITTED", expiresAt: new Date(Date.now() + 86_400_000), retentionDeadline: new Date(Date.now() + 86_400_000), committedAt: new Date(), committedEntityBinding: `CREATOR_APPLICATION:${application._id}:${item.slot}`, cleanupStatus: "PENDING", cleanupAttemptCount: 0 });
    const guard = await ProviderAssetGuard.create({ provider: "CLOUDINARY", providerAssetId: asset.providerAssetId, resourceType: "image", state: "ACTIVE", generation: 1, currentReferenceCount: 1 });
    await ProviderAssetReference.create({ guardId: guard._id, entityType: "CREATOR_APPLICATION", entityId: application._id, slot: item.slot, authoritativeReference: item.reference, imageModerationAssetId: asset._id, state: "CURRENT", generation: 1, acquiredAt: new Date() });
  }
  return { user, application };
};

const createVerifiedUpgradeFixture = async (suffix: string) => {
  const user = await User.create({ email: `creator-upgrade-${suffix}@example.test`, password: "test", role: "user", status: "active", creatorStatus: "none", governanceState: "ACTIVE" });
  await UserProfile.create({ userId: user._id, username: `creator-upgrade-${suffix}`, dateOfBirth: new Date("1990-01-01"), interests: ["Music"], bio: "Verified User profile", avatar: "https://trusted.example/user-avatar.jpg", cover: "https://trusted.example/user-cover.jpg", profilePhotos: ["https://trusted.example/user-gallery-1.jpg", "https://trusted.example/user-gallery-2.jpg"], profileStatus: "verified", verificationSubmissionVersion: 1 });
  const application = await CreatorApplication.create({ userId: user._id, applicationJourney: "user_upgrade", draftVersion: 1, verificationRevision: 1, displayName: `Upgrade Creator ${suffix}`, primaryCategory: "Music", country: "IN", city: "Kolkata", currency: "INR", services: [], publicBio: "Verified User Creator biography", languages: ["English"], avatarUrl: `https://trusted.example/${suffix}-avatar.jpg`, coverUrl: `https://trusted.example/${suffix}-cover.jpg`, media: [`https://trusted.example/${suffix}-gallery-1.jpg`, `https://trusted.example/${suffix}-gallery-2.jpg`], status: "draft", rejectionReason: "" });
  return { user, application };
};

before(async () => {
  process.env.STHN_CREATOR_VERIFICATION_ENABLED = "true";
  process.env.STHN_CREATOR_VERIFICATION_INDEX_TRANSITION_READY = "true";
  process.env.STHN_PROFILE_VERIFICATION_POLICY = "LEGACY_AVATAR_ONLY_V1";
  replicaSet = await MongoMemoryReplSet.create({ binary: { systemBinary: binary }, replSet: { count: 1 } });
  const uri = replicaSet.getUri("creator-verification-e2e-isolated");
  assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:/);
  assert.doesNotMatch(uri, /sthn_db|mongodb\.net/i);
  await mongoose.connect(uri);
  await Promise.all([User.init(), UserProfile.init(), CreatorApplication.init(), CreatorProfile.init(), FaceVerificationSession.init(), FaceVerificationEvidence.init(), ProfileVerificationRequest.init(), ProfileVerificationJob.init(), ProfileVerificationInferenceResult.init(), ImageModerationAsset.init(), ProviderAssetGuard.init(), ProviderAssetReference.init()]);
  await Promise.all([
    FaceVerificationSession.collection.dropIndex("one_current_face_verification_session").catch(() => undefined),
    ProfileVerificationRequest.collection.dropIndex("one_active_profile_verification_request").catch(() => undefined),
  ]);
  await FaceVerificationSession.collection.createIndex({ targetType: 1, targetId: 1 }, { unique: true, partialFilterExpression: { isCurrent: true, targetType: { $exists: true }, targetId: { $exists: true } }, name: "one_current_face_verification_target_session" });
  await ProfileVerificationRequest.collection.createIndex({ targetType: 1, targetId: 1 }, { unique: true, partialFilterExpression: { isActive: true, targetType: { $exists: true }, targetId: { $exists: true } }, name: "one_active_target_verification_request" });
}, { timeout: 60_000 });

after(async () => {
  await mongoose.disconnect();
  await replicaSet.stop();
  restore("STHN_CREATOR_VERIFICATION_ENABLED", originalEnabled);
  restore("STHN_CREATOR_VERIFICATION_INDEX_TRANSITION_READY", originalTransition);
  restore("STHN_PROFILE_VERIFICATION_POLICY", originalPolicy);
}, { timeout: 60_000 });

test("verified User Creator verification persists an advisory result without granting Creator privileges", async () => {
  const fixture = await createVerifiedUpgradeFixture("complete");
  const [first, second] = await Promise.all([startCreatorVerificationSession(String(fixture.user._id)), startCreatorVerificationSession(String(fixture.user._id))]);
  assert.equal(String(first._id), String(second._id));
  await assert.rejects(() => getOwnedCreatorVerificationSession({ userId: String(new mongoose.Types.ObjectId()), sessionReference: first.sessionReference }), /Creator application not found/);

  const firstCapture = await acceptCreatorVerificationCapture({ userId: String(fixture.user._id), sessionReference: first.sessionReference, challengeIndex: "0", file: { buffer: png } as Express.Multer.File, storeEvidence: storedEvidence });
  const duplicate = await acceptCreatorVerificationCapture({ userId: String(fixture.user._id), sessionReference: first.sessionReference, challengeIndex: "0", file: { buffer: png } as Express.Multer.File, storeEvidence: storedEvidence });
  assert.equal(firstCapture.replayed, false); assert.equal(duplicate.replayed, true);
  for (const challengeIndex of [1, 2, 3, 4]) await acceptCreatorVerificationCapture({ userId: String(fixture.user._id), sessionReference: first.sessionReference, challengeIndex: String(challengeIndex), file: { buffer: png } as Express.Multer.File, storeEvidence: storedEvidence });

  const request = await submitCreatorVerificationRequest(String(fixture.user._id));
  assert.ok(request); assert.equal(request!.targetType, "CREATOR_APPLICATION"); assert.equal(request!.status, "PENDING");
  const beforeWorker = await creatorVerificationStatus(String(fixture.user._id));
  assert.equal(beforeWorker.lifecycle, "QUEUED");
  const worker = await processNextProfileVerificationJob({ workerId: "creator-e2e-worker", adapterFactory: () => inferenceAdapter });
  assert.equal(worker?.completed, true); assert.ok(worker?.result);

  const status = await creatorVerificationStatus(String(fixture.user._id));
  assert.equal(status.lifecycle, "COMPLETED"); assert.equal(status.inference?.completed, true);
  const detail = await getAdminCreatorVerificationCase(request!.verificationReference);
  assert.equal(detail.targetType, "CREATOR_APPLICATION"); assert.equal(detail.lifecycle.lifecycle, "COMPLETED"); assert.equal(detail.session.acceptedCaptureCount, 5); assert.equal(detail.captures.length, 5); assert.equal(detail.inference?.pipeline.kind, "TEST_SYNTHETIC");
  const listed = await listAdminCreatorVerificationCases("all");
  assert.equal(listed.some((item) => item.verificationReference === request!.verificationReference), true);
  await ProfileVerificationRequest.collection.insertOne({ verificationReference: "CREATOR_VERIFICATION_MALFORMED_TEST", userId: fixture.user._id, targetType: "CREATOR_APPLICATION", attemptNumber: 1, profileSubmissionVersion: 1, status: "PENDING", isActive: true, submittedAt: new Date(), createdAt: new Date(), updatedAt: new Date() });
  const withoutMalformed = await listAdminCreatorVerificationCases("all");
  assert.equal(withoutMalformed.some((item) => item.verificationReference === "CREATOR_VERIFICATION_MALFORMED_TEST"), false);
  await assert.rejects(() => getAdminCreatorVerificationCase("CREATOR_VERIFICATION_MALFORMED_TEST"), /Creator verification request not found/);
  for (let index = 0; index < 5; index++) {
    const capture = await readAdminCreatorVerificationCapture(request!.verificationReference, index, evidenceReader);
    assert.equal(capture.challengeIndex, index);
    assert.equal(capture.mimeType, "image/png");
    assert.deepEqual(capture.bytes, png);
    assert.equal(detail.captures[index].viewPath, `/api/v1/admin/creator-verification/${request!.verificationReference}/captures/${index}`);
  }
  await assert.rejects(() => readAdminCreatorVerificationCapture(request!.verificationReference, 5, evidenceReader));
  await assert.rejects(() => readAdminCreatorVerificationCapture(request!.verificationReference, 0, async () => { throw new Error("missing asset"); }), /retrieval failed/i);
  await CreatorApplication.updateOne({ _id: fixture.application._id }, { $inc: { verificationRevision: 1 } });
  await assert.rejects(() => readAdminCreatorVerificationCapture(request!.verificationReference, 0, evidenceReader), /not found/i);
  await CreatorApplication.updateOne({ _id: fixture.application._id }, { $inc: { verificationRevision: -1 } });
  await CreatorApplication.updateOne({ _id: fixture.application._id }, { $set: { userId: new mongoose.Types.ObjectId() } });
  await assert.rejects(() => readAdminCreatorVerificationCapture(request!.verificationReference, 0, evidenceReader), /not found/i);
  await CreatorApplication.updateOne({ _id: fixture.application._id }, { $set: { userId: fixture.user._id } });

  let approvalCode = 0;
  await approveCreatorApplication({ params: { applicationId: String(fixture.application._id) }, user: { id: String(fixture.user._id) } } as never, { status: (statusCode: number) => { approvalCode = statusCode; return { json: () => undefined }; } } as never);
  assert.equal(approvalCode, 400);
  const [account, application, profile] = await Promise.all([User.findById(fixture.user._id).lean(), CreatorApplication.findById(fixture.application._id).lean(), CreatorProfile.findOne({ userId: fixture.user._id }).lean()]);
  assert.equal(account?.role, "user"); assert.equal(account?.creatorStatus, "pending"); assert.equal(application?.status, "submitted"); assert.equal(profile, null);
});

test("a stale Creator submission fails closed into advisory review instead of a completed job with a processing request", async () => {
  const fixture = await createVerifiedUpgradeFixture("worker-stale");
  const session = await startCreatorVerificationSession(String(fixture.user._id));
  for (const challengeIndex of [0, 1, 2, 3, 4]) {
    await acceptCreatorVerificationCapture({ userId: String(fixture.user._id), sessionReference: session.sessionReference, challengeIndex: String(challengeIndex), file: { buffer: png } as Express.Multer.File, storeEvidence: storedEvidence });
  }
  const request = await submitCreatorVerificationRequest(String(fixture.user._id));
  assert.ok(request);
  // Simulate immutable evidence from a stale pre-submission version. The
  // worker must not present this as successful processing.
  await FaceVerificationSession.updateOne({ _id: session._id }, { $set: { profileSubmissionVersion: 999 } });

  const worker = await processNextProfileVerificationJob({ workerId: "creator-stale-worker", adapterFactory: () => inferenceAdapter });
  assert.equal(worker?.completed, false);

  const [persistedRequest, job, inference, status] = await Promise.all([
    ProfileVerificationRequest.findById(request!._id).lean(),
    ProfileVerificationJob.findOne({ verificationRequestId: request!._id }).lean(),
    ProfileVerificationInferenceResult.findOne({ verificationRequestId: request!._id }).lean(),
    creatorVerificationStatus(String(fixture.user._id)),
  ]);
  assert.equal(persistedRequest?.status, "ADMIN_REVIEW_REQUIRED");
  assert.equal(job?.status, "FAILED");
  assert.equal(job?.lastErrorCode, "STALE_SUBMISSION");
  assert.equal(inference, null);
  assert.equal(status.lifecycle, "AWAITING_ADMIN_REVIEW");
});

test("revision changes invalidate prior Creator sessions and expired sessions reject captures", async () => {
  const fixture = await createVerifiedUpgradeFixture("stale");
  const session = await startCreatorVerificationSession(String(fixture.user._id));
  await CreatorApplication.updateOne({ _id: fixture.application._id }, { $set: { verificationRevision: 2 } });
  await assert.rejects(() => submitCreatorVerificationRequest(String(fixture.user._id)), /five fresh live face captures/i);
  const replacement = await startCreatorVerificationSession(String(fixture.user._id));
  assert.notEqual(replacement.sessionReference, session.sessionReference);
  await FaceVerificationSession.updateOne({ _id: replacement._id }, { $set: { expiresAt: new Date(Date.now() - 1) } });
  await assert.rejects(() => acceptCreatorVerificationCapture({ userId: String(fixture.user._id), sessionReference: replacement.sessionReference, challengeIndex: "0", file: { buffer: png } as Express.Multer.File, storeEvidence: storedEvidence }), /not accepting captures/i);
});

test("verified User upgrades use the same Creator capture session service", async () => {
  const fixture = await createVerifiedUpgradeFixture("session");
  const session = await startCreatorVerificationSession(String(fixture.user._id));
  assert.equal(session.targetType, "CREATOR_APPLICATION");
  assert.equal(String(session.targetId), String(fixture.application._id));
  assert.equal(session.requiredCaptureCount, 5);
});

test("verified User Creator captures submit and produce an advisory worker result", async () => {
  const fixture = await createVerifiedUpgradeFixture("upgrade-e2e");
  const session = await startCreatorVerificationSession(String(fixture.user._id));
  const other = await createVerifiedUpgradeFixture("other-owner");
  await assert.rejects(() => getOwnedCreatorVerificationSession({ userId: String(other.user._id), sessionReference: session.sessionReference }), /not found/i);
  await assert.rejects(() => submitCreatorVerificationRequest(String(fixture.user._id)), /five fresh live face captures/i);
  for (let index = 0; index < 5; index++) await acceptCreatorVerificationCapture({ userId: String(fixture.user._id), sessionReference: session.sessionReference, challengeIndex: String(index), file: { buffer: png } as Express.Multer.File, storeEvidence: storedEvidence });
  const request = await submitCreatorVerificationRequest(String(fixture.user._id));
  assert.ok(request);
  const replay = await submitCreatorVerificationRequest(String(fixture.user._id));
  assert.equal(String(replay?._id), String(request._id));
  assert.equal(await ProfileVerificationJob.countDocuments({ verificationRequestId: request._id }), 1);
  const result = await processNextProfileVerificationJob({ workerId: "upgrade-worker", adapterFactory: () => inferenceAdapter });
  assert.equal(result?.completed, true);
  assert.ok(result?.result);
  assert.equal((await creatorVerificationStatus(String(fixture.user._id))).lifecycle, "COMPLETED");
  const detail = await getAdminCreatorVerificationCase(request.verificationReference);
  assert.equal(detail.captures.length, 5);
  assert.equal(detail.inference?.pipeline.kind, "TEST_SYNTHETIC");
  assert.equal((await UserProfile.findOne({ userId: fixture.user._id }))?.profileStatus, "verified");
  assert.equal((await User.findById(fixture.user._id))?.role, "user");
  assert.equal(await CreatorProfile.countDocuments({ userId: fixture.user._id }), 0);
});

test("direct Creator capture remains ineligible", async () => {
  const fixture = await createDirectFixture("direct-denied");
  await assert.rejects(() => startCreatorVerificationSession(String(fixture.user._id)), /not eligible/i);
});

test("mismatched Creator job ownership fails without running inference or changing User verification", async () => {
  const fixture = await createVerifiedUpgradeFixture("bad-job-owner");
  const session = await startCreatorVerificationSession(String(fixture.user._id));
  for (let index = 0; index < 5; index++) await acceptCreatorVerificationCapture({ userId: String(fixture.user._id), sessionReference: session.sessionReference, challengeIndex: String(index), file: { buffer: png } as Express.Multer.File, storeEvidence: storedEvidence });
  const request = await submitCreatorVerificationRequest(String(fixture.user._id));
  assert.ok(request);
  await ProfileVerificationJob.updateOne({ verificationRequestId: request._id }, { $set: { ownerUserId: new mongoose.Types.ObjectId() } });
  let calls = 0;
  const result = await processNextProfileVerificationJob({ workerId: "mismatch-worker", adapterFactory: () => ({ ...inferenceAdapter, infer: async (input) => { calls++; return inferenceAdapter.infer(input); } }) });
  assert.equal(result?.completed, false);
  assert.equal(calls, 0);
  assert.equal(await ProfileVerificationInferenceResult.countDocuments({ verificationRequestId: request._id }), 0);
  assert.equal((await UserProfile.findOne({ userId: fixture.user._id }))?.profileStatus, "verified");
});

test("application HTTP submission rejects missing Creator face captures", async () => {
  const fixture = await createVerifiedUpgradeFixture("http-missing");
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "isolated-creator-upgrade-test-secret";
  const auth = await createAuthSession(String(fixture.user._id));
  const token = jwt.sign({ id: String(fixture.user._id), role: "user", sid: String(auth._id) }, process.env.JWT_SECRET);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/creator-applications`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({}) });
    assert.equal(response.status, 409);
    assert.equal((await CreatorApplication.findById(fixture.application._id))?.status, "draft");
    assert.equal(await ProfileVerificationRequest.countDocuments({ targetId: fixture.application._id }), 0);
    const forbidden = await fetch(`http://127.0.0.1:${address.port}/api/v1/admin/creator-verification/not-a-reference/captures/0`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(forbidden.status, 403);
    const anonymous = await fetch(`http://127.0.0.1:${address.port}/api/v1/admin/creator-verification/not-a-reference/captures/0`);
    assert.equal(anonymous.status, 401);
    // New bounded advisory fields inherit both existing Admin authorization boundaries.
    for (const route of ["profile-verification", "creator-verification"]) {
      const detailUrl: string = `http://127.0.0.1:${address.port}/api/v1/admin/${route}/not-a-reference`;
      assert.equal((await fetch(detailUrl)).status, 401);
      assert.equal((await fetch(detailUrl, { headers: { authorization: `Bearer ${token}` } })).status, 403);
    }
    const oldDirect = await fetch(`http://127.0.0.1:${address.port}/api/v1/creator-applications/me/face-verification/session`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
    assert.equal(oldDirect.status, 404);
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); restore("JWT_SECRET", previous); }
});
