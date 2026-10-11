import mongoose, { Types } from "mongoose";
import { ulid } from "ulid";
import { ImageModerationAssetDocument } from "../../models/imageModerationAsset.model";
import { temporaryImageAssetCleanupRepository, TemporaryImageAssetCleanupRepository } from "../../repositories/temporaryImageAssetCleanup.repository";
import { providerAssetGuardRepository, ProviderAssetGuardRepository } from "../../repositories/providerAssetGuard.repository";
import { deleteTemporaryImageFromCloudinarySafely, TemporaryImageDeletionOutcome } from "../../utils/uploadToCloudinary";
import { ImageModerationSurface } from "../../enums/imageModeration.enums";

const LEASE_MS = 5 * 60 * 1000;
const PROTECTED_RETRY_MS = 5 * 60 * 1000;
const MAX_RETRY_MS = 60 * 60 * 1000;

type Reservation = Readonly<{ assetId: Types.ObjectId; providerAssetId: string; guardId: Types.ObjectId; token: string; attemptCount: number }>;
export type TemporaryImageAssetCleanupResult =
  | Readonly<{ kind: "DELETED" | "ALREADY_MISSING" | "ALREADY_RELEASED"; assetId: Types.ObjectId }>
  | Readonly<{ kind: "PROTECTED" | "RETRY_SCHEDULED" | "AMBIGUOUS" | "NOT_DUE"; assetId?: Types.ObjectId }>;

const bounded = (value: string) => value.slice(0, 500);
const retryAt = (now: Date, attemptCount: number) => new Date(now.getTime() + Math.min(MAX_RETRY_MS, 60_000 * 2 ** Math.max(0, attemptCount - 1)));

export class TemporaryImageAssetReleaseError extends Error {
  constructor(readonly code: "NOT_AVAILABLE" | "COMMITTED") { super(code); this.name = "TemporaryImageAssetReleaseError"; }
}

/**
 * Deletes only expired or explicitly released, still-temporary provider bytes. The asset reservation and
 * provider guard form the exclusion boundary before the external Cloudinary call.
 */
export class TemporaryImageAssetCleanupService {
  constructor(
    private readonly repository: TemporaryImageAssetCleanupRepository = temporaryImageAssetCleanupRepository,
    private readonly guards: ProviderAssetGuardRepository = providerAssetGuardRepository,
    private readonly destroy: (publicId: string) => Promise<TemporaryImageDeletionOutcome> = deleteTemporaryImageFromCloudinarySafely,
  ) {}

  private async transaction<T>(work: (session: mongoose.ClientSession) => Promise<T>) {
    const session = await mongoose.startSession();
    try {
      let result!: T;
      await session.withTransaction(async () => { result = await work(session); });
      return result;
    } finally {
      await session.endSession();
    }
  }

  private async reserve(assetId: Types.ObjectId, now: Date): Promise<Reservation | TemporaryImageAssetCleanupResult> {
    return this.transaction(async (session) => {
      const asset = await this.repository.findById(assetId, session);
      const eligible = Boolean(asset && (asset.expiresAt <= now || asset.releaseRequestedAt && asset.releaseRequestedAt <= now));
      if (!asset || asset.status === "COMMITTED" || !eligible || !["PENDING", "RETRY_WAIT"].includes(asset.cleanupStatus) || Boolean(asset.cleanupNextAttemptAt && asset.cleanupNextAttemptAt > now)) return { kind: "NOT_DUE", assetId };

      if (await this.repository.hasProtectedReference({ asset, session })) {
        if (asset.releaseRequestedAt) await this.repository.invalidateActiveAdmissions(asset._id, now, session);
        else await this.repository.markAdmissionsExpired(asset._id, now, session);
        await this.repository.markAttemptExpired(asset._id, now, session);
        await this.repository.markProtected({ assetId: asset._id, now, nextAttemptAt: new Date(now.getTime() + PROTECTED_RETRY_MS), code: "PROTECTED_REFERENCE", message: "Expired temporary asset remains protected by an authoritative reference or active candidate session.", session });
        return { kind: "PROTECTED", assetId };
      }

      const token = `IMAC_${ulid()}`;
      const reserved = await this.repository.reserve({ assetId, token, leaseExpiresAt: new Date(now.getTime() + LEASE_MS), now, session });
      if (!reserved) return { kind: "NOT_DUE", assetId };

      if (reserved.releaseRequestedAt) await this.repository.invalidateActiveAdmissions(reserved._id, now, session);
      else await this.repository.markAdmissionsExpired(reserved._id, now, session);
      await this.repository.markAttemptExpired(reserved._id, now, session);
      const guard = await this.guards.locateTrusted({ providerAssetId: reserved.providerAssetId, session });
      const guardReserved = await this.guards.reserveDeletion({ guardId: guard._id, jobId: reserved._id, token, expiresAt: new Date(now.getTime() + LEASE_MS), session });
      if (!guardReserved) {
        await this.repository.releaseReservedAsProtected({ assetId: reserved._id, token, nextAttemptAt: new Date(now.getTime() + PROTECTED_RETRY_MS), code: "PROVIDER_REFERENCE_PRESENT", message: "Provider guard has a current authoritative reference.", session });
        return { kind: "PROTECTED", assetId };
      }
      return { assetId: reserved._id, providerAssetId: reserved.providerAssetId, guardId: guard._id, token, attemptCount: reserved.cleanupAttemptCount };
    });
  }

  private async startDeletion(reservation: Reservation, now: Date) {
    return this.transaction(async (session) => {
      const guard = await this.guards.startDeletion({ guardId: reservation.guardId, token: reservation.token, now, session });
      if (!guard) return false;
      const asset = await this.repository.startDeletion({ assetId: reservation.assetId, token: reservation.token, session });
      return Boolean(asset);
    });
  }

  private async complete(reservation: Reservation, outcome: "DELETED" | "ALREADY_MISSING", now: Date) {
    return this.transaction(async (session) => {
      const guard = await this.guards.markDeleted({ guardId: reservation.guardId, token: reservation.token, now, outcome, session });
      if (!guard) return false;
      const asset = await this.repository.complete({ assetId: reservation.assetId, token: reservation.token, now, session });
      return Boolean(asset);
    });
  }

  private async retry(reservation: Reservation, now: Date) {
    const nextAttemptAt = retryAt(now, reservation.attemptCount);
    const released = await this.transaction(async (session) => {
      const guard = await this.guards.releaseRetryableDeletion({ guardId: reservation.guardId, token: reservation.token, session });
      if (!guard) return false;
      const asset = await this.repository.retry({ assetId: reservation.assetId, token: reservation.token, nextAttemptAt, code: "PROVIDER_RETRYABLE_FAILURE", message: "Cloudinary deletion failed transiently; deletion will be retried while the asset remains reserved.", session });
      return Boolean(asset);
    });
    if (released) return true;
    await this.containUnknown(reservation, "RETRY_RELEASE_FAILED", "Could not safely release the provider deletion reservation after a transient provider failure.");
    return false;
  }

  private async containUnknown(reservation: Reservation, code: string, message: string) {
    await this.transaction(async (session) => {
      await this.guards.markUnknown({ guardId: reservation.guardId, token: reservation.token, session });
      await this.repository.markUnknown({ assetId: reservation.assetId, token: reservation.token, code, message: bounded(message), session });
    });
  }

  async processAsset(assetId: Types.ObjectId, now = new Date()): Promise<TemporaryImageAssetCleanupResult> {
    const reservation = await this.reserve(assetId, now);
    if (!("providerAssetId" in reservation)) return reservation;
    if (!await this.startDeletion(reservation, now)) {
      await this.containUnknown(reservation, "DELETION_START_CONFLICT", "Could not establish the durable provider deletion boundary.");
      return { kind: "AMBIGUOUS", assetId };
    }

    const outcome = await this.destroy(reservation.providerAssetId);
    if (outcome === "DELETED" || outcome === "ALREADY_MISSING") {
      if (await this.complete(reservation, outcome, now)) return { kind: outcome, assetId };
      await this.containUnknown(reservation, "DELETION_COMPLETION_CONFLICT", "Cloudinary reported deletion, but the durable cleanup completion could not be recorded.");
      return { kind: "AMBIGUOUS", assetId };
    }
    if (outcome === "RETRYABLE_FAILURE") {
      await this.retry(reservation, now);
      return { kind: "RETRY_SCHEDULED", assetId };
    }
    await this.containUnknown(reservation, "PROVIDER_AMBIGUOUS_FAILURE", "Cloudinary deletion outcome is ambiguous; automatic retries are contained.");
    return { kind: "AMBIGUOUS", assetId };
  }

  /** Marks a caller-owned temporary asset unreusable, then uses the normal guarded cleanup lifecycle. */
  async requestRelease(input: { actorId: Types.ObjectId; assetReference: string; surface: ImageModerationSurface; now?: Date }): Promise<{ assetReference: string; result: TemporaryImageAssetCleanupResult }> {
    const now = input.now ?? new Date();
    const release = await this.transaction<{ assetId: Types.ObjectId; immediate?: TemporaryImageAssetCleanupResult }>(async (session) => {
      const asset = await this.repository.findOwnedByReference({ assetReference: input.assetReference, actorId: input.actorId, session });
      if (!asset) throw new TemporaryImageAssetReleaseError("NOT_AVAILABLE");
      const attempt = await this.repository.findAttemptForRelease({ assetId: asset._id, actorId: input.actorId, surface: input.surface, session });
      if (!attempt) throw new TemporaryImageAssetReleaseError("NOT_AVAILABLE");
      if (asset.status === "COMMITTED") throw new TemporaryImageAssetReleaseError("COMMITTED");
      if (asset.cleanupStatus === "DELETED") return { assetId: asset._id, immediate: { kind: "ALREADY_RELEASED", assetId: asset._id } };
      if (["DELETE_RESERVED", "DELETE_IN_PROGRESS"].includes(asset.cleanupStatus)) return { assetId: asset._id, immediate: { kind: "NOT_DUE", assetId: asset._id } };
      if (asset.cleanupStatus === "DELETE_UNKNOWN") return { assetId: asset._id, immediate: { kind: "AMBIGUOUS", assetId: asset._id } };
      const requested = await this.repository.requestRelease({ assetId: asset._id, now, session });
      if (!requested) {
        throw new TemporaryImageAssetReleaseError("COMMITTED");
      }
      await this.repository.invalidateActiveAdmissions(asset._id, now, session);
      return { assetId: requested._id };
    });
    if (release.immediate) return { assetReference: input.assetReference, result: release.immediate };
    const result = await this.processAsset(release.assetId, now);
    return { assetReference: input.assetReference, result };
  }

  async reconcileExpiredReservations(now = new Date(), limit = 20) {
    let recovered = 0;
    let contained = 0;
    for (const asset of await this.repository.listExpiredReservations(now, limit)) {
      const token = asset.cleanupLeaseToken;
      if (!token) continue;
      const result = await this.transaction(async (session) => {
        const guard = await this.guards.findByProviderAssetId(asset.providerAssetId, session);
        if (!guard) return false;
        const released = await this.guards.recoverExpiredReservation({ guardId: guard._id, now, session });
        if (!released) return false;
        return Boolean(await this.repository.recoverReserved({ assetId: asset._id, token, nextAttemptAt: now, session }));
      });
      if (result) recovered += 1;
    }
    for (const asset of await this.repository.listExpiredDeletes(now, limit)) {
      const token = asset.cleanupLeaseToken;
      if (!token) continue;
      const guard = await this.guards.findByProviderAssetId(asset.providerAssetId);
      if (!guard) continue;
      await this.containUnknown({ assetId: asset._id, providerAssetId: asset.providerAssetId, guardId: guard._id, token, attemptCount: asset.cleanupAttemptCount }, "DELETION_LEASE_EXPIRED", "A process ended while provider deletion may have been in progress; the asset is contained for manual resolution.");
      contained += 1;
    }
    return { recovered, contained };
  }

  async processBatch(input: { now?: Date; limit?: number } = {}) {
    const now = input.now ?? new Date();
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
    const reconciliation = await this.reconcileExpiredReservations(now, limit);
    const due = await this.repository.listDue(now, limit);
    const results: TemporaryImageAssetCleanupResult[] = [];
    for (const asset of due) results.push(await this.processAsset(asset._id, now));
    return { reconciliation, results };
  }
}

export const temporaryImageAssetCleanupService = new TemporaryImageAssetCleanupService();
