import { Db, Document, ObjectId } from "mongodb";

import { backfillLegacyUserVerificationTargets } from "./creatorVerificationLegacyBackfill";
import {
  LEGACY_ACTIVE_PROFILE_REQUEST_INDEX,
  LEGACY_ACTIVE_PROFILE_SESSION_INDEX,
  typedActiveTargetRequestIndex,
  typedActiveTargetSessionIndex,
  type MongoIndexDescription,
} from "./creatorVerificationIndexTransition";
import { isCreatorVerificationEnabled } from "./creatorVerificationFeatureGate";

const EXPECTED_DATABASE_NAME = "sthn_db";

type UserTarget = Readonly<{ targetId: ObjectId; ownerUserId: ObjectId; verificationRevision: number }>;
type ProgressStage = "GUARDS_ACCEPTED" | "PRECHECK_COMPLETE" | "BACKFILL_COMPLETE" | "TYPED_INDEXES_VALIDATED" | "COMPLETE";
type Progress = Readonly<{ stage: ProgressStage; database: string; counts?: Readonly<Record<string, number>> }>;
type BackfillReport = Awaited<ReturnType<typeof backfillLegacyUserVerificationTargets>>;

export interface CreatorVerificationMigrationAttestation {
  readonly apply: boolean;
  readonly maintenanceWindowConfirmed: boolean;
  readonly backupRecoveryConfirmed: boolean;
  /** Development-only alternative to a verified backup for disposable User/Creator test data. */
  readonly developmentNoBackupUserCreatorRiskAcknowledged?: boolean;
  readonly verificationWritesPaused: boolean;
  readonly activeVerificationOperationsDrained: boolean;
  readonly creatorVerificationRemainsDisabled: boolean;
  /** Opaque change/backup evidence reference; do not place credentials here. */
  readonly maintenanceEvidenceReference: string;
  readonly backupRecoveryEvidenceReference: string;
  /** Opaque development risk acknowledgement; never use it as backup evidence. */
  readonly developmentNoBackupAcknowledgementReference?: string;
}

export interface CreatorVerificationMigrationRunInput {
  readonly database: Db;
  readonly attestation: CreatorVerificationMigrationAttestation;
  readonly onProgress?: (progress: Progress) => void | Promise<void>;
}

export interface CreatorVerificationMigrationRunResult {
  readonly database: string;
  readonly backfill: BackfillReport;
  readonly legacyIndexesRetained: true;
  readonly typedIndexes: readonly [string, string];
  readonly progress: readonly Progress[];
}

const collections = {
  sessions: "faceverificationsessions",
  evidence: "faceverificationevidences",
  requests: "profileverificationrequests",
  jobs: "profileverificationjobs",
  inference: "profileverificationinferenceresults",
  users: "users",
} as const;

const validId = (value: unknown): value is ObjectId => value instanceof ObjectId;
const validRevision = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1;
const sameId = (left: unknown, right: ObjectId) => validId(left) && left.equals(right);
const sameJson = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

const userTargetFrom = (record: Document): UserTarget | null => {
  if (record.targetType === "USER_PROFILE") {
    return validId(record.targetId) && validId(record.ownerUserId) && validRevision(record.verificationRevision)
      ? { targetId: record.targetId, ownerUserId: record.ownerUserId, verificationRevision: record.verificationRevision }
      : null;
  }
  if (record.targetType !== undefined) return null;
  return validId(record.profileId) && validId(record.userId) && validRevision(record.profileSubmissionVersion)
    ? { targetId: record.profileId, ownerUserId: record.userId, verificationRevision: record.profileSubmissionVersion }
    : null;
};

const assertEvidenceMatches = (record: Document, target: UserTarget) => {
  if (record.profileId !== undefined && !sameId(record.profileId, target.targetId)) return false;
  return record.userId === undefined || sameId(record.userId, target.ownerUserId);
};

const assertAttestation = (databaseName: string, attestation: CreatorVerificationMigrationAttestation) => {
  const developmentNoBackup = attestation.backupRecoveryConfirmed === false
    && attestation.developmentNoBackupUserCreatorRiskAcknowledged === true
    && databaseName === EXPECTED_DATABASE_NAME
    && typeof attestation.developmentNoBackupAcknowledgementReference === "string"
    && attestation.developmentNoBackupAcknowledgementReference.trim().length >= 6;
  if (attestation.apply !== true || attestation.maintenanceWindowConfirmed !== true || (!attestation.backupRecoveryConfirmed && !developmentNoBackup)
    || attestation.verificationWritesPaused !== true || attestation.activeVerificationOperationsDrained !== true
    || attestation.creatorVerificationRemainsDisabled !== true) {
    throw new Error("Migration requires explicit apply, maintenance, backup/recovery or development data-risk acknowledgement, quiescence, drained-operation, and Creator-disabled attestations.");
  }
  if (attestation.maintenanceEvidenceReference.trim().length < 6 || (attestation.backupRecoveryConfirmed && attestation.backupRecoveryEvidenceReference.trim().length < 6)) {
    throw new Error("Migration requires non-sensitive maintenance and verified backup/recovery evidence references.");
  }
  if (isCreatorVerificationEnabled()) throw new Error("Creator verification must remain disabled during the typed-target migration.");
};

/** Counts only; no Admin identifiers or verification payloads are emitted. */
const assertNoAdminOwnedVerificationRecords = async (database: Db) => {
  const ownership = new Map<string, "ADMIN" | "NON_ADMIN" | "UNKNOWN">();
  const ownerKind = async (owner: unknown) => {
    if (!validId(owner)) return "UNKNOWN" as const;
    const key = String(owner);
    const cached = ownership.get(key);
    if (cached) return cached;
    const account = await database.collection(collections.users).findOne({ _id: owner }, { projection: { role: 1 } });
    const resolved = !account ? "UNKNOWN" : account.role === "admin" ? "ADMIN" : "NON_ADMIN";
    ownership.set(key, resolved);
    return resolved;
  };
  let adminOwned = 0;
  let unknownOwner = 0;
  for (const collection of [collections.sessions, collections.evidence, collections.requests, collections.jobs, collections.inference]) {
    for await (const record of database.collection(collection).find({ $or: [{ ownerUserId: { $exists: true } }, { userId: { $exists: true } }] }, { projection: { ownerUserId: 1, userId: 1 } })) {
      const kind = await ownerKind(record.ownerUserId ?? record.userId);
      if (kind === "ADMIN") adminOwned += 1;
      if (kind === "UNKNOWN") unknownOwner += 1;
    }
  }
  if (adminOwned > 0) throw new Error(`Migration refused: ${adminOwned} Admin-owned verification records were found and left unchanged.`);
  if (unknownOwner > 0) throw new Error(`Migration refused: ${unknownOwner} verification records have unverified ownership.`);
  return { adminOwned, unknownOwner };
};

const assertIndex = (indexes: readonly MongoIndexDescription[], expected: MongoIndexDescription) => {
  const found = indexes.find((index) => index.name === expected.name);
  if (!found) return false;
  if (found.unique !== true || !sameJson(found.key, expected.key) || !sameJson(found.partialFilterExpression, expected.partialFilterExpression)) {
    throw new Error(`Unsafe index definition for ${expected.name}.`);
  }
  return true;
};

const assertLegacyIndex = (indexes: readonly MongoIndexDescription[], name: string) => {
  const found = indexes.find((index) => index.name === name);
  if (!found || found.unique !== true || !sameJson(found.key, { profileId: 1 })) {
    throw new Error(`Expected legacy unique index ${name} is missing or incompatible.`);
  }
};

const indexDescriptions = async (database: Db, collection: string): Promise<MongoIndexDescription[]> =>
  (await database.collection(collection).indexes()).map((index) => ({
    name: index.name ?? "<unnamed-index>",
    key: index.key as Record<string, number>,
    unique: index.unique,
    ...(index.partialFilterExpression === undefined ? {} : { partialFilterExpression: index.partialFilterExpression as Record<string, unknown> }),
  }));

const duplicateGroups = async (database: Db, collection: string, match: Document, key: Document) => {
  const rows = await database.collection(collection).aggregate([
    { $match: match }, { $group: { _id: key, count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }, { $count: "count" },
  ]).toArray();
  return typeof rows[0]?.count === "number" ? rows[0].count : 0;
};

const countSkips = (report: BackfillReport) => Object.values(report).reduce((total, entry) =>
  total + Object.values(entry.skipped).reduce((subTotal, count) => subTotal + count, 0), 0);

/** Read-only validation that prevents the backfill from partially accepting a batch containing ambiguous links. */
const assertNoAmbiguousLegacyRecords = async (database: Db) => {
  const sessionTargets = new Map<string, UserTarget>();
  const requestTargets = new Map<string, UserTarget>();
  let malformed = 0;

  for await (const record of database.collection(collections.sessions).find({})) {
    if (record.targetType === "CREATOR_APPLICATION") continue;
    const target = userTargetFrom(record);
    if (!target) { malformed += 1; continue; }
    sessionTargets.set(String(record._id), target);
  }
  for await (const record of database.collection(collections.requests).find({})) {
    if (record.targetType === "CREATOR_APPLICATION") continue;
    const target = userTargetFrom(record);
    if (!target) { malformed += 1; continue; }
    requestTargets.set(String(record._id), target);
  }
  const linked = async (collection: string, linkField: string, source: Map<string, UserTarget>) => {
    for await (const record of database.collection(collection).find({ targetType: { $exists: false } })) {
      const link = record[linkField];
      const target = validId(link) ? source.get(String(link)) : undefined;
      if (!target || !assertEvidenceMatches(record, target)) malformed += 1;
    }
  };
  await linked(collections.evidence, "sessionId", sessionTargets);
  await linked(collections.jobs, "verificationRequestId", requestTargets);
  await linked(collections.inference, "verificationRequestId", requestTargets);
  if (malformed > 0) throw new Error(`Migration refused: ${malformed} malformed or ambiguous legacy verification records require manual review.`);
};

const assertNoConflicts = async (database: Db) => {
  const [legacySessions, typedSessions, legacyRequests, typedRequests] = await Promise.all([
    duplicateGroups(database, collections.sessions, { isCurrent: true, profileId: { $exists: true } }, { profileId: "$profileId" }),
    duplicateGroups(database, collections.sessions, { isCurrent: true, targetType: { $exists: true }, targetId: { $exists: true } }, { targetType: "$targetType", targetId: "$targetId" }),
    duplicateGroups(database, collections.requests, { isActive: true, profileId: { $exists: true } }, { profileId: "$profileId" }),
    duplicateGroups(database, collections.requests, { isActive: true, targetType: { $exists: true }, targetId: { $exists: true } }, { targetType: "$targetType", targetId: "$targetId" }),
  ]);
  if (legacySessions + typedSessions + legacyRequests + typedRequests > 0) {
    throw new Error("Migration refused: active session/request uniqueness conflicts are present.");
  }
  return { legacySessions, typedSessions, legacyRequests, typedRequests };
};

/**
 * Applies only the typed metadata backfill and typed replacement indexes.
 * It deliberately has no legacy-index retirement operation.
 */
export const runCreatorVerificationTypedTargetMigration = async (
  input: CreatorVerificationMigrationRunInput,
): Promise<CreatorVerificationMigrationRunResult> => {
  const { database, attestation } = input;
  if (database.databaseName !== EXPECTED_DATABASE_NAME) {
    throw new Error(`Refusing migration for database '${database.databaseName}'; expected '${EXPECTED_DATABASE_NAME}'.`);
  }
  assertAttestation(database.databaseName, attestation);
  const progress: Progress[] = [];
  const emit = async (stage: ProgressStage, counts?: Readonly<Record<string, number>>) => {
    const event: Progress = { stage, database: database.databaseName, ...(counts ? { counts } : {}) };
    progress.push(event);
    await input.onProgress?.(event);
  };
  await emit("GUARDS_ACCEPTED");

  const [sessionIndexes, requestIndexes] = await Promise.all([
    indexDescriptions(database, collections.sessions), indexDescriptions(database, collections.requests),
  ]);
  assertLegacyIndex(sessionIndexes, LEGACY_ACTIVE_PROFILE_SESSION_INDEX);
  assertLegacyIndex(requestIndexes, LEGACY_ACTIVE_PROFILE_REQUEST_INDEX);
  assertIndex(sessionIndexes, typedActiveTargetSessionIndex);
  assertIndex(requestIndexes, typedActiveTargetRequestIndex);
  const conflicts = await assertNoConflicts(database);
  const adminSafety = await assertNoAdminOwnedVerificationRecords(database);
  await assertNoAmbiguousLegacyRecords(database);
  await emit("PRECHECK_COMPLETE", { ...conflicts, ...adminSafety });

  const backfill = await backfillLegacyUserVerificationTargets(database);
  const skipped = countSkips(backfill);
  if (skipped > 0) throw new Error(`Migration refused: backfill reported ${skipped} ambiguous records.`);
  await emit("BACKFILL_COMPLETE", Object.fromEntries(Object.entries(backfill).map(([name, report]) => [name, report.updated])));

  const sessions = database.collection(collections.sessions);
  const requests = database.collection(collections.requests);
  await sessions.createIndex(typedActiveTargetSessionIndex.key, {
    name: typedActiveTargetSessionIndex.name, unique: true, partialFilterExpression: typedActiveTargetSessionIndex.partialFilterExpression,
  });
  await requests.createIndex(typedActiveTargetRequestIndex.key, {
    name: typedActiveTargetRequestIndex.name, unique: true, partialFilterExpression: typedActiveTargetRequestIndex.partialFilterExpression,
  });
  const [validatedSessions, validatedRequests] = await Promise.all([
    indexDescriptions(database, collections.sessions), indexDescriptions(database, collections.requests),
  ]);
  if (!assertIndex(validatedSessions, typedActiveTargetSessionIndex) || !assertIndex(validatedRequests, typedActiveTargetRequestIndex)) {
    throw new Error("Typed replacement indexes were not validated after creation.");
  }
  await emit("TYPED_INDEXES_VALIDATED");
  await emit("COMPLETE");
  return {
    database: database.databaseName,
    backfill,
    legacyIndexesRetained: true,
    typedIndexes: [typedActiveTargetSessionIndex.name, typedActiveTargetRequestIndex.name],
    progress,
  };
};
