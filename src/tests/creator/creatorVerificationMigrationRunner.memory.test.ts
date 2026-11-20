import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { MongoClient, ObjectId } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import {
  runCreatorVerificationTypedTargetMigration,
  type CreatorVerificationMigrationAttestation,
} from "../../services/creator/creatorVerificationMigrationRunner.service";

let repl: MongoMemoryReplSet;
let client: MongoClient;

const attest = (changes: Partial<CreatorVerificationMigrationAttestation> = {}): CreatorVerificationMigrationAttestation => ({
  apply: true,
  maintenanceWindowConfirmed: true,
  backupRecoveryConfirmed: true,
  verificationWritesPaused: true,
  activeVerificationOperationsDrained: true,
  creatorVerificationRemainsDisabled: true,
  maintenanceEvidenceReference: "change-0713d",
  backupRecoveryEvidenceReference: "backup-restore-0713d",
  ...changes,
});

const setupLegacyIndexes = async () => {
  const database = client.db("sthn_db");
  await database.collection("faceverificationsessions").createIndex(
    { profileId: 1 }, { name: "one_current_face_verification_session", unique: true, partialFilterExpression: { isCurrent: true } },
  );
  await database.collection("profileverificationrequests").createIndex(
    { profileId: 1 }, { name: "one_active_profile_verification_request", unique: true, partialFilterExpression: { isActive: true } },
  );
  return database;
};

const seedValidLegacyGraph = async () => {
  const database = client.db("sthn_db");
  const profileId = new ObjectId();
  const userId = new ObjectId();
  const sessionId = new ObjectId();
  const requestId = new ObjectId();
  await database.collection("faceverificationsessions").insertOne({ _id: sessionId, profileId, userId, profileSubmissionVersion: 3, isCurrent: true });
  await database.collection("profileverificationrequests").insertOne({ _id: requestId, profileId, userId, profileSubmissionVersion: 3, isActive: true });
  await database.collection("faceverificationevidences").insertOne({ sessionId, profileId, userId });
  await database.collection("profileverificationjobs").insertOne({ verificationRequestId: requestId, profileId, userId });
  await database.collection("profileverificationinferenceresults").insertOne({ verificationRequestId: requestId, profileId, userId });
  await database.collection("users").insertOne({ _id: userId, role: "user", email: `migration-${userId}@example.test` });
  await database.collection("userprofiles").insertOne({ _id: profileId, userId });
  return { database, profileId, userId, sessionId, requestId };
};

before(async () => {
  repl = await MongoMemoryReplSet.create({
    binary: { systemBinary: "D:/StHn/backend/node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe" },
    replSet: { count: 1 },
  });
  client = new MongoClient(repl.getUri("sthn_db"));
  await client.connect();
});
beforeEach(async () => { await client.db("sthn_db").dropDatabase(); });
after(async () => { await client.close(); await repl.stop(); });

test("requires every explicit operator attestation before touching the disposable database", async () => {
  const database = await setupLegacyIndexes();
  await assert.rejects(() => runCreatorVerificationTypedTargetMigration({ database, attestation: attest({ apply: false }) }), /explicit apply/);
  await assert.rejects(() => runCreatorVerificationTypedTargetMigration({ database, attestation: attest({ backupRecoveryConfirmed: false }) }), /explicit apply/);
  await assert.rejects(() => runCreatorVerificationTypedTargetMigration({ database, attestation: attest({ verificationWritesPaused: false }) }), /explicit apply/);
});

test("development no-backup acknowledgement is explicit and cannot weaken Admin safety", async () => {
  await setupLegacyIndexes();
  const fixture = await seedValidLegacyGraph();
  const result = await runCreatorVerificationTypedTargetMigration({
    database: fixture.database,
    attestation: attest({
      backupRecoveryConfirmed: false,
      developmentNoBackupUserCreatorRiskAcknowledged: true,
      developmentNoBackupAcknowledgementReference: "dev-risk-0713e",
    }),
  });
  assert.equal(result.legacyIndexesRetained, true);
});

test("refuses the wrong database and unsafe pre-existing indexes or conflicts", async () => {
  await assert.rejects(() => runCreatorVerificationTypedTargetMigration({ database: client.db("not_sthn_db"), attestation: attest() }), /expected 'sthn_db'/);
  const unsafe = await setupLegacyIndexes();
  await unsafe.collection("faceverificationsessions").createIndex({ targetId: 1 }, { name: "one_current_face_verification_target_session", unique: true });
  await assert.rejects(() => runCreatorVerificationTypedTargetMigration({ database: unsafe, attestation: attest() }), /Unsafe index definition/);

  await client.db("sthn_db").dropDatabase();
  const conflicted = await setupLegacyIndexes();
  const sharedTarget = new ObjectId();
  await conflicted.collection("faceverificationsessions").insertMany([
    { profileId: new ObjectId(), userId: new ObjectId(), profileSubmissionVersion: 1, targetType: "USER_PROFILE", targetId: sharedTarget, ownerUserId: new ObjectId(), verificationRevision: 1, isCurrent: true },
    { profileId: new ObjectId(), userId: new ObjectId(), profileSubmissionVersion: 1, targetType: "USER_PROFILE", targetId: sharedTarget, ownerUserId: new ObjectId(), verificationRevision: 1, isCurrent: true },
  ]);
  await assert.rejects(() => runCreatorVerificationTypedTargetMigration({ database: conflicted, attestation: attest() }), /uniqueness conflicts/);
});

test("backfills valid records, creates typed indexes, retains legacy indexes, and repeats safely", async () => {
  await setupLegacyIndexes();
  const fixture = await seedValidLegacyGraph();
  const first = await runCreatorVerificationTypedTargetMigration({ database: fixture.database, attestation: attest() });
  assert.equal(first.legacyIndexesRetained, true);
  assert.deepEqual(Object.fromEntries(Object.entries(first.backfill).map(([name, report]) => [name, report.updated])), { sessions: 1, evidence: 1, requests: 1, jobs: 1, inference: 1 });
  const session = await fixture.database.collection("faceverificationsessions").findOne({ _id: fixture.sessionId });
  assert.equal(session?.targetType, "USER_PROFILE");
  const sessionIndexes = await fixture.database.collection("faceverificationsessions").indexes();
  const requestIndexes = await fixture.database.collection("profileverificationrequests").indexes();
  assert.equal(sessionIndexes.some((index) => index.name === "one_current_face_verification_session"), true);
  assert.equal(sessionIndexes.some((index) => index.name === "one_current_face_verification_target_session"), true);
  assert.equal(requestIndexes.some((index) => index.name === "one_active_profile_verification_request"), true);
  assert.equal(requestIndexes.some((index) => index.name === "one_active_target_verification_request"), true);
  const second = await runCreatorVerificationTypedTargetMigration({ database: fixture.database, attestation: attest() });
  assert.deepEqual(Object.fromEntries(Object.entries(second.backfill).map(([name, report]) => [name, report.updated])), { sessions: 0, evidence: 0, requests: 0, jobs: 0, inference: 0 });
});

test("stops after an interrupted progress sink and resumes without duplicate updates", async () => {
  await setupLegacyIndexes();
  const fixture = await seedValidLegacyGraph();
  await assert.rejects(() => runCreatorVerificationTypedTargetMigration({
    database: fixture.database,
    attestation: attest(),
    onProgress: (progress) => { if (progress.stage === "BACKFILL_COMPLETE") throw new Error("simulated operator interruption"); },
  }), /simulated operator interruption/);
  assert.equal((await fixture.database.collection("faceverificationsessions").indexes()).some((index) => index.name === "one_current_face_verification_target_session"), false);
  const resumed = await runCreatorVerificationTypedTargetMigration({ database: fixture.database, attestation: attest() });
  assert.deepEqual(Object.fromEntries(Object.entries(resumed.backfill).map(([name, report]) => [name, report.updated])), { sessions: 0, evidence: 0, requests: 0, jobs: 0, inference: 0 });
});

test("rejects malformed legacy records before any target metadata is written", async () => {
  const database = await setupLegacyIndexes();
  const sessionId = new ObjectId();
  await database.collection("faceverificationsessions").insertOne({ _id: sessionId, profileId: new ObjectId(), profileSubmissionVersion: 1, isCurrent: true });
  await assert.rejects(() => runCreatorVerificationTypedTargetMigration({ database, attestation: attest() }), /malformed or ambiguous/);
  const session = await database.collection("faceverificationsessions").findOne({ _id: sessionId });
  assert.equal(session?.targetType, undefined);
});

test("refuses Admin-owned verification records without modifying the Admin account or evidence", async () => {
  const database = await setupLegacyIndexes();
  const adminId = new ObjectId();
  const adminProfileId = new ObjectId();
  const adminSessionId = new ObjectId();
  await database.collection("users").insertOne({ _id: adminId, role: "admin", email: "admin@example.test", permissions: ["all"] });
  await database.collection("userprofiles").insertOne({ _id: adminProfileId, userId: adminId });
  await database.collection("faceverificationsessions").insertOne({ _id: adminSessionId, profileId: adminProfileId, userId: adminId, profileSubmissionVersion: 1, isCurrent: true });
  const [beforeAccount, beforeSession] = await Promise.all([
    database.collection("users").findOne({ _id: adminId }),
    database.collection("faceverificationsessions").findOne({ _id: adminSessionId }),
  ]);
  await assert.rejects(() => runCreatorVerificationTypedTargetMigration({ database, attestation: attest() }), /Admin-owned verification records/);
  const [afterAccount, afterSession] = await Promise.all([
    database.collection("users").findOne({ _id: adminId }),
    database.collection("faceverificationsessions").findOne({ _id: adminSessionId }),
  ]);
  assert.deepEqual(afterAccount, beforeAccount);
  assert.deepEqual(afterSession, beforeSession);
});
