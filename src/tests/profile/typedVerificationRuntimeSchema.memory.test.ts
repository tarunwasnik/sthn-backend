import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { IndexDescriptionInfo } from "mongodb";

import { FaceVerificationSession } from "../../models/faceVerificationSession.model";
import { ProfileVerificationRequest } from "../../models/profileVerificationRequest.model";
import { faceVerificationSessionRepository } from "../../repositories/faceVerificationSession.repository";
import { profileVerificationRequestRepository } from "../../repositories/profileVerificationRequest.repository";

let server: MongoMemoryServer;

const typedSessionIndex = {
  name: "one_current_face_verification_target_session",
  key: { targetType: 1, targetId: 1 },
  partialFilterExpression: { isCurrent: true, targetType: { $exists: true }, targetId: { $exists: true } },
};
const typedRequestIndex = {
  name: "one_active_target_verification_request",
  key: { targetType: 1, targetId: 1 },
  partialFilterExpression: { isActive: true, targetType: { $exists: true }, targetId: { $exists: true } },
};

const exactIndex = (indexes: readonly IndexDescriptionInfo[], expected: { name: string; key: Record<string, number>; partialFilterExpression: object }) => {
  const actual = indexes.find((index) => index.name === expected.name);
  assert.deepEqual(actual && { name: actual.name, key: actual.key, unique: actual.unique === true, partialFilterExpression: actual.partialFilterExpression }, { ...expected, unique: true });
};

before(async () => {
  server = await MongoMemoryServer.create({ binary: { systemBinary: "D:/StHn/backend/node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe" } });
  await mongoose.connect(server.getUri("typed-runtime-schema-isolated"));
  await Promise.all([FaceVerificationSession.init(), ProfileVerificationRequest.init()]);
});

after(async () => {
  await mongoose.disconnect();
  await server.stop();
});

test("runtime schemas create only the approved typed active-target indexes", async () => {
  const [sessionIndexes, requestIndexes] = await Promise.all([FaceVerificationSession.collection.indexes(), ProfileVerificationRequest.collection.indexes()]);
  exactIndex(sessionIndexes, typedSessionIndex);
  exactIndex(requestIndexes, typedRequestIndex);
  assert.equal(sessionIndexes.some((index) => index.name === "one_current_face_verification_session"), false);
  assert.equal(requestIndexes.some((index) => index.name === "one_active_profile_verification_request"), false);
});

test("new User writes persist typed metadata and remain isolated from Creator targets", async () => {
  const userId = new Types.ObjectId();
  const sharedTargetId = new Types.ObjectId();
  const userSession = await faceVerificationSessionRepository.create({
    sessionReference: "typed-runtime-user-session",
    userId,
    profileId: sharedTargetId,
    profileSubmissionVersion: 3,
    avatarFingerprint: "a".repeat(64),
    challenges: ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "BLINK"],
    expiresAt: new Date(Date.now() + 60_000),
  });
  const userRequest = await profileVerificationRequestRepository.create({
    verificationReference: "typed-runtime-user-request",
    profileId: sharedTargetId,
    userId,
    attemptNumber: 1,
    profileSubmissionVersion: 3,
    submittedAt: new Date(),
  });
  assert.deepEqual({ targetType: userSession.targetType, targetId: String(userSession.targetId), ownerUserId: String(userSession.ownerUserId), verificationRevision: userSession.verificationRevision }, { targetType: "USER_PROFILE", targetId: String(sharedTargetId), ownerUserId: String(userId), verificationRevision: 3 });
  assert.deepEqual({ targetType: userRequest.targetType, targetId: String(userRequest.targetId), ownerUserId: String(userRequest.ownerUserId), verificationRevision: userRequest.verificationRevision }, { targetType: "USER_PROFILE", targetId: String(sharedTargetId), ownerUserId: String(userId), verificationRevision: 3 });

  await faceVerificationSessionRepository.createForTarget({
    sessionReference: "typed-runtime-creator-session",
    targetType: "CREATOR_APPLICATION",
    targetId: sharedTargetId,
    ownerUserId: userId,
    verificationRevision: 1,
    avatarReference: "creator-avatar",
    avatarFingerprint: "b".repeat(64),
    challenges: ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "BLINK"],
    expiresAt: new Date(Date.now() + 60_000),
  });
  await profileVerificationRequestRepository.createForTarget({
    verificationReference: "typed-runtime-creator-request",
    targetType: "CREATOR_APPLICATION",
    targetId: sharedTargetId,
    ownerUserId: userId,
    verificationRevision: 1,
    avatarReference: "creator-avatar",
    avatarFingerprint: "b".repeat(64),
    attemptNumber: 1,
    submittedAt: new Date(),
  });
});
