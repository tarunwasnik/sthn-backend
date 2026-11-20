import { Db, Document, ObjectId } from "mongodb";

type Report = Record<string, { updated: number; skipped: Record<string, number> }>;
type Target = { targetType: "USER_PROFILE"; targetId: ObjectId; ownerUserId: ObjectId; verificationRevision: number };

const collections = {
  sessions: "faceverificationsessions", evidence: "faceverificationevidences", requests: "profileverificationrequests",
  jobs: "profileverificationjobs", inference: "profileverificationinferenceresults", users: "users", userProfiles: "userprofiles",
} as const;

const validId = (value: unknown): value is ObjectId => value instanceof ObjectId;
const validRevision = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1;
const fresh = () => ({ updated: 0, skipped: {} as Record<string, number> });
const skip = (entry: { skipped: Record<string, number> }, reason: string) => { entry.skipped[reason] = (entry.skipped[reason] ?? 0) + 1; };
const isLegacy = (record: Document) => record.targetType === undefined;
const targetFrom = (profileId: unknown, ownerUserId: unknown, revision: unknown): Target | null => (
  validId(profileId) && validId(ownerUserId) && validRevision(revision)
    ? { targetType: "USER_PROFILE", targetId: profileId, ownerUserId, verificationRevision: revision }
    : null
);

const targetFromVerificationRecord = (record: Document | null): Target | null => {
  if (!record) return null;
  if (record.targetType === "USER_PROFILE") {
    return targetFrom(record.targetId, record.ownerUserId, record.verificationRevision);
  }
  return targetFrom(record.profileId, record.userId, record.profileSubmissionVersion);
};

export type LegacyUserTargetOwnership = "ELIGIBLE" | "ADMIN" | "AMBIGUOUS";

/**
 * A profileId alone is never authority to mutate a legacy record. The owner
 * must resolve to a non-Admin account and that exact account must own the
 * referenced UserProfile.
 */
export const verifyLegacyUserTargetOwnership = async (database: Db, target: Target): Promise<LegacyUserTargetOwnership> => {
  const [account, profile] = await Promise.all([
    database.collection(collections.users).findOne({ _id: target.ownerUserId }, { projection: { role: 1 } }),
    database.collection(collections.userProfiles).findOne({ _id: target.targetId, userId: target.ownerUserId }, { projection: { _id: 1 } }),
  ]);
  if (account?.role === "admin") return "ADMIN";
  if (!account || !profile || (account.role !== "user" && account.role !== "creator")) return "AMBIGUOUS";
  return "ELIGIBLE";
};

/**
 * Native-collection operation for an explicitly selected disposable/approved
 * database. It never creates indexes or deletes records. Repeating it only
 * visits records still lacking targetType, so it is resumable and idempotent.
 */
export const backfillLegacyUserVerificationTargets = async (database: Db): Promise<Report> => {
  const report: Report = { sessions: fresh(), evidence: fresh(), requests: fresh(), jobs: fresh(), inference: fresh() };
  const sessions = database.collection(collections.sessions);
  const requests = database.collection(collections.requests);
  const sessionTargets = new Map<string, Target>();
  const requestTargets = new Map<string, Target>();

  for await (const session of sessions.find({ targetType: { $exists: false } })) {
    const target = targetFrom(session.profileId, session.userId, session.profileSubmissionVersion);
    if (!target) { skip(report.sessions, "MISSING_PROFILE_OWNER_OR_REVISION"); continue; }
    const ownership = await verifyLegacyUserTargetOwnership(database, target);
    if (ownership !== "ELIGIBLE") { skip(report.sessions, ownership === "ADMIN" ? "ADMIN_OWNED_RECORD" : "UNVERIFIED_PROFILE_OWNERSHIP"); continue; }
    await sessions.updateOne({ _id: session._id, targetType: { $exists: false } }, { $set: target });
    report.sessions.updated += 1; sessionTargets.set(String(session._id), target);
  }
  for await (const request of requests.find({ targetType: { $exists: false } })) {
    const target = targetFrom(request.profileId, request.userId, request.profileSubmissionVersion);
    if (!target) { skip(report.requests, "MISSING_PROFILE_OWNER_OR_REVISION"); continue; }
    const ownership = await verifyLegacyUserTargetOwnership(database, target);
    if (ownership !== "ELIGIBLE") { skip(report.requests, ownership === "ADMIN" ? "ADMIN_OWNED_RECORD" : "UNVERIFIED_PROFILE_OWNERSHIP"); continue; }
    await requests.updateOne({ _id: request._id, targetType: { $exists: false } }, { $set: target });
    report.requests.updated += 1; requestTargets.set(String(request._id), target);
  }
  const processLinked = async (
    name: "evidence" | "jobs" | "inference",
    source: string,
    targetMap: Map<string, Target>,
    sourceCollection: typeof sessions,
  ) => {
    const collection = database.collection(collections[name]);
    for await (const record of collection.find({ targetType: { $exists: false } })) {
      const link = record[source];
      const target = validId(link)
        ? targetMap.get(String(link)) ?? targetFromVerificationRecord(await sourceCollection.findOne({ _id: link }))
        : undefined;
      if (!target) { skip(report[name], "MISSING_OR_AMBIGUOUS_LINKED_TARGET"); continue; }
      const ownership = await verifyLegacyUserTargetOwnership(database, target);
      if (ownership !== "ELIGIBLE") { skip(report[name], ownership === "ADMIN" ? "ADMIN_OWNED_RECORD" : "UNVERIFIED_PROFILE_OWNERSHIP"); continue; }
      if (record.profileId !== undefined && (!validId(record.profileId) || !record.profileId.equals(target.targetId)) || record.userId !== undefined && (!validId(record.userId) || !record.userId.equals(target.ownerUserId))) { skip(report[name], "LINKED_TARGET_MISMATCH"); continue; }
      await collection.updateOne({ _id: record._id, targetType: { $exists: false } }, { $set: target });
      report[name].updated += 1;
    }
  };
  await processLinked("evidence", "sessionId", sessionTargets, sessions);
  await processLinked("jobs", "verificationRequestId", requestTargets, requests);
  await processLinked("inference", "verificationRequestId", requestTargets, requests);
  return report;
};
