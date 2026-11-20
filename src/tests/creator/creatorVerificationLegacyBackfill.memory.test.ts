import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { MongoClient, ObjectId } from "mongodb";
import { backfillLegacyUserVerificationTargets } from "../../services/creator/creatorVerificationLegacyBackfill";

let repl: MongoMemoryReplSet; let client: MongoClient;
before(async () => { repl = await MongoMemoryReplSet.create({ binary: { systemBinary: "D:/StHn/backend/node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe" }, replSet: { count: 1 } }); client = new MongoClient(repl.getUri("creator-backfill-isolated")); await client.connect(); });
after(async () => { await client.close(); await repl.stop(); });

const seedOwnedProfile = async (db: ReturnType<MongoClient["db"]>, userId: ObjectId, profileId: ObjectId, role = "user") => {
  await db.collection("users").insertOne({ _id: userId, role, email: `backfill-${userId}@example.test` });
  await db.collection("userprofiles").insertOne({ _id: profileId, userId });
};

test("legacy User target backfill is idempotent and skips ambiguous linked records", async () => {
  const db = client.db("creator-backfill-isolated"); const profileId = new ObjectId(); const userId = new ObjectId(); const sessionId = new ObjectId(); const requestId = new ObjectId();
  await seedOwnedProfile(db, userId, profileId);
  await db.collection("faceverificationsessions").insertOne({ _id: sessionId, profileId, userId, profileSubmissionVersion: 7, sessionReference: "legacy-session" });
  await db.collection("profileverificationrequests").insertOne({ _id: requestId, profileId, userId, profileSubmissionVersion: 7, verificationReference: "legacy-request" });
  await db.collection("faceverificationevidences").insertMany([{ sessionId, profileId, userId }, { sessionId: new ObjectId(), profileId, userId }]);
  await db.collection("profileverificationjobs").insertOne({ verificationRequestId: requestId, profileId, userId });
  await db.collection("profileverificationinferenceresults").insertOne({ verificationRequestId: requestId, profileId, userId });
  const first = await backfillLegacyUserVerificationTargets(db);
  assert.deepEqual(Object.fromEntries(Object.entries(first).map(([key, value]) => [key, value.updated])), { sessions: 1, evidence: 1, requests: 1, jobs: 1, inference: 1 });
  assert.equal(first.evidence.skipped.MISSING_OR_AMBIGUOUS_LINKED_TARGET, 1);
  const session = await db.collection("faceverificationsessions").findOne({ _id: sessionId });
  assert.equal(session?.targetType, "USER_PROFILE"); assert.equal(session?.verificationRevision, 7); assert.equal((session?.targetId as ObjectId).equals(profileId), true);
  const second = await backfillLegacyUserVerificationTargets(db);
  assert.deepEqual(Object.fromEntries(Object.entries(second).map(([key, value]) => [key, value.updated])), { sessions: 0, evidence: 0, requests: 0, jobs: 0, inference: 0 });
});

test("resumes safely after a partial target backfill without repeating prior updates", async () => {
  const db = client.db("creator-backfill-resume-isolated"); const profileId = new ObjectId(); const userId = new ObjectId(); const sessionId = new ObjectId(); const requestId = new ObjectId();
  await seedOwnedProfile(db, userId, profileId);
  await db.collection("faceverificationsessions").insertOne({ _id: sessionId, targetType: "USER_PROFILE", targetId: profileId, ownerUserId: userId, verificationRevision: 4 });
  await db.collection("profileverificationrequests").insertOne({ _id: requestId, targetType: "USER_PROFILE", targetId: profileId, ownerUserId: userId, verificationRevision: 4 });
  await db.collection("faceverificationevidences").insertOne({ sessionId, profileId, userId });
  await db.collection("profileverificationjobs").insertOne({ verificationRequestId: requestId, profileId, userId });
  await db.collection("profileverificationinferenceresults").insertOne({ verificationRequestId: requestId, profileId, userId });
  const report = await backfillLegacyUserVerificationTargets(db);
  assert.deepEqual(Object.fromEntries(Object.entries(report).map(([key, value]) => [key, value.updated])), { sessions: 0, evidence: 1, requests: 0, jobs: 1, inference: 1 });
  const retry = await backfillLegacyUserVerificationTargets(db);
  assert.deepEqual(Object.fromEntries(Object.entries(retry).map(([key, value]) => [key, value.updated])), { sessions: 0, evidence: 0, requests: 0, jobs: 0, inference: 0 });
});

test("Admin-owned legacy records are reported and left unchanged", async () => {
  const db = client.db("creator-backfill-admin-isolated");
  const profileId = new ObjectId(); const adminId = new ObjectId(); const sessionId = new ObjectId();
  await seedOwnedProfile(db, adminId, profileId, "admin");
  await db.collection("faceverificationsessions").insertOne({ _id: sessionId, profileId, userId: adminId, profileSubmissionVersion: 1 });
  const report = await backfillLegacyUserVerificationTargets(db);
  assert.equal(report.sessions.updated, 0);
  assert.equal(report.sessions.skipped.ADMIN_OWNED_RECORD, 1);
  assert.equal((await db.collection("faceverificationsessions").findOne({ _id: sessionId }))?.targetType, undefined);
});

test("typed session and request indexes isolate User and Creator targets through legacy-index retirement", async () => {
  const db = client.db("creator-backfill-index-isolated");
  const sessions = db.collection("faceverificationsessions"); const requests = db.collection("profileverificationrequests");
  await sessions.createIndex({ profileId: 1 }, { unique: true, partialFilterExpression: { isCurrent: true }, name: "one_current_face_verification_session" });
  await requests.createIndex({ profileId: 1 }, { unique: true, partialFilterExpression: { isActive: true }, name: "one_active_profile_verification_request" });
  await sessions.createIndex({ targetType: 1, targetId: 1 }, { unique: true, partialFilterExpression: { isCurrent: true, targetType: { $exists: true }, targetId: { $exists: true } }, name: "one_current_face_verification_target_session" });
  await requests.createIndex({ targetType: 1, targetId: 1 }, { unique: true, partialFilterExpression: { isActive: true, targetType: { $exists: true }, targetId: { $exists: true } }, name: "one_active_target_verification_request" });
  const userTarget = new ObjectId(); const creatorTarget = userTarget; const owner = new ObjectId();
  await sessions.insertOne({ profileId: userTarget, targetType: "USER_PROFILE", targetId: userTarget, ownerUserId: owner, verificationRevision: 2, isCurrent: true });
  await requests.insertOne({ profileId: userTarget, targetType: "USER_PROFILE", targetId: userTarget, ownerUserId: owner, verificationRevision: 2, isActive: true });
  await assert.rejects(() => sessions.insertOne({ targetType: "USER_PROFILE", targetId: userTarget, ownerUserId: owner, verificationRevision: 3, isCurrent: true }));
  await sessions.insertOne({ targetType: "CREATOR_APPLICATION", targetId: creatorTarget, ownerUserId: owner, verificationRevision: 1, isCurrent: true });
  await requests.insertOne({ targetType: "CREATOR_APPLICATION", targetId: creatorTarget, ownerUserId: owner, verificationRevision: 1, isActive: true });
  await assert.rejects(() => sessions.insertOne({ targetType: "CREATOR_APPLICATION", targetId: new ObjectId(), ownerUserId: owner, verificationRevision: 1, isCurrent: true }));
  await assert.rejects(() => requests.insertOne({ targetType: "CREATOR_APPLICATION", targetId: new ObjectId(), ownerUserId: owner, verificationRevision: 1, isActive: true }));
  await sessions.dropIndex("one_current_face_verification_session"); await requests.dropIndex("one_active_profile_verification_request");
  await sessions.insertOne({ targetType: "CREATOR_APPLICATION", targetId: new ObjectId(), ownerUserId: owner, verificationRevision: 1, isCurrent: true });
  await requests.insertOne({ targetType: "CREATOR_APPLICATION", targetId: new ObjectId(), ownerUserId: owner, verificationRevision: 1, isActive: true });
  await assert.rejects(() => sessions.insertOne({ targetType: "CREATOR_APPLICATION", targetId: creatorTarget, ownerUserId: owner, verificationRevision: 2, isCurrent: true }));
  await assert.rejects(() => requests.insertOne({ targetType: "CREATOR_APPLICATION", targetId: creatorTarget, ownerUserId: owner, verificationRevision: 2, isActive: true }));
  assert.equal((await sessions.indexes()).some((index) => index.name === "one_current_face_verification_session"), false);
  assert.equal((await requests.indexes()).some((index) => index.name === "one_active_profile_verification_request"), false);
});
