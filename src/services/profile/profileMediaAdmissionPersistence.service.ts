import { createHash } from "node:crypto";
import mongoose, { Types } from "mongoose";
import { ImageModerationSurface } from "../../enums/imageModeration.enums";
import User from "../../models/User";
import { ProfileStatus, UserProfileDocument } from "../../models/userProfile.model";
import { userProfileRepository } from "../../repositories/userProfile.repository";
import { imageAdmissionService } from "../imageModeration/imageAdmission.service";
import { ImageModerationAsset } from "../../models/imageModerationAsset.model";
import { profileMediaCleanupJobRepository } from "../../repositories/profileMediaCleanupJob.repository";
import { providerAssetReferenceRepository } from "../../repositories/providerAssetReference.repository";
import { ProviderAssetReferenceDocument } from "../../models/providerAssetReference.model";
import { ImageAdmission } from "../../models/imageAdmission.model";
import { ProfileMediaAdmissionRequest, ProfileMediaClaim } from "./profileImageAdmissionContract";
import { providerAssetReferenceTransactionService, TrustedProviderAsset } from "./providerAssetReferenceTransaction.service";

type ProfileCreationFields = Pick<
  UserProfileDocument,
  "username" | "realName" | "dateOfBirth" | "country" | "city" | "languages" | "interests" | "bio"
>;

type ProfileFieldSet = Partial<Pick<
  UserProfileDocument,
  "username" | "realName" | "dateOfBirth" | "country" | "city" | "languages" | "interests" | "bio"
>>;

/**
 * This is a backend-only instruction, not a request DTO. The persistence
 * service derives the resulting status and version from the stored profile.
 */
export type ProfileSubmissionLifecycle = Readonly<{
  kind: "SUBMIT_INITIAL_OR_INCOMPLETE" | "RESUBMIT_REJECTED";
  submittedAt: Date;
}>;

export type ProfileMediaPersistenceTransactionContext = Readonly<{
  session: mongoose.ClientSession;
  actorId: Types.ObjectId;
  profile: UserProfileDocument;
  previousProfile?: Readonly<Record<string, unknown>>;
}>;

export type PersistProfileMediaAdmissionsInput = Readonly<{
  actorId: Types.ObjectId;
  media: ProfileMediaAdmissionRequest;
  /** A server-held profile snapshot version; never accept this from a client. */
  expectedProfileVersion?: number;
  /** Required only when the authenticated actor has no profile. Schema defaults retain the incomplete lifecycle. */
  createProfile?: ProfileCreationFields;
  /** Validated profile fields to persist in the same transaction as media. */
  profileFields?: ProfileFieldSet;
  /** Trusted workflow instruction; request payloads must never select these fields. */
  lifecycle?: ProfileSubmissionLifecycle;
  /** Validated account contact details to persist in the same transaction as the profile draft. */
  mobileContact?: Readonly<{ mobileCountryCode: string; mobileNumber: string }>;
  /** Limits this call site to an established lifecycle state without changing that state. */
  allowedExistingProfileStatuses?: readonly ProfileStatus[];
  /**
   * Trusted server-only database work. It runs inside this transaction and may
   * be retried by MongoDB; callbacks must use the supplied session and remain
   * idempotent. External or irreversible side effects are forbidden here.
   */
  withinTransaction?: (context: ProfileMediaPersistenceTransactionContext) => Promise<void>;
}>;

export type ProfileMediaPersistenceResult = Readonly<{
  profileId: Types.ObjectId;
  avatar: string;
  cover: string;
  profilePhotos: readonly string[];
  cleanup: Readonly<{ replacedAuthoritativeReferences: readonly string[] }>;
}>;

export class ProfileMediaAdmissionPersistenceError extends Error {
  constructor(readonly code: "PROFILE_NOT_FOUND" | "PROFILE_MEDIA_UNCHANGED_REFERENCE_INVALID" | "PROFILE_MEDIA_DUPLICATE_ADMISSION" | "PROFILE_MEDIA_VERSION_CONFLICT" | "PROFILE_MEDIA_INVALID_VERSION" | "PROFILE_MEDIA_PROFILE_NOT_ELIGIBLE" | "PROFILE_MEDIA_ACCOUNT_NOT_FOUND" | "PROFILE_MEDIA_INVALID_LIFECYCLE") {
    super(code);
    this.name = "ProfileMediaAdmissionPersistenceError";
  }
}

const destinationBinding = (profileId: Types.ObjectId, slot: string) =>
  `USER_PROFILE:${profileId.toString()}:${slot}`;

const references = (profile: Pick<UserProfileDocument, "avatar" | "cover" | "profilePhotos">) =>
  [profile.avatar, profile.cover, ...profile.profilePhotos].filter(Boolean);

const referenceSlots = (profile: Pick<UserProfileDocument, "avatar" | "cover" | "profilePhotos">) => [
  { slot: "avatar", reference: profile.avatar },
  { slot: "cover", reference: profile.cover },
  ...profile.profilePhotos.map((reference, index) => ({ slot: `photo:${index}`, reference })),
].filter((entry): entry is { slot: string; reference: string } => Boolean(entry.reference));

const cleanupEventKey = (profileId: Types.ObjectId, sourceVersion: number, slot: string, reference: string) =>
  `PROFILE_MEDIA:${profileId.toString()}:${sourceVersion}:${slot}:${createHash("sha256").update(reference).digest("hex")}`;

type ResolvedMedia = Readonly<{ reference: string; trusted?: TrustedProviderAsset }>;
type DesiredSlot = Readonly<{ slot: string; media: ResolvedMedia }>;

const profileEntity = (profileId: Types.ObjectId, slot: string) => ({
  entityType: "USER_PROFILE" as const,
  entityId: profileId,
  slot,
});

const previousSnapshot = (profile: UserProfileDocument) => Object.freeze({
  ...profile.toObject(),
  profilePhotos: Object.freeze([...profile.profilePhotos]),
  languages: Object.freeze([...profile.languages]),
  interests: Object.freeze([...profile.interests]),
});

export class ProfileMediaAdmissionPersistenceService {
  async persist(input: PersistProfileMediaAdmissionsInput): Promise<ProfileMediaPersistenceResult> {
    if (input.expectedProfileVersion !== undefined && (!Number.isInteger(input.expectedProfileVersion) || input.expectedProfileVersion < 0)) {
      throw new ProfileMediaAdmissionPersistenceError("PROFILE_MEDIA_INVALID_VERSION");
    }

    const session = await mongoose.startSession();
    try {
      let result: ProfileMediaPersistenceResult | undefined;
      await session.withTransaction(async () => {
        let profile = await userProfileRepository.findByUserId(input.actorId, session);
        const existedAtTransactionStart = Boolean(profile);
        const previousProfile = profile ? previousSnapshot(profile) : undefined;
        if (!profile) {
          if (!input.createProfile) throw new ProfileMediaAdmissionPersistenceError("PROFILE_NOT_FOUND");
          if (input.expectedProfileVersion !== undefined) throw new ProfileMediaAdmissionPersistenceError("PROFILE_MEDIA_VERSION_CONFLICT");
          profile = await userProfileRepository.createOwned({ ...input.createProfile, userId: input.actorId }, session);
        } else if (input.allowedExistingProfileStatuses && !input.allowedExistingProfileStatuses.includes(profile.profileStatus)) {
          throw new ProfileMediaAdmissionPersistenceError("PROFILE_MEDIA_PROFILE_NOT_ELIGIBLE");
        }

        if (input.mobileContact) {
          const account = await User.findOneAndUpdate(
            { _id: input.actorId },
            { $set: input.mobileContact },
            { new: true, session, runValidators: true },
          ).exec();
          if (!account) throw new ProfileMediaAdmissionPersistenceError("PROFILE_MEDIA_ACCOUNT_NOT_FOUND");
        }

        const originalReferences = references(profile);
        const consumedAdmissionReferences = new Set<string>();
        const resolve = async (
          claim: ProfileMediaClaim,
          surface: ImageModerationSurface,
          slot: string,
          existingReferences: readonly string[],
        ): Promise<ResolvedMedia> => {
          if (claim.kind === "UNCHANGED") {
            if (!existingReferences.includes(claim.reference)) {
              throw new ProfileMediaAdmissionPersistenceError("PROFILE_MEDIA_UNCHANGED_REFERENCE_INVALID");
            }
            return { reference: claim.reference };
          }
          if (consumedAdmissionReferences.has(claim.admissionReference)) {
            throw new ProfileMediaAdmissionPersistenceError("PROFILE_MEDIA_DUPLICATE_ADMISSION");
          }
          consumedAdmissionReferences.add(claim.admissionReference);
          const consumed = await imageAdmissionService.consumeAdmissionReferenceInSession({
            session,
            admissionReference: claim.admissionReference,
            actorId: input.actorId,
            expectedSurface: surface,
            destinationBinding: destinationBinding(profile._id, slot),
          });
          const admission = await ImageAdmission.findOne({
            admissionReference: claim.admissionReference,
            actorId: input.actorId,
            status: "CONSUMED",
            committedReference: destinationBinding(profile._id, slot),
          }).session(session).exec();
          if (!admission) throw new Error("Consumed admission could not be resolved in its transaction");
          const trusted = await providerAssetReferenceTransactionService.resolveTrustedCommittedAsset({
            session,
            actorId: input.actorId,
            assetId: admission.assetId,
            destinationBinding: destinationBinding(profile._id, slot),
          });
          if (trusted.authoritativeReference !== consumed.trustedMediaReference) {
            throw new Error("Consumed admission media reference does not match trusted asset provenance");
          }
          return { reference: consumed.trustedMediaReference, trusted };
        };

        const set: Record<string, unknown> = { ...(input.profileFields ?? {}) };
        if (input.lifecycle) {
          if (!(input.lifecycle.submittedAt instanceof Date) || Number.isNaN(input.lifecycle.submittedAt.getTime())) {
            throw new ProfileMediaAdmissionPersistenceError("PROFILE_MEDIA_INVALID_LIFECYCLE");
          }
          const currentStatus = profile.profileStatus;
          const submitInitial = input.lifecycle.kind === "SUBMIT_INITIAL_OR_INCOMPLETE";
          const resubmitRejected = input.lifecycle.kind === "RESUBMIT_REJECTED";
          const allowed = submitInitial
            ? (!existedAtTransactionStart || currentStatus === "incomplete")
            : resubmitRejected && existedAtTransactionStart && currentStatus === "rejected";
          if (!allowed) throw new ProfileMediaAdmissionPersistenceError("PROFILE_MEDIA_INVALID_LIFECYCLE");
          set.profileStatus = "pending_verification";
          set.verificationSubmittedAt = input.lifecycle.submittedAt;
          set.verificationSubmissionVersion = (profile.verificationSubmissionVersion ?? 0) + 1;
          set.rejectionReason = "";
        }
        let avatar: ResolvedMedia | undefined;
        let cover: ResolvedMedia | undefined;
        let profilePhotos: readonly ResolvedMedia[] | undefined;
        if (input.media.avatar !== undefined) {
          avatar = await resolve(input.media.avatar, "USER_PROFILE_AVATAR", "avatar", [profile.avatar]);
          set.avatar = avatar.reference;
        }
        if (input.media.cover !== undefined) {
          cover = await resolve(input.media.cover, "USER_PROFILE_COVER", "cover", [profile.cover]);
          set.cover = cover.reference;
        }
        if (input.media.profilePhotos !== undefined) {
          if (input.media.profilePhotos.length < 2 || input.media.profilePhotos.length > 6) {
            throw new ProfileMediaAdmissionPersistenceError("PROFILE_MEDIA_UNCHANGED_REFERENCE_INVALID");
          }
          profilePhotos = await Promise.all(input.media.profilePhotos.map((claim, index) =>
            resolve(claim, "USER_PROFILE_PHOTO", `photo:${index}`, profile.profilePhotos)));
          set.profilePhotos = profilePhotos.map((item) => item.reference);
        }

        const version = input.expectedProfileVersion ?? profile.__v ?? 0;
        const persisted = Object.keys(set).length === 0
          ? profile
          : await userProfileRepository.updateOwnedAtVersion({
            profileId: profile._id,
            userId: input.actorId,
            expectedVersion: version,
            set,
            session,
          });
        if (!persisted) throw new ProfileMediaAdmissionPersistenceError("PROFILE_MEDIA_VERSION_CONFLICT");

        const desiredSlots: DesiredSlot[] = [
          { slot: "avatar", media: avatar ?? { reference: persisted.avatar } },
          { slot: "cover", media: cover ?? { reference: persisted.cover } },
          ...(profilePhotos ?? persisted.profilePhotos.map((reference) => ({ reference }))).map((media, index) => ({ slot: `photo:${index}`, media })),
        ].filter((entry) => Boolean(entry.media.reference));
        const currentReferences = await providerAssetReferenceRepository.findCurrentByEntity("USER_PROFILE", persisted._id, session);
        const exactUnchangedSlots = new Set(desiredSlots.filter((desired) =>
          !desired.media.trusted && currentReferences.some((current) => current.slot === desired.slot && current.authoritativeReference === desired.media.reference),
        ).map((desired) => desired.slot));
        for (const slot of exactUnchangedSlots) {
          const current = currentReferences.find((reference) => reference.slot === slot);
          if (current) await providerAssetReferenceTransactionService.retainUnchanged({
            session,
            entity: profileEntity(persisted._id, slot),
            guardId: current.guardId,
            authoritativeReference: current.authoritativeReference,
          });
        }
        const released: ProviderAssetReferenceDocument[] = [];
        for (const current of currentReferences) {
          const desired = desiredSlots.find((entry) => entry.slot === current.slot);
          if (desired && !desired.media.trusted && desired.media.reference === current.authoritativeReference) continue;
          const release = await providerAssetReferenceTransactionService.releaseFormer({
            session,
            entity: profileEntity(persisted._id, current.slot),
            former: current,
          });
          released.push(release.released);
        }
        for (const desired of desiredSlots) {
          if (exactUnchangedSlots.has(desired.slot)) continue;
          if (desired.media.trusted) {
            await providerAssetReferenceTransactionService.acquireTrusted({
              session,
              entity: profileEntity(persisted._id, desired.slot),
              trusted: desired.media.trusted,
            });
            continue;
          }
          const former = released.find((reference) => reference.authoritativeReference === desired.media.reference);
          if (former) await providerAssetReferenceTransactionService.restoreReleased({
            session,
            entity: profileEntity(persisted._id, desired.slot),
            former,
          });
        }

        const committedReferences = references(persisted);
        const replaced = originalReferences.filter((reference) => !committedReferences.includes(reference));
        const replacedReferences = new Set(replaced);
        const cleanupCandidates = new Map<string, { slot: string; reference: string; providerAssetId: string }>();
        for (const former of released) {
          if (!replacedReferences.has(former.authoritativeReference)) continue;
          const remaining = await providerAssetReferenceRepository.findCurrentByGuard(former.guardId, session);
          if (remaining.length !== 0) continue;
          const asset = await ImageModerationAsset.findOne({
            _id: former.imageModerationAssetId,
            actorId: input.actorId,
            trustedMediaReference: former.authoritativeReference,
            status: "COMMITTED",
          }).session(session).exec();
          if (!asset || asset.providerAssetId !== (await providerAssetReferenceTransactionService.resolveTrustedCommittedAsset({
            session,
            actorId: input.actorId,
            assetId: asset._id,
            destinationBinding: asset.committedEntityBinding!,
          })).providerAssetId) continue;
          const key = `${former.guardId.toString()}:${former.authoritativeReference}`;
          if (!cleanupCandidates.has(key)) cleanupCandidates.set(key, { slot: former.slot, reference: former.authoritativeReference, providerAssetId: asset.providerAssetId });
        }
        for (const candidate of cleanupCandidates.values()) {
          await profileMediaCleanupJobRepository.enqueue({
            replacementEventKey: cleanupEventKey(persisted._id, version, candidate.slot, candidate.reference),
            userId: input.actorId,
            profileId: persisted._id,
            formerReference: candidate.reference,
            cloudinaryPublicId: candidate.providerAssetId,
            slot: candidate.slot,
            session,
          });
        }
        if (input.withinTransaction) {
          await input.withinTransaction({ session, actorId: input.actorId, profile: persisted, previousProfile });
        }
        result = {
          profileId: persisted._id,
          avatar: persisted.avatar,
          cover: persisted.cover,
          profilePhotos: [...persisted.profilePhotos],
          cleanup: {
            replacedAuthoritativeReferences: replaced,
          },
        };
      });
      if (!result) throw new Error("Profile media transaction did not produce a result");
      return result;
    } finally {
      await session.endSession();
    }
  }
}

export const profileMediaAdmissionPersistenceService = new ProfileMediaAdmissionPersistenceService();
