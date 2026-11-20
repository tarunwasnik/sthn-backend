/**
 * Read-only preflight for the Creator verification index transition.
 * This script deliberately has no apply mode: index/document mutation must be
 * reviewed and executed as a separately authorized operational change.
 */
import mongoose from "mongoose";
import { assessCreatorVerificationIndexTransition, assessCreatorVerificationRequestIndexTransition, type MongoIndexDescription } from "../services/creator/creatorVerificationIndexTransition";
import { isCreatorVerificationEnabled } from "../services/creator/creatorVerificationFeatureGate";

const EXPECTED_DATABASE_NAME = "sthn_db";
const collectionNames = {
  sessions: "faceverificationsessions", evidence: "faceverificationevidences", requests: "profileverificationrequests",
  jobs: "profileverificationjobs", inferenceResults: "profileverificationinferenceresults",
  creatorApplications: "creatorapplications", userProfiles: "userprofiles",
  users: "users",
} as const;

const aggregateCount = async (collection: ReturnType<NonNullable<typeof mongoose.connection.db>["collection"]>, pipeline: object[]) => {
  const rows = await collection.aggregate([...pipeline, { $count: "count" }]).toArray();
  const count = rows[0]?.["count"];
  return typeof count === "number" ? count : 0;
};

const requireDryRun = () => {
  if (!process.argv.includes("--dry-run")) {
    throw new Error("Refusing to run without --dry-run. This utility is inspection-only and never applies database changes.");
  }
  if (process.argv.some((argument) => argument === "--apply" || argument === "--write" || argument === "--migrate")) {
    throw new Error("This utility has no mutation mode.");
  }
};

type Target = Readonly<{ targetId: mongoose.Types.ObjectId; ownerUserId: mongoose.Types.ObjectId; verificationRevision: number }>;
type Ownership = "ADMIN" | "NON_ADMIN" | "UNKNOWN";
const isObjectId = (value: unknown): value is mongoose.Types.ObjectId => value instanceof mongoose.Types.ObjectId;
const isRevision = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1;
const sameId = (left: unknown, right: mongoose.Types.ObjectId) => isObjectId(left) && left.equals(right);
const legacyTarget = (record: Record<string, unknown>): Target | null => (
  isObjectId(record.profileId) && isObjectId(record.userId) && isRevision(record.profileSubmissionVersion)
    ? { targetId: record.profileId, ownerUserId: record.userId, verificationRevision: record.profileSubmissionVersion }
    : null
);
const recordOwner = (record: Record<string, unknown>) => record.ownerUserId ?? record.userId;

const main = async () => {
  requireDryRun();
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required for the read-only preflight.");
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000, autoIndex: false });
  try {
    const database = mongoose.connection.db;
    if (!database) throw new Error("MongoDB connection is unavailable.");
    if (database.databaseName !== EXPECTED_DATABASE_NAME) throw new Error(`Refusing to inspect database '${database.databaseName}'; expected '${EXPECTED_DATABASE_NAME}'.`);
    const existing = new Set((await database.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name).filter((name): name is string => typeof name === "string"));
    const indexesFor = async (name: string) => !existing.has(name) ? [] : (await database.collection(name).indexes()).map((index) => ({
      name: index.name ?? "<unnamed-index>", key: index.key as Record<string, number>, unique: index.unique,
      ...(index.sparse === undefined ? {} : { sparse: index.sparse }),
      ...(index.expireAfterSeconds === undefined ? {} : { expireAfterSeconds: index.expireAfterSeconds }),
      ...(index.partialFilterExpression === undefined ? {} : { partialFilterExpression: index.partialFilterExpression as Record<string, unknown> }),
    }));
    const collectionReports = await Promise.all(Object.values(collectionNames).map(async (name) => ({ name, exists: existing.has(name), indexes: await indexesFor(name) })));
    const sessions = database.collection(collectionNames.sessions);
    const evidence = database.collection(collectionNames.evidence);
    const requests = database.collection(collectionNames.requests);
    const jobs = database.collection(collectionNames.jobs);
    const inference = database.collection(collectionNames.inferenceResults);
    const creatorApplications = database.collection(collectionNames.creatorApplications);
    const available = (name: string) => existing.has(name);
    const count = (name: string, query: object) => available(name) ? database.collection(name).countDocuments(query) : Promise.resolve(0);
    const activeProfileDuplicates = available(collectionNames.sessions) ? aggregateCount(sessions, [
      { $match: { isCurrent: true, profileId: { $exists: true } } },
      { $group: { _id: "$profileId", count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ]) : Promise.resolve(0);
    const activeTypedDuplicates = available(collectionNames.sessions) ? aggregateCount(sessions, [
      { $match: { isCurrent: true, targetType: { $exists: true }, targetId: { $exists: true } } },
      { $group: { _id: { targetType: "$targetType", targetId: "$targetId" }, count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } },
    ]) : Promise.resolve(0);
    const creatorApplicationDuplicateUsers = available(collectionNames.creatorApplications) ? aggregateCount(creatorApplications, [
      { $match: { userId: { $exists: true } } },
      { $group: { _id: "$userId", count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ]) : Promise.resolve(0);
    const legacySessionSourceGaps = count(collectionNames.sessions, {
      targetType: { $exists: false },
      $or: [{ profileId: { $exists: false } }, { userId: { $exists: false } }, { profileSubmissionVersion: { $not: { $gte: 1 } } }],
    });
    const legacyRequestSourceGaps = count(collectionNames.requests, {
      targetType: { $exists: false },
      $or: [{ profileId: { $exists: false } }, { userId: { $exists: false } }, { profileSubmissionVersion: { $not: { $gte: 1 } } }],
    });
    const [legacySessions, legacyEvidence, legacyRequests, legacyJobs, legacyInference, incompleteCreatorSessions, incompleteCreatorEvidence, incompleteCreatorRequests, incompleteCreatorJobs, incompleteCreatorInference, creatorSessions, creatorEvidence, creatorRequests, creatorJobs, creatorInference, evidenceMissingSession, jobsMissingRequest, inferenceMissingRequest, duplicateCreatorApplicationUsers] = await Promise.all([
      count(collectionNames.sessions, { profileId: { $exists: true }, targetType: { $exists: false } }), count(collectionNames.evidence, { profileId: { $exists: true }, targetType: { $exists: false } }), count(collectionNames.requests, { profileId: { $exists: true }, targetType: { $exists: false } }), count(collectionNames.jobs, { profileId: { $exists: true }, targetType: { $exists: false } }), count(collectionNames.inferenceResults, { profileId: { $exists: true }, targetType: { $exists: false } }),
      count(collectionNames.sessions, { targetType: "CREATOR_APPLICATION", $or: [{ targetId: { $exists: false } }, { ownerUserId: { $exists: false } }, { verificationRevision: { $not: { $gte: 1 } } }] }), count(collectionNames.evidence, { targetType: "CREATOR_APPLICATION", $or: [{ targetId: { $exists: false } }, { ownerUserId: { $exists: false } }, { verificationRevision: { $not: { $gte: 1 } } }] }), count(collectionNames.requests, { targetType: "CREATOR_APPLICATION", $or: [{ targetId: { $exists: false } }, { ownerUserId: { $exists: false } }, { verificationRevision: { $not: { $gte: 1 } } }] }), count(collectionNames.jobs, { targetType: "CREATOR_APPLICATION", $or: [{ targetId: { $exists: false } }, { ownerUserId: { $exists: false } }, { verificationRevision: { $not: { $gte: 1 } } }] }), count(collectionNames.inferenceResults, { targetType: "CREATOR_APPLICATION", $or: [{ targetId: { $exists: false } }, { ownerUserId: { $exists: false } }, { verificationRevision: { $not: { $gte: 1 } } }] }),
      count(collectionNames.sessions, { targetType: "CREATOR_APPLICATION" }), count(collectionNames.evidence, { targetType: "CREATOR_APPLICATION" }), count(collectionNames.requests, { targetType: "CREATOR_APPLICATION" }), count(collectionNames.jobs, { targetType: "CREATOR_APPLICATION" }), count(collectionNames.inferenceResults, { targetType: "CREATOR_APPLICATION" }),
      available(collectionNames.evidence) ? aggregateCount(evidence, [{ $lookup: { from: collectionNames.sessions, localField: "sessionId", foreignField: "_id", as: "session" } }, { $match: { session: { $eq: [] } } }]) : Promise.resolve(0),
      available(collectionNames.jobs) ? aggregateCount(jobs, [{ $lookup: { from: collectionNames.requests, localField: "verificationRequestId", foreignField: "_id", as: "request" } }, { $match: { request: { $eq: [] } } }]) : Promise.resolve(0),
      available(collectionNames.inferenceResults) ? aggregateCount(inference, [{ $lookup: { from: collectionNames.requests, localField: "verificationRequestId", foreignField: "_id", as: "request" } }, { $match: { request: { $eq: [] } } }]) : Promise.resolve(0),
      creatorApplicationDuplicateUsers,
    ]);
    const [activeLegacyProfileSessions, activeTypedTargetSessions, unmappableLegacySessions, unmappableLegacyRequests] = await Promise.all([activeProfileDuplicates, activeTypedDuplicates, legacySessionSourceGaps, legacyRequestSourceGaps]);
    const sessionIndexes = collectionReports.find((report) => report.name === collectionNames.sessions)?.indexes ?? [];
    const requestIndexes = collectionReports.find((report) => report.name === collectionNames.requests)?.indexes ?? [];
    const assessment = {
      sessions: assessCreatorVerificationIndexTransition(sessionIndexes),
      requests: assessCreatorVerificationRequestIndexTransition(requestIndexes),
    };
    const verificationCollectionNames = [collectionNames.sessions, collectionNames.evidence, collectionNames.requests, collectionNames.jobs, collectionNames.inferenceResults] as const;
    const readDocuments = async (name: typeof verificationCollectionNames[number]) => available(name)
      ? database.collection(name).find({}, { projection: { _id: 1, targetType: 1, targetId: 1, ownerUserId: 1, verificationRevision: 1, profileId: 1, userId: 1, profileSubmissionVersion: 1, sessionId: 1, verificationRequestId: 1 } }).toArray()
      : [];
    const [sessionDocuments, evidenceDocuments, requestDocuments, jobDocuments, inferenceDocuments, accounts, profiles] = await Promise.all([
      readDocuments(collectionNames.sessions), readDocuments(collectionNames.evidence), readDocuments(collectionNames.requests), readDocuments(collectionNames.jobs), readDocuments(collectionNames.inferenceResults),
      available(collectionNames.users) ? database.collection(collectionNames.users).find({}, { projection: { _id: 1, role: 1 } }).toArray() : [],
      available(collectionNames.userProfiles) ? database.collection(collectionNames.userProfiles).find({}, { projection: { _id: 1, userId: 1 } }).toArray() : [],
    ]);
    const accountRoles = new Map(accounts.filter((account) => isObjectId(account._id)).map((account) => [String(account._id), account.role]));
    const profileOwners = new Map(profiles.filter((profile) => isObjectId(profile._id) && isObjectId(profile.userId)).map((profile) => [String(profile._id), profile.userId as mongoose.Types.ObjectId]));
    const ownershipFor = (record: Record<string, unknown>): Ownership => {
      const owner = recordOwner(record);
      if (!isObjectId(owner)) return "UNKNOWN";
      const role = accountRoles.get(String(owner));
      if (role === undefined) return "UNKNOWN";
      return role === "admin" ? "ADMIN" : "NON_ADMIN";
    };
    const recordsByCollection = {
      sessions: sessionDocuments, evidence: evidenceDocuments, requests: requestDocuments, jobs: jobDocuments, inferenceResults: inferenceDocuments,
    } as const;
    const ownershipCounts = Object.fromEntries(Object.entries(recordsByCollection).map(([name, records]) => [name, records.reduce((counts, record) => {
      const ownership = ownershipFor(record);
      counts[ownership] += 1;
      return counts;
    }, { ADMIN: 0, NON_ADMIN: 0, UNKNOWN: 0 })]));
    const ownedLegacyTarget = (record: Record<string, unknown>) => {
      const target = legacyTarget(record);
      if (!target) return null;
      const role = accountRoles.get(String(target.ownerUserId));
      const profileOwner = profileOwners.get(String(target.targetId));
      return (role === "user" || role === "creator") && profileOwner && profileOwner.equals(target.ownerUserId) ? target : null;
    };
    const sessionTargets = new Map(sessionDocuments.map((record) => [String(record._id), ownedLegacyTarget(record)]));
    const requestTargets = new Map(requestDocuments.map((record) => [String(record._id), ownedLegacyTarget(record)]));
    const linkedTarget = (record: Record<string, unknown>, linkField: "sessionId" | "verificationRequestId", source: Map<string, Target | null>) => {
      const linked = record[linkField];
      const target = isObjectId(linked) ? source.get(String(linked)) : null;
      return target && (record.profileId === undefined || sameId(record.profileId, target.targetId)) && (record.userId === undefined || sameId(record.userId, target.ownerUserId)) ? target : null;
    };
    const legacyEligibleForBackfill = {
      sessions: sessionDocuments.filter((record) => record.targetType === undefined && ownedLegacyTarget(record)).length,
      requests: requestDocuments.filter((record) => record.targetType === undefined && ownedLegacyTarget(record)).length,
      evidence: evidenceDocuments.filter((record) => record.targetType === undefined && linkedTarget(record, "sessionId", sessionTargets)).length,
      jobs: jobDocuments.filter((record) => record.targetType === undefined && linkedTarget(record, "verificationRequestId", requestTargets)).length,
      inferenceResults: inferenceDocuments.filter((record) => record.targetType === undefined && linkedTarget(record, "verificationRequestId", requestTargets)).length,
    };
    const rootProfileRelationshipMismatches = [...sessionDocuments, ...requestDocuments].filter((record) => {
      if (record.targetType !== undefined || !legacyTarget(record)) return false;
      const target = legacyTarget(record)!;
      return !sameId(profileOwners.get(String(target.targetId)), target.ownerUserId);
    }).length;
    const linkedRelationshipMismatches = [
      ...evidenceDocuments.filter((record) => record.targetType === undefined && !linkedTarget(record, "sessionId", sessionTargets)),
      ...jobDocuments.filter((record) => record.targetType === undefined && !linkedTarget(record, "verificationRequestId", requestTargets)),
      ...inferenceDocuments.filter((record) => record.targetType === undefined && !linkedTarget(record, "verificationRequestId", requestTargets)),
    ].length;
    const adminOwnedTotal = Object.values(ownershipCounts).reduce((total, counts) => total + counts.ADMIN, 0);
    const unknownOwnerTotal = Object.values(ownershipCounts).reduce((total, counts) => total + counts.UNKNOWN, 0);
    console.log(JSON.stringify({
      mode: "DRY_RUN_ONLY",
      readOnlyOperations: ["listCollections", "indexes", "countDocuments", "aggregate", "find"], database: database.databaseName, collections: collectionReports,
      assessment,
      observed: {
        legacyRecordsWithoutTypedMetadata: { sessions: legacySessions, evidence: legacyEvidence, requests: legacyRequests, jobs: legacyJobs, inferenceResults: legacyInference },
        legacySourceFieldGaps: { sessions: unmappableLegacySessions, requests: unmappableLegacyRequests },
        incompleteCreatorTargetMetadata: { sessions: incompleteCreatorSessions, evidence: incompleteCreatorEvidence, requests: incompleteCreatorRequests, jobs: incompleteCreatorJobs, inferenceResults: incompleteCreatorInference },
        creatorTargetRecords: { sessions: creatorSessions, evidence: creatorEvidence, requests: creatorRequests, jobs: creatorJobs, inferenceResults: creatorInference },
        uniquenessConflicts: { activeLegacyProfileSessions, activeTypedTargetSessions, creatorApplicationDuplicateUsers: duplicateCreatorApplicationUsers }, orphanedReferences: { evidenceMissingSession, jobsMissingRequest, inferenceResultsMissingRequest: inferenceMissingRequest },
        adminSafety: {
          adminOwnedVerificationRecords: { total: adminOwnedTotal, byCollection: Object.fromEntries(Object.entries(ownershipCounts).map(([name, counts]) => [name, counts.ADMIN])) },
          recordsWithMissingOrAmbiguousOwners: { total: unknownOwnerTotal, byCollection: Object.fromEntries(Object.entries(ownershipCounts).map(([name, counts]) => [name, counts.UNKNOWN])) },
          userProfileUserRelationshipMismatches: { rootRecords: rootProfileRelationshipMismatches, linkedRecords: linkedRelationshipMismatches },
          legacyRecordsEligibleForSafeBackfill: legacyEligibleForBackfill,
        },
      },
      creatorVerificationEnabled: isCreatorVerificationEnabled(),
      requiredCutover: [
        "Deploy target-aware application code with Creator verification disabled.",
        "Backfill only legacy User records that have a valid profileId into targetType USER_PROFILE/targetId profileId.",
        "Create and validate the typed active-target unique indexes for current sessions and active requests.",
        "Pause session/request creation, re-check duplicates, then separately authorize retiring both legacy profileId unique indexes.",
        "Enable Creator verification only after both replacement indexes and all typed records are verified.",
      ],
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
