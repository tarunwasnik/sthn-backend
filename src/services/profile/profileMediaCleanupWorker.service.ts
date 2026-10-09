import { CreatorApplication } from "../../models/creatorApplication.model";
import { CreatorProfile } from "../../models/creatorProfile.model";
import { CreatorService } from "../../models/creatorService.model";
import { ImageModerationAsset } from "../../models/imageModerationAsset.model";
import { ProfileMediaCleanupJobDocument } from "../../models/profileMediaCleanupJob.model";
import { UserProfile } from "../../models/userProfile.model";
import { profileMediaCleanupJobRepository } from "../../repositories/profileMediaCleanupJob.repository";

export type ProfileMediaCleanupEligibility =
  | Readonly<{ kind: "ELIGIBLE" }>
  | Readonly<{ kind: "STILL_REFERENCED" }>
  | Readonly<{ kind: "UNSAFE_PROVENANCE"; reason: string }>
  | Readonly<{ kind: "RETRYABLE_ERROR"; reason: string }>;

const references = (reference: string) => ({ $or: [{ avatar: reference }, { cover: reference }, { profilePhotos: reference }] });
const creatorReferences = (reference: string) => ({ $or: [{ avatarUrl: reference }, { coverUrl: reference }, { media: reference }] });
const bounded = (value: string) => value.slice(0, 500);

export class ProfileMediaCleanupWorkerService {
  constructor(private readonly repository = profileMediaCleanupJobRepository) {}

  async assess(job: ProfileMediaCleanupJobDocument): Promise<ProfileMediaCleanupEligibility> {
    try {
      const asset = await ImageModerationAsset.findOne({
        actorId: job.userId,
        trustedMediaReference: job.formerReference,
        providerAssetId: job.cloudinaryPublicId,
        status: "COMMITTED",
        committedEntityBinding: { $regex: `^USER_PROFILE:${job.profileId.toString()}:` },
      }).lean().exec();
      if (!asset) return { kind: "UNSAFE_PROVENANCE", reason: "Committed backend-owned profile asset provenance is absent." };

      const owner = await UserProfile.exists({ _id: job.profileId, userId: job.userId });
      if (!owner) return { kind: "UNSAFE_PROVENANCE", reason: "Cleanup job profile ownership no longer matches." };

      const [profileReference, sharedAsset, applicationReference, creatorReference, serviceReference] = await Promise.all([
        UserProfile.exists(references(job.formerReference)),
        ImageModerationAsset.exists({ providerAssetId: job.cloudinaryPublicId, status: "COMMITTED", committedEntityBinding: { $not: new RegExp(`^USER_PROFILE:${job.profileId.toString()}:`) } }),
        CreatorApplication.exists(creatorReferences(job.formerReference)),
        CreatorProfile.exists(creatorReferences(job.formerReference)),
        CreatorService.exists({ media: job.formerReference }),
      ]);
      if (profileReference || sharedAsset || applicationReference || creatorReference || serviceReference) return { kind: "STILL_REFERENCED" };
      return { kind: "ELIGIBLE" };
    } catch (error) {
      return { kind: "RETRYABLE_ERROR", reason: bounded(error instanceof Error ? error.message : "Cleanup safety query failed.") };
    }
  }

  async processNext(now = new Date(), leaseMs = 60_000) {
    const job = await this.repository.claimDue(now, leaseMs);
    if (!job) return null;
    const eligibility = await this.assess(job);
    if (eligibility.kind === "STILL_REFERENCED") {
      const finalized = await this.repository.skipStillReferenced(job._id, job.leaseToken!, now);
      return { job, eligibility, finalized: Boolean(finalized) };
    }
    if (eligibility.kind === "UNSAFE_PROVENANCE" || eligibility.kind === "RETRYABLE_ERROR") {
      const finalized = await this.repository.scheduleRetry(job._id, job.leaseToken!, now, eligibility.kind, eligibility.kind === "UNSAFE_PROVENANCE" ? eligibility.reason : eligibility.reason);
      return { job, eligibility, finalized: Boolean(finalized) };
    }
    // Deliberately retain the lease: B1 never invokes Cloudinary deletion or
    // marks a deletion job complete. A later destructive phase must re-check
    // authority under a safe exclusion mechanism before it finalizes this job.
    return { job, eligibility, finalized: false };
  }

  async processBatch(input: { now?: Date; limit?: number; leaseMs?: number } = {}) {
    const results: Array<Awaited<ReturnType<ProfileMediaCleanupWorkerService["processNext"]>>> = [];
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
    for (let index = 0; index < limit; index += 1) {
      try {
        const result = await this.processNext(input.now ?? new Date(), input.leaseMs ?? 60_000);
        if (!result) break;
        results.push(result);
      } catch (error) {
        results.push(null);
      }
    }
    return results;
  }

  async reconcile(now = new Date()) {
    return this.repository.recoverExpired(now);
  }
}

export const profileMediaCleanupWorkerService = new ProfileMediaCleanupWorkerService();
