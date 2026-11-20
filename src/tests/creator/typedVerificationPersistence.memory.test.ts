import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import { FaceVerificationEvidence } from "../../models/faceVerificationEvidence.model";
import { FaceVerificationSession } from "../../models/faceVerificationSession.model";
import { ProfileVerificationInferenceResult } from "../../models/profileVerificationInferenceResult.model";
import { ProfileVerificationJob } from "../../models/profileVerificationJob.model";
import { ProfileVerificationRequest } from "../../models/profileVerificationRequest.model";
import { faceVerificationEvidenceRepository } from "../../repositories/faceVerificationEvidence.repository";
import { faceVerificationSessionRepository } from "../../repositories/faceVerificationSession.repository";
import { profileVerificationInferenceResultRepository } from "../../repositories/profileVerificationInferenceResult.repository";
import { profileVerificationJobRepository } from "../../repositories/profileVerificationJob.repository";
import { profileVerificationRequestRepository } from "../../repositories/profileVerificationRequest.repository";
import { VerificationTarget } from "../../services/creator/creatorVerificationTarget";

const hash = (character: string) => character.repeat(64);
let memoryServer: MongoMemoryServer;

const target = (targetType: VerificationTarget["targetType"] = "CREATOR_APPLICATION"): VerificationTarget => ({
  targetType,
  targetId: new Types.ObjectId(),
  ownerUserId: new Types.ObjectId(),
  verificationRevision: 1,
  avatarReference: "creator-avatar-reference",
  avatarFingerprint: hash("a"),
});

const submittedMedia = () => ({
  avatar: { role: "AVATAR" as const, sourceReference: "avatar", fingerprint: hash("a") },
  cover: { role: "COVER" as const, sourceReference: "cover", fingerprint: hash("b") },
  profilePhotos: [0, 1].map((profilePhotoIndex) => ({ role: "PROFILE_PHOTO" as const, profilePhotoIndex, sourceReference: `gallery-${profilePhotoIndex}`, fingerprint: hash(String(profilePhotoIndex + 1)) })),
});

before(async () => {
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(`${memoryServer.getUri()}typed-verification-persistence`);
  await Promise.all([FaceVerificationSession.init(), FaceVerificationEvidence.init(), ProfileVerificationRequest.init(), ProfileVerificationJob.init(), ProfileVerificationInferenceResult.init()]);
  await Promise.all([
    FaceVerificationSession.collection.dropIndex("one_current_face_verification_session").catch(() => undefined),
    ProfileVerificationRequest.collection.dropIndex("one_active_profile_verification_request").catch(() => undefined),
  ]);
  await FaceVerificationSession.collection.createIndex({ targetType: 1, targetId: 1 }, { unique: true, partialFilterExpression: { isCurrent: true, targetType: { $exists: true }, targetId: { $exists: true } }, name: "one_current_face_verification_target_session" });
  await ProfileVerificationRequest.collection.createIndex({ targetType: 1, targetId: 1 }, { unique: true, partialFilterExpression: { isActive: true, targetType: { $exists: true }, targetId: { $exists: true } }, name: "one_active_target_verification_request" });
});

after(async () => {
  await mongoose.disconnect();
  await memoryServer.stop();
});

test("typed creator verification records retain target metadata and reject target/version mismatches", async () => {
  const creatorTarget = target();
  const session = await faceVerificationSessionRepository.createForTarget({
    ...creatorTarget, sessionReference: "creator-session-1", challenges: ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "BLINK"], expiresAt: new Date(Date.now() + 60_000),
  });
  assert.equal(session.profileId, undefined);
  assert.equal(String(session.targetId), String(creatorTarget.targetId));

  await assert.rejects(
    faceVerificationSessionRepository.createForTarget({ ...creatorTarget, sessionReference: "creator-session-duplicate", challenges: ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "BLINK"], expiresAt: new Date(Date.now() + 60_000) }),
    (error: unknown) => Boolean(error && typeof error === "object" && (error as { code?: number }).code === 11000),
  );

  const evidence = await faceVerificationEvidenceRepository.createTargetReservation({ ...creatorTarget, evidenceReference: "creator-evidence-1", sessionId: session._id, challengeIndex: 0, challenge: "NEUTRAL", cloudinaryPublicId: "creator-evidence-public-1" });
  assert.equal(evidence.profileId, undefined);
  await assert.rejects(
    faceVerificationEvidenceRepository.createTargetReservation({ ...creatorTarget, evidenceReference: "creator-evidence-duplicate", sessionId: session._id, challengeIndex: 0, challenge: "NEUTRAL", cloudinaryPublicId: "creator-evidence-public-duplicate" }),
    (error: unknown) => Boolean(error && typeof error === "object" && (error as { code?: number }).code === 11000),
  );

  const request = await profileVerificationRequestRepository.createForTarget({ ...creatorTarget, verificationReference: "creator-request-1", attemptNumber: 1, submittedAt: new Date(), submittedMedia: submittedMedia(), verificationPolicy: { key: "GATED_MULTI_MEDIA", version: "V2" } });
  assert.equal(request.profileId, undefined);
  const job = await profileVerificationJobRepository.createForTarget({ ...creatorTarget, jobReference: "creator-job-1", verificationRequestId: request._id, nextAttemptAt: new Date() });
  assert.equal(job.profileId, undefined);
  assert.equal(await profileVerificationJobRepository.claimNext("ineligible-worker", new Date(), new Date(Date.now() + 60_000)), null);
  const claimed = await profileVerificationJobRepository.claimNext("isolated-memory-worker", new Date(), new Date(Date.now() + 60_000), [creatorTarget.targetId]);
  assert.equal(String(claimed?.targetId), String(creatorTarget.targetId));
  const retried = await profileVerificationJobRepository.scheduleRetry({ jobId: job._id, workerId: "isolated-memory-worker", nextAttemptAt: new Date(Date.now() + 1_000), errorCode: "ISOLATED_TEST" });
  assert.equal(retried?.status, "RETRY_WAIT");
  assert.equal(retried?.verificationRevision, creatorTarget.verificationRevision);
  await assert.rejects(profileVerificationJobRepository.createForTarget({ ...creatorTarget, verificationRevision: 2, jobReference: "creator-job-mismatch", verificationRequestId: request._id, nextAttemptAt: new Date() }), /does not match/);

  const inference = await profileVerificationInferenceResultRepository.createForTarget({
    ...creatorTarget, inferenceReference: "creator-inference-1", inferenceRunFingerprint: hash("c"), verificationRequestId: request._id, faceVerificationSessionId: session._id, evidenceSetFingerprint: hash("d"), pipelineManifestFingerprint: hash("e"), retentionDeadline: new Date(Date.now() + 60_000),
    pipeline: { kind: "TEST_SYNTHETIC", pipelineVersion: "test", runtimeIdentifier: "test", runtimeVersion: "test" },
    findings: { captures: [0, 1, 2, 3, 4].map((challengeIndex) => ({ challengeIndex, challenge: ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "BLINK"][challengeIndex] as "NEUTRAL" | "TURN_LEFT" | "TURN_RIGHT" | "LOOK_UP" | "LOOK_DOWN" | "BLINK", faceCount: "ONE", usability: "USABLE", reasonCodes: [] })), crossCapture: { status: "CONSISTENT", usableCaptureCount: 5, outlierCaptureCount: 0 }, avatar: { status: "MATCH_SUPPORTED" }, antiSpoof: { status: "NOT_RUN" } },
  });
  assert.equal(inference.profileId, undefined);
  await assert.rejects(profileVerificationInferenceResultRepository.createForTarget({
    ...creatorTarget, verificationRevision: 2, inferenceReference: "creator-inference-mismatch", inferenceRunFingerprint: hash("f"), verificationRequestId: request._id, faceVerificationSessionId: session._id, evidenceSetFingerprint: hash("d"), pipelineManifestFingerprint: hash("e"), retentionDeadline: new Date(Date.now() + 60_000), pipeline: { kind: "TEST_SYNTHETIC", pipelineVersion: "test", runtimeIdentifier: "test", runtimeVersion: "test" }, findings: inference.findings,
  }), /does not match/);
});

test("legacy and typed User targets remain profile-compatible and isolated from Creator targets", async () => {
  const ownerUserId = new Types.ObjectId();
  const profileId = new Types.ObjectId();
  const legacy = await faceVerificationSessionRepository.create({
    sessionReference: "legacy-user-session", userId: ownerUserId, profileId, profileSubmissionVersion: 1, avatarFingerprint: hash("9"),
    challenges: ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "BLINK"], expiresAt: new Date(Date.now() + 60_000),
  });
  assert.equal(String((await faceVerificationSessionRepository.findCurrent(profileId))?._id), String(legacy._id));

  const typedUser = target("USER_PROFILE");
  const typedUserSession = await faceVerificationSessionRepository.createForTarget({ ...typedUser, sessionReference: "typed-user-session", challenges: ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "BLINK"], expiresAt: new Date(Date.now() + 60_000) });
  assert.equal(String(typedUserSession.profileId), String(typedUser.targetId));
  const typedUserRequest = await profileVerificationRequestRepository.createForTarget({ ...typedUser, verificationReference: "typed-user-request", attemptNumber: 1, submittedAt: new Date(), submittedMedia: submittedMedia(), verificationPolicy: { key: "GATED_MULTI_MEDIA", version: "V2" } });
  assert.equal(String(typedUserRequest.profileId), String(typedUser.targetId));

  const creatorWithSameId = { ...target(), targetId: typedUser.targetId, ownerUserId: typedUser.ownerUserId };
  const creatorSession = await faceVerificationSessionRepository.createForTarget({ ...creatorWithSameId, sessionReference: "creator-same-id-session", challenges: ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "BLINK"], expiresAt: new Date(Date.now() + 60_000) });
  assert.equal(creatorSession.profileId, undefined);
  assert.notEqual(typedUserSession.targetType, creatorSession.targetType);
});

test("typed target indexes reject concurrent duplicate sessions and jobs", async () => {
  const concurrentTarget = target();
  const attempts = await Promise.allSettled(["a", "b"].map((suffix) => faceVerificationSessionRepository.createForTarget({
    ...concurrentTarget, sessionReference: `concurrent-session-${suffix}`, challenges: ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "BLINK"], expiresAt: new Date(Date.now() + 60_000),
  })));
  assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
  assert.equal(attempts.filter((attempt) => attempt.status === "rejected").length, 1);

  const request = await profileVerificationRequestRepository.createForTarget({ ...target(), verificationReference: "concurrent-job-request", attemptNumber: 1, submittedAt: new Date(), submittedMedia: submittedMedia(), verificationPolicy: { key: "GATED_MULTI_MEDIA", version: "V2" } });
  const binding = { targetType: request.targetType!, targetId: request.targetId!, ownerUserId: request.ownerUserId!, verificationRevision: request.verificationRevision! };
  const jobs = await Promise.allSettled(["a", "b"].map((suffix) => profileVerificationJobRepository.createForTarget({ ...binding, jobReference: `concurrent-job-${suffix}`, verificationRequestId: request._id, nextAttemptAt: new Date() })));
  assert.equal(jobs.filter((job) => job.status === "fulfilled").length, 1);
  assert.equal(jobs.filter((job) => job.status === "rejected").length, 1);
});
