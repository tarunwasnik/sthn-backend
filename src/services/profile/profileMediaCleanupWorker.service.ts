import mongoose, { Types } from "mongoose";
import { CreatorApplication } from "../../models/creatorApplication.model";
import { CreatorProfile } from "../../models/creatorProfile.model";
import { CreatorService } from "../../models/creatorService.model";
import { FaceVerificationEvidence } from "../../models/faceVerificationEvidence.model";
import { FaceVerificationSession } from "../../models/faceVerificationSession.model";
import { ImageModerationAsset } from "../../models/imageModerationAsset.model";
import { ProfileMediaCleanupJobDocument } from "../../models/profileMediaCleanupJob.model";
import { ProfileVerificationRequest } from "../../models/profileVerificationRequest.model";
import { UserProfile } from "../../models/userProfile.model";
import { providerAssetGuardRepository, ProviderAssetGuardRepository } from "../../repositories/providerAssetGuard.repository";
import { providerAssetReferenceRepository, ProviderAssetReferenceRepository } from "../../repositories/providerAssetReference.repository";
import { profileMediaCleanupJobRepository, ProfileMediaCleanupJobRepository } from "../../repositories/profileMediaCleanupJob.repository";
import { deleteCloudinaryImageSafely, TemporaryImageDeletionOutcome } from "../../utils/uploadToCloudinary";

const LEASE_MS = 5 * 60 * 1000;
const MAX_RETRY_MS = 60 * 60 * 1000;
const ACTIVE_SESSION_STATUSES = ["CREATED", "CAPTURING", "CAPTURE_COMPLETE"];
const references = (reference: string) => ({ $or: [{ avatar: reference }, { cover: reference }, { profilePhotos: reference }] });
const creatorReferences = (reference: string) => ({ $or: [{ avatarUrl: reference }, { coverUrl: reference }, { media: reference }] });
const historyReferences = (reference: string) => ({ $or: [{ "submittedMedia.avatar.sourceReference": reference }, { "submittedMedia.cover.sourceReference": reference }, { "submittedMedia.profilePhotos.sourceReference": reference }] });
const bounded = (value: string) => value.slice(0, 500);
const retryAt = (now: Date, attemptCount: number) => new Date(now.getTime() + Math.min(MAX_RETRY_MS, 60_000 * 2 ** Math.max(0, attemptCount - 1)));

export type ProfileMediaCleanupEligibility =
  | Readonly<{ kind: "ELIGIBLE"; guardId: Types.ObjectId }>
  | Readonly<{ kind: "STILL_REFERENCED"; reason: string }>
  | Readonly<{ kind: "UNSAFE_PROVENANCE"; reason: string }>
  | Readonly<{ kind: "RETRYABLE_ERROR"; reason: string }>;

type Reservation = Readonly<{ jobId: Types.ObjectId; guardId: Types.ObjectId; publicId: string; token: string; attemptCount: number }>;
export type ProfileMediaCleanupResult = Readonly<{ kind: "DELETED" | "ALREADY_MISSING" | "RETRY_SCHEDULED" | "FAILED" | "AMBIGUOUS" | "SKIPPED" | "NOT_DUE"; jobId?: Types.ObjectId }>;

/**
 * A historic verification snapshot is a retained dependency until the domain
 * exposes an explicit release policy, so cleanup is deliberately conservative.
 */
export class ProfileMediaCleanupWorkerService {
  constructor(
    private readonly repository: ProfileMediaCleanupJobRepository = profileMediaCleanupJobRepository,
    private readonly guards: ProviderAssetGuardRepository = providerAssetGuardRepository,
    private readonly providerReferences: ProviderAssetReferenceRepository = providerAssetReferenceRepository,
    private readonly destroy: (publicId: string) => Promise<TemporaryImageDeletionOutcome> = deleteCloudinaryImageSafely,
  ) {}

  private async transaction<T>(work: (session: mongoose.ClientSession) => Promise<T>) {
    const session = await mongoose.startSession();
    try { let result!: T; await session.withTransaction(async () => { result = await work(session); }); return result; }
    finally { await session.endSession(); }
  }

  async assess(job: ProfileMediaCleanupJobDocument, session?: mongoose.ClientSession): Promise<ProfileMediaCleanupEligibility> {
    try {
      const use = <T extends { session: (session: mongoose.ClientSession | null) => T }>(query: T) => query.session(session ?? null);
      const asset = await use(ImageModerationAsset.findOne({ actorId: job.userId, trustedMediaReference: job.formerReference, providerAssetId: job.cloudinaryPublicId, status: "COMMITTED", committedEntityBinding: { $regex: `^USER_PROFILE:${job.profileId.toString()}:` } })).lean().exec();
      if (!asset) return { kind: "UNSAFE_PROVENANCE", reason: "Committed backend-owned profile asset provenance is absent." };
      if (!await use(UserProfile.exists({ _id: job.profileId, userId: job.userId }))) return { kind: "UNSAFE_PROVENANCE", reason: "Cleanup job profile ownership no longer matches." };
      const guard = await this.guards.findByProviderAssetId(job.cloudinaryPublicId, session);
      if (!guard) return { kind: "UNSAFE_PROVENANCE", reason: "Provider deletion guard is absent." };
      const [profileReference, guardReferences, sharedAsset, applicationReference, creatorReference, serviceReference, activeFaceSession, evidenceReference, verificationHistory] = await Promise.all([
        use(UserProfile.exists(references(job.formerReference))),
        this.providerReferences.findCurrentByGuard(guard._id, session),
        use(ImageModerationAsset.exists({ providerAssetId: job.cloudinaryPublicId, status: "COMMITTED", committedEntityBinding: { $not: new RegExp(`^USER_PROFILE:${job.profileId.toString()}:`) } })),
        use(CreatorApplication.exists(creatorReferences(job.formerReference))), use(CreatorProfile.exists(creatorReferences(job.formerReference))), use(CreatorService.exists({ media: job.formerReference })),
        use(FaceVerificationSession.exists({ profileId: job.profileId, isCurrent: true, status: { $in: ACTIVE_SESSION_STATUSES } })),
        use(FaceVerificationEvidence.exists({ cloudinaryPublicId: job.cloudinaryPublicId, status: { $ne: "DELETED" } })),
        use(ProfileVerificationRequest.exists(historyReferences(job.formerReference))),
      ]);
      if (profileReference || guardReferences.length || sharedAsset || applicationReference || creatorReference || serviceReference || activeFaceSession || evidenceReference || verificationHistory) return { kind: "STILL_REFERENCED", reason: "An authoritative, verification, evidence, or historical reference remains." };
      return { kind: "ELIGIBLE", guardId: guard._id };
    } catch (error) { return { kind: "RETRYABLE_ERROR", reason: bounded(error instanceof Error ? error.message : "Cleanup safety query failed.") }; }
  }

  private async reserve(job: ProfileMediaCleanupJobDocument, now: Date, leaseMs: number): Promise<Reservation | ProfileMediaCleanupResult> {
    const token = job.leaseToken;
    if (!token) return { kind: "NOT_DUE", jobId: job._id };
    return this.transaction(async (session) => {
      const current = await this.repository.findRunning(job._id, token, session);
      if (!current) return { kind: "NOT_DUE", jobId: job._id };
      const eligibility = await this.assess(current, session);
      if (eligibility.kind === "STILL_REFERENCED") { await this.repository.skipStillReferenced(current._id, token, now, session); return { kind: "SKIPPED", jobId: current._id }; }
      if (eligibility.kind !== "ELIGIBLE") { const retried = await this.repository.scheduleRetry(current._id, token, retryAt(now, current.attemptCount), eligibility.kind, eligibility.reason, session); return { kind: retried?.status === "FAILED" ? "FAILED" : "RETRY_SCHEDULED", jobId: current._id }; }
      const guard = await this.guards.reserveDeletion({ guardId: eligibility.guardId, jobId: current._id, token, expiresAt: new Date(now.getTime() + leaseMs), session });
      if (!guard) { await this.repository.skipStillReferenced(current._id, token, now, session); return { kind: "SKIPPED", jobId: current._id }; }
      return { jobId: current._id, guardId: guard._id, publicId: current.cloudinaryPublicId, token, attemptCount: current.attemptCount };
    });
  }

  private async startDeletion(reservation: Reservation, now: Date) { return this.transaction(async (session) => Boolean(await this.guards.startDeletion({ guardId: reservation.guardId, token: reservation.token, now, session }))); }
  private async complete(reservation: Reservation, outcome: "DELETED" | "ALREADY_MISSING", now: Date) { return this.transaction(async (session) => { if (!await this.guards.markDeleted({ guardId: reservation.guardId, token: reservation.token, now, outcome, session })) return false; return Boolean(await this.repository.complete(reservation.jobId, reservation.token, now, session)); }); }
  private async containUnknown(reservation: Reservation, now: Date, code: string, message: string) { await this.transaction(async (session) => { await this.guards.markUnknown({ guardId: reservation.guardId, token: reservation.token, session }); await this.repository.markUnknown(reservation.jobId, reservation.token, now, code, bounded(message), session); }); }
  private async retry(reservation: Reservation, now: Date): Promise<"RETRY_SCHEDULED" | "FAILED" | "AMBIGUOUS"> {
    const outcome = await this.transaction(async (session) => { if (!await this.guards.releaseRetryableDeletion({ guardId: reservation.guardId, token: reservation.token, session })) return null; return this.repository.scheduleRetry(reservation.jobId, reservation.token, retryAt(now, reservation.attemptCount), "PROVIDER_RETRYABLE_FAILURE", "Cloudinary deletion failed transiently.", session); });
    if (!outcome) { await this.containUnknown(reservation, now, "RETRY_RELEASE_FAILED", "Could not safely release the provider deletion reservation after a transient failure."); return "AMBIGUOUS"; }
    return outcome.status === "FAILED" ? "FAILED" : "RETRY_SCHEDULED";
  }

  async processNext(now = new Date(), leaseMs = LEASE_MS): Promise<ProfileMediaCleanupResult | null> {
    const job = await this.repository.claimDue(now, leaseMs);
    if (!job) return null;
    const reserved = await this.reserve(job, now, leaseMs);
    if (!("publicId" in reserved)) return reserved;
    if (!await this.startDeletion(reserved, now)) { await this.containUnknown(reserved, now, "DELETION_START_CONFLICT", "Could not establish the durable provider deletion boundary."); return { kind: "AMBIGUOUS", jobId: reserved.jobId }; }
    const outcome = await this.destroy(reserved.publicId);
    if (outcome === "DELETED" || outcome === "ALREADY_MISSING") { if (await this.complete(reserved, outcome, now)) return { kind: outcome, jobId: reserved.jobId }; await this.containUnknown(reserved, now, "DELETION_COMPLETION_CONFLICT", "Cloudinary reported deletion, but durable completion could not be recorded."); return { kind: "AMBIGUOUS", jobId: reserved.jobId }; }
    if (outcome === "RETRYABLE_FAILURE") return { kind: await this.retry(reserved, now), jobId: reserved.jobId };
    await this.containUnknown(reserved, now, "PROVIDER_AMBIGUOUS_FAILURE", "Cloudinary deletion outcome is ambiguous; automatic retries are contained.");
    return { kind: "AMBIGUOUS", jobId: reserved.jobId };
  }

  async processBatch(input: { now?: Date; limit?: number; leaseMs?: number } = {}) { const results: Array<ProfileMediaCleanupResult | null> = []; for (let index = 0, limit = Math.min(Math.max(input.limit ?? 20, 1), 100); index < limit; index += 1) { const result = await this.processNext(input.now ?? new Date(), input.leaseMs ?? LEASE_MS); if (!result) break; results.push(result); } return results; }
  async reconcile(now = new Date()) {
    let releasedReservations = 0;
    let containedInProgress = 0;
    for (const guard of await this.guards.listExpiredReservations(now)) {
      const released = await this.transaction(async (session) => this.guards.recoverExpiredReservation({ guardId: guard._id, now, session }));
      if (released) releasedReservations += 1;
    }
    for (const guard of await this.guards.listExpiredInProgress(now)) {
      const token = guard.reservationToken;
      if (!token) continue;
      const contained = await this.transaction(async (session) => {
        const unknown = await this.guards.markUnknown({ guardId: guard._id, token, session });
        if (!unknown) return false;
        if (guard.reservationJobId) await this.repository.markUnknown(guard.reservationJobId, token, now, "DELETION_LEASE_EXPIRED", "A process ended while provider deletion may have been in progress.", session);
        return true;
      });
      if (contained) containedInProgress += 1;
    }
    const jobs = await this.repository.recoverExpired(now);
    return { releasedReservations, containedInProgress, jobs };
  }
}

export const profileMediaCleanupWorkerService = new ProfileMediaCleanupWorkerService();
