import assert from "node:assert/strict";
import test from "node:test";
import mongoose, { Types } from "mongoose";
import { ImageAdmission } from "../../models/imageAdmission.model";
import { ImageModerationAsset } from "../../models/imageModerationAsset.model";
import { ImageModerationAttempt } from "../../models/imageModerationAttempt.model";
import { FaceVerificationSession } from "../../models/faceVerificationSession.model";
import { UserProfile } from "../../models/userProfile.model";
import { TemporaryImageAssetCleanupService } from "../../services/imageModeration/temporaryImageAssetCleanup.service";
import { imageAdmissionService } from "../../services/imageModeration/imageAdmission.service";
import { connectPhase7HDatabase, clearPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

const hash = "a".repeat(64);
const expired = (now = new Date()) => new Date(now.getTime() - 1_000);
const future = (now = new Date()) => new Date(now.getTime() + 60_000);

const seed = async (input: Partial<{ now: Date; attemptStatus: "PASSED" | "BLOCKED" | "UNAVAILABLE"; assetStatus: "TEMPORARY" | "COMMITTED"; withAdmission: boolean }> = {}) => {
  const now = input.now ?? new Date();
  const actorId = new Types.ObjectId();
  const asset = await ImageModerationAsset.create({
    assetReference: `ima_${new Types.ObjectId()}`,
    actorId,
    contentSha256: hash,
    providerAssetId: `image_ai_temporary/ima_${new Types.ObjectId()}`,
    trustedMediaReference: `https://res.cloudinary.com/demo/image/upload/v1/ima-${new Types.ObjectId()}.jpg`,
    status: input.assetStatus ?? "TEMPORARY",
    expiresAt: expired(now),
    retentionDeadline: future(now),
  });
  const attempt = await ImageModerationAttempt.create({
    attemptReference: `imat_${new Types.ObjectId()}`,
    assetId: asset._id,
    actorId,
    contentSha256: hash,
    surface: "USER_PROFILE_AVATAR",
    entityBinding: `PENDING:${actorId}:USER_PROFILE_AVATAR`,
    status: input.attemptStatus ?? "PASSED",
    provenanceModel: { identifier: "test", revision: "test", artifactSha256: hash },
    policy: { key: "test", version: "test" },
    expiresAt: expired(now),
    retentionDeadline: future(now),
  });
  const admission = input.withAdmission === false ? null : await ImageAdmission.create({
    admissionReference: `imauth_${new Types.ObjectId()}`,
    attemptId: attempt._id,
    assetId: asset._id,
    actorId,
    contentSha256: hash,
    surface: "USER_PROFILE_AVATAR",
    entityBinding: attempt.entityBinding,
    status: "ACTIVE",
    expiresAt: expired(now),
  });
  return { actorId, asset, attempt, admission };
};

const service = (outcomes: Array<"DELETED" | "ALREADY_MISSING" | "RETRYABLE_FAILURE" | "AMBIGUOUS_FAILURE">, calls: string[] = []) =>
  new TemporaryImageAssetCleanupService(undefined, undefined, async (publicId) => {
    calls.push(publicId);
    return outcomes.shift() ?? "DELETED";
  });

test.before(async () => { process.env.NODE_ENV = "test"; await connectPhase7HDatabase(); });
test.beforeEach(clearPhase7HDatabase);
test.after(disconnectPhase7HDatabase);

test("leaves unexpired temporary PASS untouched and does not delete merely for BLOCK or UNAVAILABLE", async () => {
  const now = new Date();
  const calls: string[] = [];
  const unexpired = await seed({ now: new Date(now.getTime() + 60_000) });
  await ImageModerationAsset.updateOne({ _id: unexpired.asset._id }, { $set: { expiresAt: future(now) } });
  const blocked = await seed({ now, attemptStatus: "BLOCKED", withAdmission: false });
  const unavailable = await seed({ now, attemptStatus: "UNAVAILABLE", withAdmission: false });
  const cleanup = service(["DELETED", "DELETED"], calls);
  const first = await cleanup.processBatch({ now, limit: 10 });
  assert.equal(first.results.length, 2);
  assert.equal(calls.length, 2);
  assert.equal((await ImageModerationAsset.findById(unexpired.asset._id))?.status, "TEMPORARY");
  assert.equal((await ImageModerationAsset.findById(blocked.asset._id))?.cleanupStatus, "DELETED");
  assert.equal((await ImageModerationAsset.findById(unavailable.asset._id))?.cleanupStatus, "DELETED");
});

test("deletes an expired abandoned PASS, expires its admission, and is idempotent", async () => {
  const now = new Date();
  const calls: string[] = [];
  const seeded = await seed({ now });
  const cleanup = service(["DELETED"], calls);
  assert.equal((await cleanup.processAsset(seeded.asset._id, now)).kind, "DELETED");
  assert.deepEqual(calls, [seeded.asset.providerAssetId]);
  assert.equal((await ImageModerationAsset.findById(seeded.asset._id))?.status, "EXPIRED");
  assert.equal((await ImageModerationAsset.findById(seeded.asset._id))?.cleanupStatus, "DELETED");
  assert.equal((await ImageAdmission.findById(seeded.admission!._id))?.status, "EXPIRED");
  assert.equal((await cleanup.processAsset(seeded.asset._id, new Date(now.getTime() + 1))).kind, "NOT_DUE");
  assert.equal(calls.length, 1);
});

test("never deletes a committed or actively candidate-bound asset", async () => {
  const now = new Date();
  const calls: string[] = [];
  const committed = await seed({ now, assetStatus: "COMMITTED" });
  const candidate = await seed({ now });
  const profile = await UserProfile.create({ userId: candidate.actorId, username: `candidate-${new Types.ObjectId()}`, dateOfBirth: new Date("1990-01-01"), interests: [], bio: "candidate fixture", avatar: "https://trusted.test/existing-avatar.jpg", cover: "https://trusted.test/cover.jpg", profilePhotos: ["https://trusted.test/one.jpg", "https://trusted.test/two.jpg"], profileStatus: "rejected" });
  await FaceVerificationSession.create({
    sessionReference: `FACE_${new Types.ObjectId()}`,
    userId: candidate.actorId,
    profileId: profile._id,
    profileSubmissionVersion: 1,
    avatarFingerprint: hash,
    avatarCandidate: { kind: "ADMISSION", admissionId: candidate.admission!._id, admissionReference: candidate.admission!.admissionReference, assetId: candidate.asset._id, trustedMediaReference: candidate.asset.trustedMediaReference, contentSha256: hash, fingerprint: hash, expiresAt: future(now) },
    challenges: ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "BLINK"],
    expiresAt: future(now),
  });
  const cleanup = service(["DELETED"], calls);
  assert.equal((await cleanup.processAsset(committed.asset._id, now)).kind, "NOT_DUE");
  assert.equal((await cleanup.processAsset(candidate.asset._id, now)).kind, "PROTECTED");
  assert.equal(calls.length, 0);
  assert.equal((await ImageModerationAsset.findById(candidate.asset._id))?.cleanupStatus, "RETRY_WAIT");
});

test("does not delete an expired temporary asset still referenced by an authoritative profile field", async () => {
  const now = new Date();
  const calls: string[] = [];
  const seeded = await seed({ now });
  await UserProfile.create({ userId: seeded.actorId, username: `reference-${new Types.ObjectId()}`, interests: [], bio: "", avatar: seeded.asset.trustedMediaReference, cover: "", profilePhotos: [], profileStatus: "incomplete" });
  assert.equal((await service(["DELETED"], calls).processAsset(seeded.asset._id, now)).kind, "PROTECTED");
  assert.equal(calls.length, 0);
});

test("concurrent workers reserve one expired asset and retry known provider failures safely", async () => {
  const now = new Date();
  const calls: string[] = [];
  const seeded = await seed({ now });
  const cleanup = service(["RETRYABLE_FAILURE", "DELETED"], calls);
  const [first, second] = await Promise.all([cleanup.processAsset(seeded.asset._id, now), cleanup.processAsset(seeded.asset._id, now)]);
  assert.equal([first.kind, second.kind].filter((kind) => kind === "RETRY_SCHEDULED").length, 1);
  assert.equal(calls.length, 1);
  const waiting = await ImageModerationAsset.findById(seeded.asset._id);
  assert.equal(waiting?.cleanupStatus, "RETRY_WAIT");
  assert.ok(waiting?.cleanupNextAttemptAt);
  assert.equal((await cleanup.processAsset(seeded.asset._id, waiting!.cleanupNextAttemptAt!)).kind, "DELETED");
  assert.equal(calls.length, 2);
});

test("cleanup and admission promotion cannot both win", async () => {
  const actualNow = new Date();
  const cleanupNow = new Date(actualNow.getTime() + 60_000);
  const seeded = await seed({ now: cleanupNow });
  await ImageModerationAsset.updateOne({ _id: seeded.asset._id }, { $set: { expiresAt: new Date(actualNow.getTime() + 30_000) } });
  await ImageAdmission.updateOne({ _id: seeded.admission!._id }, { $set: { expiresAt: new Date(actualNow.getTime() + 30_000) } });
  const calls: string[] = [];
  const cleanup = service(["DELETED"], calls);
  const session = await mongoose.startSession();
  const consume = session.withTransaction(() => imageAdmissionService.consumeAdmissionReferenceInSession({
    session,
    admissionReference: seeded.admission!.admissionReference,
    actorId: seeded.actorId,
    expectedSurface: "USER_PROFILE_AVATAR",
    destinationBinding: "USER_PROFILE:test:avatar",
    now: actualNow,
  }));
  const [cleanupResult, consumeResult] = await Promise.allSettled([cleanup.processAsset(seeded.asset._id, cleanupNow), consume]);
  await session.endSession();
  const asset = await ImageModerationAsset.findById(seeded.asset._id);
  const consumed = consumeResult.status === "fulfilled";
  assert.ok(cleanupResult.status === "fulfilled");
  assert.ok(!(consumed && calls.length > 0));
  assert.ok(asset?.status === "COMMITTED" || asset?.status === "EXPIRED");
});

test("contains ambiguous provider outcomes without automatic deletion retries", async () => {
  const now = new Date();
  const calls: string[] = [];
  const seeded = await seed({ now });
  const cleanup = service(["AMBIGUOUS_FAILURE"], calls);
  assert.equal((await cleanup.processAsset(seeded.asset._id, now)).kind, "AMBIGUOUS");
  assert.equal((await ImageModerationAsset.findById(seeded.asset._id))?.cleanupStatus, "DELETE_UNKNOWN");
  assert.equal((await cleanup.processAsset(seeded.asset._id, new Date(now.getTime() + 60_000))).kind, "NOT_DUE");
  assert.equal(calls.length, 1);
});

test("releases a caller-owned PASS temporary asset before expiry and retires its admission", async () => {
  const now = new Date();
  const calls: string[] = [];
  const seeded = await seed({ now: new Date(now.getTime() + 60_000) });
  await ImageModerationAsset.updateOne({ _id: seeded.asset._id }, { $set: { expiresAt: future(now) } });
  await ImageAdmission.updateOne({ _id: seeded.admission!._id }, { $set: { expiresAt: future(now) } });
  const result = await service(["DELETED"], calls).requestRelease({ actorId: seeded.actorId, assetReference: seeded.asset.assetReference, surface: "USER_PROFILE_AVATAR", now });
  assert.equal(result.result.kind, "DELETED");
  assert.deepEqual(calls, [seeded.asset.providerAssetId]);
  assert.equal((await ImageAdmission.findById(seeded.admission!._id))?.status, "INVALIDATED");
  assert.ok((await ImageModerationAsset.findById(seeded.asset._id))?.releaseRequestedAt);
});

test("releases caller-owned BLOCK and UNAVAILABLE temporary assets without an admission", async () => {
  const now = new Date();
  const calls: string[] = [];
  const blocked = await seed({ now: new Date(now.getTime() + 60_000), attemptStatus: "BLOCKED", withAdmission: false });
  const unavailable = await seed({ now: new Date(now.getTime() + 60_000), attemptStatus: "UNAVAILABLE", withAdmission: false });
  await ImageModerationAsset.updateMany({ _id: { $in: [blocked.asset._id, unavailable.asset._id] } }, { $set: { expiresAt: future(now) } });
  const cleanup = service(["DELETED", "ALREADY_MISSING"], calls);
  assert.equal((await cleanup.requestRelease({ actorId: blocked.actorId, assetReference: blocked.asset.assetReference, surface: "USER_PROFILE_AVATAR", now })).result.kind, "DELETED");
  assert.equal((await cleanup.requestRelease({ actorId: unavailable.actorId, assetReference: unavailable.asset.assetReference, surface: "USER_PROFILE_AVATAR", now })).result.kind, "ALREADY_MISSING");
  assert.equal(calls.length, 2);
});

test("denies foreign, forged, and committed temporary-release requests without touching unrelated assets", async () => {
  const now = new Date();
  const seeded = await seed({ now: new Date(now.getTime() + 60_000) });
  const committed = await seed({ now: new Date(now.getTime() + 60_000), assetStatus: "COMMITTED" });
  const cleanup = service([]);
  await assert.rejects(() => cleanup.requestRelease({ actorId: new Types.ObjectId(), assetReference: seeded.asset.assetReference, surface: "USER_PROFILE_AVATAR", now }), { code: "NOT_AVAILABLE" });
  await assert.rejects(() => cleanup.requestRelease({ actorId: seeded.actorId, assetReference: "ima_forged", surface: "USER_PROFILE_AVATAR", now }), { code: "NOT_AVAILABLE" });
  await assert.rejects(() => cleanup.requestRelease({ actorId: committed.actorId, assetReference: committed.asset.assetReference, surface: "USER_PROFILE_AVATAR", now }), { code: "COMMITTED" });
  assert.equal((await ImageModerationAsset.findById(seeded.asset._id))?.releaseRequestedAt, undefined);
});

test("makes duplicate release idempotent and protects an active admission candidate", async () => {
  const now = new Date();
  const calls: string[] = [];
  const seeded = await seed({ now: new Date(now.getTime() + 60_000) });
  await ImageModerationAsset.updateOne({ _id: seeded.asset._id }, { $set: { expiresAt: future(now) } });
  await ImageAdmission.updateOne({ _id: seeded.admission!._id }, { $set: { expiresAt: future(now) } });
  const profile = await UserProfile.create({ userId: seeded.actorId, username: `release-${new Types.ObjectId()}`, dateOfBirth: new Date("1990-01-01"), interests: [], bio: "candidate fixture", avatar: "https://trusted.test/avatar.jpg", cover: "https://trusted.test/cover.jpg", profilePhotos: ["https://trusted.test/one.jpg", "https://trusted.test/two.jpg"], profileStatus: "rejected" });
  await FaceVerificationSession.create({ sessionReference: `FACE_${new Types.ObjectId()}`, userId: seeded.actorId, profileId: profile._id, profileSubmissionVersion: 1, avatarFingerprint: hash, avatarCandidate: { kind: "ADMISSION", admissionId: seeded.admission!._id, admissionReference: seeded.admission!.admissionReference, assetId: seeded.asset._id, trustedMediaReference: seeded.asset.trustedMediaReference, contentSha256: hash, fingerprint: hash, expiresAt: future(now) }, challenges: ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "BLINK"], expiresAt: future(now) });
  const cleanup = service(["DELETED"], calls);
  assert.equal((await cleanup.requestRelease({ actorId: seeded.actorId, assetReference: seeded.asset.assetReference, surface: "USER_PROFILE_AVATAR", now })).result.kind, "PROTECTED");
  assert.equal((await cleanup.requestRelease({ actorId: seeded.actorId, assetReference: seeded.asset.assetReference, surface: "USER_PROFILE_AVATAR", now: new Date(now.getTime() + 1) })).result.kind, "NOT_DUE");
  assert.equal(calls.length, 0);
});
