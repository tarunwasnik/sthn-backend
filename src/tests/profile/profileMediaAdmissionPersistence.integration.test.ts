import assert from "node:assert/strict";
import test from "node:test";
import mongoose, { Types } from "mongoose";
import {
  clearPhase7HDatabase,
  connectPhase7HDatabase,
  disconnectPhase7HDatabase,
} from "../financial/phase7h/helpers/database";
import { ImageAdmission } from "../../models/imageAdmission.model";
import { ImageModerationAsset } from "../../models/imageModerationAsset.model";
import { ImageModerationAttempt } from "../../models/imageModerationAttempt.model";
import { UserProfile } from "../../models/userProfile.model";
import { ProfileMediaCleanupJob } from "../../models/profileMediaCleanupJob.model";
import { ImageModerationSurface } from "../../enums/imageModeration.enums";
import {
  profileMediaAdmissionPersistenceService,
  ProfileMediaAdmissionPersistenceError,
} from "../../services/profile/profileMediaAdmissionPersistence.service";
import { providerAssetReferenceTransactionService } from "../../services/profile/providerAssetReferenceTransaction.service";
import { ProviderAssetGuard } from "../../models/providerAssetGuard.model";
import { ProviderAssetReference } from "../../models/providerAssetReference.model";

const sha = "a".repeat(64);
const future = () => new Date(Date.now() + 60_000);
const profileFields = (userId: Types.ObjectId) => ({
  userId,
  username: `profile-${userId}`,
  dateOfBirth: new Date("1990-01-01"),
  interests: [],
  bio: "Existing profile.",
  avatar: "https://stored.test/avatar",
  cover: "https://stored.test/cover",
  profilePhotos: ["https://stored.test/photo-one", "https://stored.test/photo-two"],
  profileStatus: "verified" as const,
  verificationSubmissionVersion: 7,
});

async function seedProfile(userId = new Types.ObjectId()) {
  return UserProfile.create(profileFields(userId));
}

async function seedAdmission(actorId: Types.ObjectId, surface: ImageModerationSurface, reference: string) {
  const pendingBinding = `PENDING:${actorId}:${surface}`;
  const asset = await ImageModerationAsset.create({
    assetReference: `ima_${new Types.ObjectId()}`,
    actorId,
    contentSha256: sha,
    providerAssetId: `provider_${new Types.ObjectId()}`,
    trustedMediaReference: reference,
    expiresAt: future(),
    retentionDeadline: future(),
  });
  const attempt = await ImageModerationAttempt.create({
    attemptReference: `imat_${new Types.ObjectId()}`,
    assetId: asset._id,
    actorId,
    contentSha256: sha,
    surface,
    entityBinding: pendingBinding,
    status: "PASSED",
    provenanceModel: { identifier: "test", revision: "test", artifactSha256: sha },
    policy: { key: "TEST", version: "V1" },
    expiresAt: future(),
    retentionDeadline: future(),
  });
  const admission = await ImageAdmission.create({
    admissionReference: `imauth_${new Types.ObjectId()}`,
    attemptId: attempt._id,
    assetId: asset._id,
    actorId,
    contentSha256: sha,
    surface,
    entityBinding: pendingBinding,
    expiresAt: future(),
  });
  return { asset, admission };
}

async function seedTrustedFormerMedia(
  profile: Awaited<ReturnType<typeof seedProfile>>,
  slot: string,
  reference: string,
) {
  return ImageModerationAsset.create({
    assetReference: `ima_${new Types.ObjectId()}`,
    actorId: profile.userId,
    contentSha256: sha,
    providerAssetId: `profile_media/${new Types.ObjectId()}`,
    trustedMediaReference: reference,
    status: "COMMITTED",
    expiresAt: future(),
    retentionDeadline: future(),
    committedAt: new Date(),
    committedEntityBinding: `USER_PROFILE:${profile._id}:${slot}`,
  });
}

async function seedTrackedFormerMedia(
  profile: Awaited<ReturnType<typeof seedProfile>>,
  slot: string,
  reference: string,
) {
  const asset = await seedTrustedFormerMedia(profile, slot, reference);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const trusted = await providerAssetReferenceTransactionService.resolveTrustedCommittedAsset({
        session,
        actorId: profile.userId,
        assetId: asset._id,
        destinationBinding: `USER_PROFILE:${profile._id}:${slot}`,
      });
      await providerAssetReferenceTransactionService.acquireTrusted({
        session,
        entity: { entityType: "USER_PROFILE", entityId: profile._id, slot },
        trusted,
      });
    });
  } finally {
    await session.endSession();
  }
  return asset;
}

const admissionClaim = (admissionReference: string) => ({ kind: "ADMISSION" as const, admissionReference });
const unchanged = (reference: string) => ({ kind: "UNCHANGED" as const, reference });

async function states(ids: { asset: Types.ObjectId; admission: Types.ObjectId }) {
  return {
    asset: await ImageModerationAsset.findById(ids.asset).lean(),
    admission: await ImageAdmission.findById(ids.admission).lean(),
  };
}

test.before(async () => {
  process.env.NODE_ENV = "test";
  await connectPhase7HDatabase();
});
test.beforeEach(clearPhase7HDatabase);
test.after(disconnectPhase7HDatabase);

test("commits a trusted avatar admission with the profile update", async () => {
  const profile = await seedProfile();
  const former = await seedTrackedFormerMedia(profile, "avatar", "https://stored.test/avatar");
  const seeded = await seedAdmission(profile.userId, "USER_PROFILE_AVATAR", "https://trusted.test/new-avatar");
  const result = await profileMediaAdmissionPersistenceService.persist({
    actorId: profile.userId,
    media: { avatar: admissionClaim(seeded.admission.admissionReference) },
  });

  assert.equal(result.avatar, "https://trusted.test/new-avatar");
  assert.deepEqual(result.cleanup.replacedAuthoritativeReferences, ["https://stored.test/avatar"]);
  assert.equal((await UserProfile.findById(profile._id))?.avatar, "https://trusted.test/new-avatar");
  const persisted = await states({ asset: seeded.asset._id, admission: seeded.admission._id });
  assert.equal(persisted.admission?.status, "CONSUMED");
  assert.equal(persisted.asset?.status, "COMMITTED");
  assert.equal(persisted.admission?.committedReference, `USER_PROFILE:${profile._id}:avatar`);
  const cleanup = await ProfileMediaCleanupJob.findOne({ profileId: profile._id, formerReference: former.trustedMediaReference });
  assert.equal(cleanup?.cloudinaryPublicId, former.providerAssetId);
  assert.equal(cleanup?.slot, "avatar");
  const current = await ProviderAssetReference.find({ entityType: "USER_PROFILE", entityId: profile._id, state: "CURRENT" });
  assert.equal(current.length, 1);
  assert.equal(current[0].slot, "avatar");
  assert.equal(current[0].authoritativeReference, "https://trusted.test/new-avatar");
  for (const guard of await ProviderAssetGuard.find()) {
    assert.equal(guard.currentReferenceCount, await ProviderAssetReference.countDocuments({ guardId: guard._id, state: "CURRENT" }));
  }
});

test("creates an owned incomplete profile before binding a new admission", async () => {
  const actorId = new Types.ObjectId();
  const seeded = await seedAdmission(actorId, "USER_PROFILE_AVATAR", "https://trusted.test/created-profile-avatar");
  const result = await profileMediaAdmissionPersistenceService.persist({
    actorId,
    createProfile: {
      username: `created-${actorId}`,
      dateOfBirth: new Date("1990-01-01"),
      languages: [],
      interests: [],
      bio: "Created from a validated profile workflow.",
    },
    media: { avatar: admissionClaim(seeded.admission.admissionReference) },
  });

  const created = await UserProfile.findOne({ userId: actorId });
  assert.equal(created?._id.toString(), result.profileId.toString());
  assert.equal(created?.profileStatus, "incomplete");
  assert.equal(created?.avatar, "https://trusted.test/created-profile-avatar");
  assert.equal((await ImageAdmission.findById(seeded.admission._id))?.committedReference, `USER_PROFILE:${created?._id}:avatar`);
});

test("commits a trusted cover admission with the profile update", async () => {
  const profile = await seedProfile();
  const former = await seedTrackedFormerMedia(profile, "cover", "https://stored.test/cover");
  const seeded = await seedAdmission(profile.userId, "USER_PROFILE_COVER", "https://trusted.test/new-cover");
  await profileMediaAdmissionPersistenceService.persist({
    actorId: profile.userId,
    media: { cover: admissionClaim(seeded.admission.admissionReference) },
  });

  assert.equal((await UserProfile.findById(profile._id))?.cover, "https://trusted.test/new-cover");
  const persisted = await states({ asset: seeded.asset._id, admission: seeded.admission._id });
  assert.equal(persisted.admission?.status, "CONSUMED");
  assert.equal(persisted.asset?.status, "COMMITTED");
  assert.equal((await ProfileMediaCleanupJob.findOne({ formerReference: former.trustedMediaReference }))?.slot, "cover");
});

test("preserves mixed unchanged and new ordered gallery media", async () => {
  const profile = await seedProfile();
  const former = await seedTrackedFormerMedia(profile, "photo:0", "https://stored.test/photo-one");
  const seeded = await seedAdmission(profile.userId, "USER_PROFILE_PHOTO", "https://trusted.test/new-photo");
  const result = await profileMediaAdmissionPersistenceService.persist({
    actorId: profile.userId,
    media: {
      profilePhotos: [admissionClaim(seeded.admission.admissionReference), unchanged("https://stored.test/photo-two")],
    },
  });

  assert.deepEqual(result.profilePhotos, ["https://trusted.test/new-photo", "https://stored.test/photo-two"]);
  assert.deepEqual((await UserProfile.findById(profile._id))?.profilePhotos, result.profilePhotos);
  assert.equal((await ImageAdmission.findById(seeded.admission._id))?.committedReference, `USER_PROFILE:${profile._id}:photo:0`);
  assert.equal((await ProfileMediaCleanupJob.findOne({ formerReference: former.trustedMediaReference }))?.slot, "photo:0");
});

test("unchanged or still-referenced trusted media creates no cleanup intent", async () => {
  const profile = await seedProfile();
  await seedTrackedFormerMedia(profile, "avatar", "https://stored.test/avatar");
  await profileMediaAdmissionPersistenceService.persist({
    actorId: profile.userId,
    media: { avatar: unchanged("https://stored.test/avatar") },
  });
  assert.equal(await ProfileMediaCleanupJob.countDocuments(), 0);
});

test("unproven legacy references never authorize cleanup", async () => {
  const profile = await seedProfile();
  const seeded = await seedAdmission(profile.userId, "USER_PROFILE_AVATAR", "https://trusted.test/replacement");
  await profileMediaAdmissionPersistenceService.persist({
    actorId: profile.userId,
    media: { avatar: admissionClaim(seeded.admission.admissionReference) },
  });
  assert.equal(await ProfileMediaCleanupJob.countDocuments(), 0);
  assert.equal(await ProviderAssetReference.countDocuments({ authoritativeReference: "https://stored.test/avatar", state: "CURRENT" }), 0);
});

test("rejects arbitrary unchanged media references", async () => {
  const profile = await seedProfile();
  await assert.rejects(
    profileMediaAdmissionPersistenceService.persist({
      actorId: profile.userId,
      media: { avatar: unchanged("https://attacker.test/not-grandfathered") },
    }),
    ProfileMediaAdmissionPersistenceError,
  );
  assert.equal((await UserProfile.findById(profile._id))?.avatar, "https://stored.test/avatar");
});

test("rejects wrong actor and wrong surface claims without consuming them", async () => {
  const actorProfile = await seedProfile();
  const otherProfile = await seedProfile();
  const actorAdmission = await seedAdmission(actorProfile.userId, "USER_PROFILE_AVATAR", "https://trusted.test/actor");
  const wrongSurface = await seedAdmission(otherProfile.userId, "USER_PROFILE_COVER", "https://trusted.test/surface");

  await assert.rejects(() => profileMediaAdmissionPersistenceService.persist({
    actorId: otherProfile.userId,
    media: { avatar: admissionClaim(actorAdmission.admission.admissionReference) },
  }));
  await assert.rejects(() => profileMediaAdmissionPersistenceService.persist({
    actorId: otherProfile.userId,
    media: { avatar: admissionClaim(wrongSurface.admission.admissionReference) },
  }));

  for (const seeded of [actorAdmission, wrongSurface]) {
    const persisted = await states({ asset: seeded.asset._id, admission: seeded.admission._id });
    assert.equal(persisted.admission?.status, "ACTIVE");
    assert.equal(persisted.asset?.status, "TEMPORARY");
  }
});

test("rejects duplicate admissions and rolls back any first in-transaction claim", async () => {
  const profile = await seedProfile();
  const seeded = await seedAdmission(profile.userId, "USER_PROFILE_AVATAR", "https://trusted.test/duplicate");
  await assert.rejects(() => profileMediaAdmissionPersistenceService.persist({
    actorId: profile.userId,
    media: {
      avatar: admissionClaim(seeded.admission.admissionReference),
      // The service, not the caller, rejects cross-slot replay before commit.
      cover: admissionClaim(seeded.admission.admissionReference),
    },
  }), ProfileMediaAdmissionPersistenceError);

  const persisted = await states({ asset: seeded.asset._id, admission: seeded.admission._id });
  assert.equal(persisted.admission?.status, "ACTIVE");
  assert.equal(persisted.asset?.status, "TEMPORARY");
});

test("commits multiple admissions atomically with one profile media write", async () => {
  const profile = await seedProfile();
  await seedTrackedFormerMedia(profile, "avatar", "https://stored.test/avatar");
  await seedTrackedFormerMedia(profile, "cover", "https://stored.test/cover");
  const avatar = await seedAdmission(profile.userId, "USER_PROFILE_AVATAR", "https://trusted.test/avatar-two");
  const cover = await seedAdmission(profile.userId, "USER_PROFILE_COVER", "https://trusted.test/cover-two");
  await profileMediaAdmissionPersistenceService.persist({
    actorId: profile.userId,
    media: { avatar: admissionClaim(avatar.admission.admissionReference), cover: admissionClaim(cover.admission.admissionReference) },
  });

  const committed = await UserProfile.findById(profile._id);
  assert.equal(committed?.avatar, "https://trusted.test/avatar-two");
  assert.equal(committed?.cover, "https://trusted.test/cover-two");
  for (const seeded of [avatar, cover]) {
    const persisted = await states({ asset: seeded.asset._id, admission: seeded.admission._id });
    assert.equal(persisted.admission?.status, "CONSUMED");
    assert.equal(persisted.asset?.status, "COMMITTED");
  }
  const cleanup = await ProfileMediaCleanupJob.find({ profileId: profile._id }).sort({ slot: 1 });
  assert.equal(cleanup.length, 2);
  assert.notEqual(cleanup[0].replacementEventKey, cleanup[1].replacementEventKey);
  assert.deepEqual(cleanup.map((job) => job.slot), ["avatar", "cover"]);
});

test("a failed version-aware profile write rolls back admission consumption", async () => {
  const profile = await seedProfile();
  const seeded = await seedAdmission(profile.userId, "USER_PROFILE_AVATAR", "https://trusted.test/rollback");
  await assert.rejects(() => profileMediaAdmissionPersistenceService.persist({
    actorId: profile.userId,
    expectedProfileVersion: 99,
    media: { avatar: admissionClaim(seeded.admission.admissionReference) },
  }), ProfileMediaAdmissionPersistenceError);

  assert.equal((await UserProfile.findById(profile._id))?.avatar, "https://stored.test/avatar");
  const persisted = await states({ asset: seeded.asset._id, admission: seeded.admission._id });
  assert.equal(persisted.admission?.status, "ACTIVE");
  assert.equal(persisted.asset?.status, "TEMPORARY");
});

test("a stale profile snapshot conflicts without committing its admission", async () => {
  const profile = await seedProfile();
  await UserProfile.updateOne({ _id: profile._id }, { $set: { bio: "changed" }, $inc: { __v: 1 } });
  const seeded = await seedAdmission(profile.userId, "USER_PROFILE_COVER", "https://trusted.test/stale");
  await assert.rejects(() => profileMediaAdmissionPersistenceService.persist({
    actorId: profile.userId,
    expectedProfileVersion: 0,
    media: { cover: admissionClaim(seeded.admission.admissionReference) },
  }), ProfileMediaAdmissionPersistenceError);

  assert.equal((await UserProfile.findById(profile._id))?.cover, "https://stored.test/cover");
  const persisted = await states({ asset: seeded.asset._id, admission: seeded.admission._id });
  assert.equal(persisted.admission?.status, "ACTIVE");
  assert.equal(persisted.asset?.status, "TEMPORARY");
});

test("omitted media fields preserve authoritative media without consuming admissions", async () => {
  const profile = await seedProfile();
  const result = await profileMediaAdmissionPersistenceService.persist({ actorId: profile.userId, media: {} });
  assert.equal(result.avatar, "https://stored.test/avatar");
  assert.equal(result.cover, "https://stored.test/cover");
  assert.deepEqual(result.profilePhotos, ["https://stored.test/photo-one", "https://stored.test/photo-two"]);
  assert.equal((await UserProfile.findById(profile._id))?.__v, 0);
});

test("trusted transaction callback sees committed-in-transaction media and commits its session-aware write", async () => {
  const profile = await seedProfile();
  const seeded = await seedAdmission(profile.userId, "USER_PROFILE_AVATAR", "https://trusted.test/callback-avatar");
  let observedPrevious: unknown;
  await profileMediaAdmissionPersistenceService.persist({
    actorId: profile.userId,
    media: { avatar: admissionClaim(seeded.admission.admissionReference) },
    withinTransaction: async ({ session, profile: current, previousProfile }) => {
      assert.equal(session.inTransaction(), true);
      assert.equal(current.avatar, "https://trusted.test/callback-avatar");
      observedPrevious = previousProfile?.avatar;
      await UserProfile.updateOne({ _id: current._id }, { $set: { bio: "callback-committed" } }, { session });
    },
  });
  assert.equal(observedPrevious, "https://stored.test/avatar");
  assert.equal((await UserProfile.findById(profile._id))?.bio, "callback-committed");
  assert.equal((await ImageAdmission.findById(seeded.admission._id))?.status, "CONSUMED");
});

test("transaction callback failure rolls back profile, admission, and asset promotion", async () => {
  const profile = await seedProfile();
  await seedTrackedFormerMedia(profile, "avatar", "https://stored.test/avatar");
  const seeded = await seedAdmission(profile.userId, "USER_PROFILE_AVATAR", "https://trusted.test/callback-rollback");
  await assert.rejects(() => profileMediaAdmissionPersistenceService.persist({
    actorId: profile.userId,
    media: { avatar: admissionClaim(seeded.admission.admissionReference) },
    withinTransaction: async () => { throw new Error("callback failure"); },
  }), /callback failure/);
  assert.equal((await UserProfile.findById(profile._id))?.avatar, "https://stored.test/avatar");
  const persisted = await states({ asset: seeded.asset._id, admission: seeded.admission._id });
  assert.equal(persisted.admission?.status, "ACTIVE");
  assert.equal(persisted.asset?.status, "TEMPORARY");
  assert.equal(await ProfileMediaCleanupJob.countDocuments(), 0);
});

test("stale versions and invalid admissions prevent callback execution", async () => {
  const profile = await seedProfile();
  const stale = await seedAdmission(profile.userId, "USER_PROFILE_AVATAR", "https://trusted.test/stale-callback");
  let calls = 0;
  await assert.rejects(() => profileMediaAdmissionPersistenceService.persist({ actorId: profile.userId, expectedProfileVersion: 99, media: { avatar: admissionClaim(stale.admission.admissionReference) }, withinTransaction: async () => { calls += 1; } }));
  const invalid = await seedAdmission(profile.userId, "USER_PROFILE_COVER", "https://trusted.test/invalid-callback");
  await ImageModerationAsset.updateOne({ _id: invalid.asset._id }, { $set: { status: "INVALIDATED" } });
  await assert.rejects(() => profileMediaAdmissionPersistenceService.persist({ actorId: profile.userId, media: { cover: admissionClaim(invalid.admission.admissionReference) }, withinTransaction: async () => { calls += 1; } }));
  assert.equal(calls, 0);
});

test("releases removed tracked gallery media and enqueues cleanup only after its final reference", async () => {
  const profile = await seedProfile();
  await UserProfile.updateOne({ _id: profile._id }, { $set: { profilePhotos: ["https://stored.test/photo-one", "https://stored.test/photo-two", "https://stored.test/photo-three"] } });
  const removed = await seedTrackedFormerMedia(profile, "photo:2", "https://stored.test/photo-three");
  await profileMediaAdmissionPersistenceService.persist({
    actorId: profile.userId,
    media: { profilePhotos: [unchanged("https://stored.test/photo-one"), unchanged("https://stored.test/photo-two")] },
  });
  assert.deepEqual((await UserProfile.findById(profile._id))?.profilePhotos, ["https://stored.test/photo-one", "https://stored.test/photo-two"]);
  assert.equal(await ProviderAssetReference.countDocuments({ imageModerationAssetId: removed._id, state: "CURRENT" }), 0);
  assert.equal((await ProfileMediaCleanupJob.findOne({ formerReference: removed.trustedMediaReference }))?.cloudinaryPublicId, removed.providerAssetId);
});

test("shared provider media remains protected when one profile releases its reference", async () => {
  const profile = await seedProfile();
  const former = await seedTrackedFormerMedia(profile, "avatar", "https://stored.test/avatar");
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const trusted = await providerAssetReferenceTransactionService.resolveTrustedCommittedAsset({
        session,
        actorId: profile.userId,
        assetId: former._id,
        destinationBinding: `USER_PROFILE:${profile._id}:avatar`,
      });
      await providerAssetReferenceTransactionService.acquireTrusted({
        session,
        entity: { entityType: "CREATOR_PROFILE", entityId: new Types.ObjectId(), slot: "avatar" },
        trusted,
      });
    });
  } finally {
    await session.endSession();
  }
  const replacement = await seedAdmission(profile.userId, "USER_PROFILE_AVATAR", "https://trusted.test/shared-replacement");
  await profileMediaAdmissionPersistenceService.persist({ actorId: profile.userId, media: { avatar: admissionClaim(replacement.admission.admissionReference) } });
  assert.equal(await ProviderAssetReference.countDocuments({ imageModerationAssetId: former._id, state: "CURRENT" }), 1);
  assert.equal(await ProfileMediaCleanupJob.countDocuments({ formerReference: former.trustedMediaReference }), 0);
  const guard = await ProviderAssetGuard.findOne({ providerAssetId: former.providerAssetId });
  assert.equal(guard?.currentReferenceCount, 1);
});

test("reference acquisition failure rolls back profile and admission mutations", async () => {
  const profile = await seedProfile();
  const seeded = await seedAdmission(profile.userId, "USER_PROFILE_AVATAR", "https://trusted.test/reserved-provider");
  await ProviderAssetGuard.create({ provider: "CLOUDINARY", resourceType: "image", providerAssetId: seeded.asset.providerAssetId, state: "DELETE_RESERVED" });
  await assert.rejects(() => profileMediaAdmissionPersistenceService.persist({
    actorId: profile.userId,
    media: { avatar: admissionClaim(seeded.admission.admissionReference) },
  }));
  assert.equal((await UserProfile.findById(profile._id))?.avatar, "https://stored.test/avatar");
  const persisted = await states({ asset: seeded.asset._id, admission: seeded.admission._id });
  assert.equal(persisted.admission?.status, "ACTIVE");
  assert.equal(persisted.asset?.status, "TEMPORARY");
  assert.equal(await ProviderAssetReference.countDocuments({ imageModerationAssetId: seeded.asset._id }), 0);
});

test("callback failure rolls back profile references and cleanup intents", async () => {
  const profile = await seedProfile();
  const former = await seedTrackedFormerMedia(profile, "avatar", "https://stored.test/avatar");
  const seeded = await seedAdmission(profile.userId, "USER_PROFILE_AVATAR", "https://trusted.test/callback-reference-rollback");
  await assert.rejects(() => profileMediaAdmissionPersistenceService.persist({
    actorId: profile.userId,
    media: { avatar: admissionClaim(seeded.admission.admissionReference) },
    withinTransaction: async () => { throw new Error("stop after references"); },
  }));
  assert.equal(await ProviderAssetReference.countDocuments({ imageModerationAssetId: former._id, state: "CURRENT" }), 1);
  assert.equal(await ProviderAssetReference.countDocuments({ imageModerationAssetId: seeded.asset._id, state: "CURRENT" }), 0);
  assert.equal(await ProfileMediaCleanupJob.countDocuments({ formerReference: former.trustedMediaReference }), 0);
});

test("creates an initial pending submission with server-derived lifecycle metadata", async () => {
  const actorId = new Types.ObjectId();
  const avatar = await seedAdmission(actorId, "USER_PROFILE_AVATAR", "https://trusted.test/lifecycle-avatar");
  const cover = await seedAdmission(actorId, "USER_PROFILE_COVER", "https://trusted.test/lifecycle-cover");
  const one = await seedAdmission(actorId, "USER_PROFILE_PHOTO", "https://trusted.test/lifecycle-one");
  const two = await seedAdmission(actorId, "USER_PROFILE_PHOTO", "https://trusted.test/lifecycle-two");
  const submittedAt = new Date();
  const result = await profileMediaAdmissionPersistenceService.persist({
    actorId,
    createProfile: { username: `lifecycle-${actorId}`, dateOfBirth: new Date("1990-01-01"), languages: ["English"], interests: [], bio: "Initial submission." },
    profileFields: { realName: "Initial User", country: "India", city: "Mumbai" },
    lifecycle: { kind: "SUBMIT_INITIAL_OR_INCOMPLETE", submittedAt },
    media: {
      avatar: admissionClaim(avatar.admission.admissionReference),
      cover: admissionClaim(cover.admission.admissionReference),
      profilePhotos: [admissionClaim(one.admission.admissionReference), admissionClaim(two.admission.admissionReference)],
    },
  });
  const profile = await UserProfile.findById(result.profileId);
  assert.equal(profile?.profileStatus, "pending_verification");
  assert.equal(profile?.verificationSubmissionVersion, 1);
  assert.equal(profile?.verificationSubmittedAt?.getTime(), submittedAt.getTime());
  assert.equal(profile?.__v, 1);
  for (const seeded of [avatar, cover, one, two]) assert.equal((await ImageAdmission.findById(seeded.admission._id))?.status, "CONSUMED");
});

test("submits incomplete and rejected profiles only through their allowed lifecycle transitions", async () => {
  const incomplete = await seedProfile();
  await UserProfile.updateOne({ _id: incomplete._id }, { $set: { profileStatus: "incomplete", verificationSubmissionVersion: 2 } });
  await profileMediaAdmissionPersistenceService.persist({
    actorId: incomplete.userId,
    profileFields: { bio: "Submitted from an incomplete profile." },
    lifecycle: { kind: "SUBMIT_INITIAL_OR_INCOMPLETE", submittedAt: new Date() },
    media: { avatar: unchanged("https://stored.test/avatar"), cover: unchanged("https://stored.test/cover"), profilePhotos: [unchanged("https://stored.test/photo-one"), unchanged("https://stored.test/photo-two")] },
  });
  const submitted = await UserProfile.findById(incomplete._id);
  assert.equal(submitted?.profileStatus, "pending_verification");
  assert.equal(submitted?.verificationSubmissionVersion, 3);

  const rejected = await seedProfile();
  await UserProfile.updateOne({ _id: rejected._id }, { $set: { profileStatus: "rejected", rejectionReason: "Correct this.", verificationSubmissionVersion: 4 } });
  await profileMediaAdmissionPersistenceService.persist({
    actorId: rejected.userId,
    profileFields: { city: "Delhi" },
    lifecycle: { kind: "RESUBMIT_REJECTED", submittedAt: new Date() },
    media: {},
  });
  const resubmitted = await UserProfile.findById(rejected._id);
  assert.equal(resubmitted?.profileStatus, "pending_verification");
  assert.equal(resubmitted?.verificationSubmissionVersion, 5);
  assert.equal(resubmitted?.rejectionReason, "");
  assert.equal(resubmitted?.city, "Delhi");
});

test("verified editing persists validated non-media fields without changing submission version", async () => {
  const profile = await seedProfile();
  const originalVersion = profile.__v;
  await profileMediaAdmissionPersistenceService.persist({
    actorId: profile.userId,
    profileFields: { bio: "A verified profile edit." },
    media: {},
  });
  const edited = await UserProfile.findById(profile._id);
  assert.equal(edited?.profileStatus, "verified");
  assert.equal(edited?.verificationSubmissionVersion, 7);
  assert.equal(edited?.bio, "A verified profile edit.");
  assert.equal(edited?.__v, originalVersion + 1);
});

test("rejects invalid lifecycle instructions without any profile or admission mutation", async () => {
  const profile = await seedProfile();
  const seeded = await seedAdmission(profile.userId, "USER_PROFILE_AVATAR", "https://trusted.test/invalid-lifecycle");
  await assert.rejects(() => profileMediaAdmissionPersistenceService.persist({
    actorId: profile.userId,
    lifecycle: { kind: "RESUBMIT_REJECTED", submittedAt: new Date() },
    media: { avatar: admissionClaim(seeded.admission.admissionReference) },
  }), (error: unknown) => error instanceof ProfileMediaAdmissionPersistenceError && error.code === "PROFILE_MEDIA_INVALID_LIFECYCLE");
  assert.equal((await UserProfile.findById(profile._id))?.avatar, "https://stored.test/avatar");
  assert.equal((await ImageAdmission.findById(seeded.admission._id))?.status, "ACTIVE");
});

test("callback failure rolls back lifecycle metadata with media and references", async () => {
  const profile = await seedProfile();
  await UserProfile.updateOne({ _id: profile._id }, { $set: { profileStatus: "rejected", rejectionReason: "Needs correction.", verificationSubmissionVersion: 2 } });
  const former = await seedTrackedFormerMedia(profile, "avatar", "https://stored.test/avatar");
  const seeded = await seedAdmission(profile.userId, "USER_PROFILE_AVATAR", "https://trusted.test/lifecycle-rollback");
  await assert.rejects(() => profileMediaAdmissionPersistenceService.persist({
    actorId: profile.userId,
    lifecycle: { kind: "RESUBMIT_REJECTED", submittedAt: new Date() },
    media: { avatar: admissionClaim(seeded.admission.admissionReference) },
    withinTransaction: async () => { throw new Error("lifecycle callback rollback"); },
  }));
  const rolledBack = await UserProfile.findById(profile._id);
  assert.equal(rolledBack?.profileStatus, "rejected");
  assert.equal(rolledBack?.verificationSubmissionVersion, 2);
  assert.equal(rolledBack?.rejectionReason, "Needs correction.");
  assert.equal((await ImageAdmission.findById(seeded.admission._id))?.status, "ACTIVE");
  assert.equal(await ProviderAssetReference.countDocuments({ imageModerationAssetId: former._id, state: "CURRENT" }), 1);
  assert.equal(await ProfileMediaCleanupJob.countDocuments({ formerReference: former.trustedMediaReference }), 0);
});
