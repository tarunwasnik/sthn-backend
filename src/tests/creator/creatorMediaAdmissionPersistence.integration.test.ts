import assert from "node:assert/strict";
import test from "node:test";
import mongoose, { Types } from "mongoose";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";
import { CreatorProfile } from "../../models/creatorProfile.model";
import { CreatorMediaCleanupIntent } from "../../models/creatorMediaCleanupIntent.model";
import { ImageAdmission } from "../../models/imageAdmission.model";
import { ImageModerationAsset } from "../../models/imageModerationAsset.model";
import { ImageModerationAttempt } from "../../models/imageModerationAttempt.model";
import { ProviderAssetReference } from "../../models/providerAssetReference.model";
import { providerAssetReferenceTransactionService } from "../../services/profile/providerAssetReferenceTransaction.service";
import { creatorMediaAdmissionPersistenceService } from "../../services/creator/creatorMediaAdmissionPersistence.service";
import { parseCreatorMediaClaims } from "../../services/creator/creatorMediaAdmissionContract";

const sha = "a".repeat(64); const future = () => new Date(Date.now() + 60_000);
const admissionClaim = (admissionReference: string) => ({ kind: "ADMISSION" as const, admissionReference });
const unchanged = (reference: string) => ({ kind: "UNCHANGED" as const, reference });
async function seedProfile(userId = new Types.ObjectId()) { return CreatorProfile.create({ userId, slug: `creator-${userId}`, displayName: "Creator", primaryCategory: "Music", country: "IN", city: "Delhi", currency: "INR", avatarUrl: "https://legacy.test/avatar", coverUrl: "https://legacy.test/cover", media: ["https://legacy.test/one"] }); }
async function seedAdmission(actorId: Types.ObjectId, surface: "CREATOR_PROFILE_AVATAR" | "CREATOR_PROFILE_COVER" | "CREATOR_PROFILE_MEDIA", reference: string, expiresAt = future()) {
  const asset = await ImageModerationAsset.create({ assetReference: `ima_${new Types.ObjectId()}`, actorId, contentSha256: sha, providerAssetId: `creator/${new Types.ObjectId()}`, trustedMediaReference: reference, expiresAt, retentionDeadline: future() });
  const attempt = await ImageModerationAttempt.create({ attemptReference: `imat_${new Types.ObjectId()}`, assetId: asset._id, actorId, contentSha256: sha, surface, entityBinding: `PENDING:${actorId}:${surface}`, status: "PASSED", provenanceModel: { identifier: "test", revision: "test", artifactSha256: sha }, policy: { key: "TEST", version: "V1" }, expiresAt, retentionDeadline: future() });
  const admission = await ImageAdmission.create({ admissionReference: `imauth_${new Types.ObjectId()}`, attemptId: attempt._id, assetId: asset._id, actorId, contentSha256: sha, surface, entityBinding: attempt.entityBinding, expiresAt });
  return { asset, admission };
}
async function seedTrackedFormer(profile: Awaited<ReturnType<typeof seedProfile>>) {
  const asset = await ImageModerationAsset.create({ assetReference: `ima_${new Types.ObjectId()}`, actorId: profile.userId, contentSha256: sha, providerAssetId: `creator/former-${new Types.ObjectId()}`, trustedMediaReference: "https://legacy.test/avatar", status: "COMMITTED", expiresAt: future(), retentionDeadline: future(), committedAt: new Date(), committedEntityBinding: `CREATOR_PROFILE:${profile._id}:avatar` });
  const session = await mongoose.startSession();
  try { await session.withTransaction(async () => { const trusted = await providerAssetReferenceTransactionService.resolveTrustedCommittedAsset({ session, actorId: profile.userId, assetId: asset._id, destinationBinding: `CREATOR_PROFILE:${profile._id}:avatar` }); await providerAssetReferenceTransactionService.acquireTrusted({ session, entity: { entityType: "CREATOR_PROFILE", entityId: profile._id, slot: "avatar" }, trusted }); }); } finally { await session.endSession(); }
  return asset;
}
async function persist(profile: Awaited<ReturnType<typeof seedProfile>>, claims: Parameters<typeof creatorMediaAdmissionPersistenceService.persist>[0]["claims"], fail = false) {
  return creatorMediaAdmissionPersistenceService.persist({ actorId: profile.userId, kind: "CREATOR_PROFILE", claims,
    loadOwnedResource: async (session) => { const current = await CreatorProfile.findById(profile._id).session(session); return current ? { id: current._id, actorId: current.userId, media: { avatar: current.avatarUrl, cover: current.coverUrl, media: current.media ?? [] } } : null; },
    persistMedia: async ({ session, media }) => { if (fail) throw new Error("rollback"); await CreatorProfile.updateOne({ _id: profile._id }, { $set: { avatarUrl: media.avatar ?? null, coverUrl: media.cover ?? null, media: media.media } }, { session }).exec(); },
  });
}
test.before(async () => { process.env.NODE_ENV = "test"; await connectPhase7HDatabase(); });
test.beforeEach(clearPhase7HDatabase); test.after(disconnectPhase7HDatabase);

test("parses only strict creator claims and rejects raw URLs/internal identity", () => {
  assert.deepEqual(parseCreatorMediaClaims({ avatar: admissionClaim("imauth_good") }), { avatar: admissionClaim("imauth_good") });
  assert.throws(() => parseCreatorMediaClaims({ avatar: "https://raw.test/image" }));
  assert.throws(() => parseCreatorMediaClaims({ avatar: { ...admissionClaim("imauth_good"), assetId: "forged" } }));
});
test("consumes a caller-owned creator-profile admission and acquires provider ownership", async () => {
  const profile = await seedProfile(); const seeded = await seedAdmission(profile.userId, "CREATOR_PROFILE_AVATAR", "https://trusted.test/avatar");
  const result = await persist(profile, { avatar: admissionClaim(seeded.admission.admissionReference) });
  assert.equal(result.avatar, "https://trusted.test/avatar");
  assert.equal((await ImageAdmission.findById(seeded.admission._id))?.status, "CONSUMED");
  assert.equal((await ImageModerationAsset.findById(seeded.asset._id))?.committedEntityBinding, `CREATOR_PROFILE:${profile._id}:avatar`);
  assert.equal(await ProviderAssetReference.countDocuments({ entityType: "CREATOR_PROFILE", entityId: profile._id, state: "CURRENT" }), 1);
});
test("rejects foreign, wrong-surface, expired, blocked, and replayed admissions", async () => {
  const profile = await seedProfile();
  const foreign = await seedAdmission(new Types.ObjectId(), "CREATOR_PROFILE_AVATAR", "https://trusted.test/foreign");
  await assert.rejects(() => persist(profile, { avatar: admissionClaim(foreign.admission.admissionReference) }));
  const wrong = await seedAdmission(profile.userId, "CREATOR_PROFILE_COVER", "https://trusted.test/wrong");
  await assert.rejects(() => persist(profile, { avatar: admissionClaim(wrong.admission.admissionReference) }));
  const expired = await seedAdmission(profile.userId, "CREATOR_PROFILE_AVATAR", "https://trusted.test/expired", new Date(Date.now() - 1));
  await assert.rejects(() => persist(profile, { avatar: admissionClaim(expired.admission.admissionReference) }));
  const blocked = await seedAdmission(profile.userId, "CREATOR_PROFILE_AVATAR", "https://trusted.test/blocked"); await ImageModerationAttempt.updateOne({ _id: blocked.admission.attemptId }, { $set: { status: "BLOCKED" } });
  await assert.rejects(() => persist(profile, { avatar: admissionClaim(blocked.admission.admissionReference) }));
  const unavailable = await seedAdmission(profile.userId, "CREATOR_PROFILE_AVATAR", "https://trusted.test/unavailable"); await ImageModerationAttempt.updateOne({ _id: unavailable.admission.attemptId }, { $set: { status: "UNAVAILABLE" } });
  await assert.rejects(() => persist(profile, { avatar: admissionClaim(unavailable.admission.admissionReference) }));
  const valid = await seedAdmission(profile.userId, "CREATOR_PROFILE_AVATAR", "https://trusted.test/once"); await persist(profile, { avatar: admissionClaim(valid.admission.admissionReference) });
  await assert.rejects(() => persist(profile, { avatar: admissionClaim(valid.admission.admissionReference) }));
});
test("preserves exact legacy unchanged references but rejects forged unchanged references", async () => {
  const profile = await seedProfile();
  const result = await persist(profile, { avatar: unchanged("https://legacy.test/avatar"), media: [unchanged("https://legacy.test/one")] });
  assert.equal(result.avatar, "https://legacy.test/avatar"); assert.deepEqual(result.media, ["https://legacy.test/one"]);
  await assert.rejects(() => persist(profile, { avatar: unchanged("https://other.test/stolen") }));
  assert.equal(await CreatorMediaCleanupIntent.countDocuments(), 0);
});
test("rolls back consumption, references, persistence, and cleanup intent together", async () => {
  const profile = await seedProfile(); const seeded = await seedAdmission(profile.userId, "CREATOR_PROFILE_AVATAR", "https://trusted.test/rollback");
  await assert.rejects(() => persist(profile, { avatar: admissionClaim(seeded.admission.admissionReference) }, true));
  assert.equal((await ImageAdmission.findById(seeded.admission._id))?.status, "ACTIVE");
  assert.equal((await CreatorProfile.findById(profile._id))?.avatarUrl, "https://legacy.test/avatar");
  assert.equal(await ProviderAssetReference.countDocuments(), 0); assert.equal(await CreatorMediaCleanupIntent.countDocuments(), 0);
});
test("creates a deferred creator cleanup intent only after a tracked replacement commits", async () => {
  const profile = await seedProfile(); await seedTrackedFormer(profile); const replacement = await seedAdmission(profile.userId, "CREATOR_PROFILE_AVATAR", "https://trusted.test/replacement");
  await persist(profile, { avatar: admissionClaim(replacement.admission.admissionReference) });
  const intent = await CreatorMediaCleanupIntent.findOne({ entityType: "CREATOR_PROFILE", entityId: profile._id, slot: "avatar" });
  assert.equal(intent?.formerReference, "https://legacy.test/avatar");
  assert.equal(intent?.providerAssetId.startsWith("creator/former-"), true);
});
test("keeps a former provider asset protected while another creator entity still references its guard", async () => {
  const profile = await seedProfile(); const former = await seedTrackedFormer(profile); const session = await mongoose.startSession();
  try { await session.withTransaction(async () => { const trusted = await providerAssetReferenceTransactionService.resolveTrustedCommittedAsset({ session, actorId: profile.userId, assetId: former._id, destinationBinding: `CREATOR_PROFILE:${profile._id}:avatar` }); await providerAssetReferenceTransactionService.acquireTrusted({ session, entity: { entityType: "CREATOR_SERVICE", entityId: new Types.ObjectId(), slot: "media:0" }, trusted }); }); } finally { await session.endSession(); }
  const replacement = await seedAdmission(profile.userId, "CREATOR_PROFILE_AVATAR", "https://trusted.test/shared-replacement"); await persist(profile, { avatar: admissionClaim(replacement.admission.admissionReference) });
  assert.equal(await CreatorMediaCleanupIntent.countDocuments(), 0);
});
test("cross-resource admission cannot be replayed and no persistence path invokes Cloudinary", async () => {
  const profile = await seedProfile(); const other = await seedProfile(); const seeded = await seedAdmission(profile.userId, "CREATOR_PROFILE_AVATAR", "https://trusted.test/cross");
  await persist(profile, { avatar: admissionClaim(seeded.admission.admissionReference) });
  await assert.rejects(() => creatorMediaAdmissionPersistenceService.persist({ actorId: other.userId, kind: "CREATOR_PROFILE", claims: { avatar: admissionClaim(seeded.admission.admissionReference) }, loadOwnedResource: async (session) => { const current = await CreatorProfile.findById(other._id).session(session); return current ? { id: current._id, actorId: current.userId, media: { avatar: current.avatarUrl, cover: current.coverUrl, media: current.media ?? [] } } : null; }, persistMedia: async () => undefined }));
});
