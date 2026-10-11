import assert from "node:assert/strict";
import test from "node:test";
import { Types } from "mongoose";
import { CreatorProfile } from "../../models/creatorProfile.model";
import { FaceVerificationEvidence } from "../../models/faceVerificationEvidence.model";
import { ImageModerationAsset } from "../../models/imageModerationAsset.model";
import { ProfileMediaCleanupJob } from "../../models/profileMediaCleanupJob.model";
import { ProfileVerificationRequest } from "../../models/profileVerificationRequest.model";
import { ProviderAssetGuard } from "../../models/providerAssetGuard.model";
import { UserProfile } from "../../models/userProfile.model";
import { profileMediaCleanupJobRepository } from "../../repositories/profileMediaCleanupJob.repository";
import { ProfileMediaCleanupWorkerService } from "../../services/profile/profileMediaCleanupWorker.service";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

const future = () => new Date(Date.now() + 60_000);
async function fixture(slot = "avatar") {
  const userId = new Types.ObjectId(), profileId = new Types.ObjectId(), reference = `https://trusted.test/${new Types.ObjectId()}`, publicId = `profile/${new Types.ObjectId()}`;
  await UserProfile.create({ _id: profileId, userId, username: `user-${new Types.ObjectId()}`, dateOfBirth: new Date("1990-01-01"), interests: [], bio: "", avatar: "", cover: "", profilePhotos: [], profileStatus: "incomplete" });
  await ImageModerationAsset.create({ assetReference: `ima_${new Types.ObjectId()}`, actorId: userId, contentSha256: "a".repeat(64), providerAssetId: publicId, trustedMediaReference: reference, status: "COMMITTED", expiresAt: future(), retentionDeadline: future(), committedAt: new Date(), committedEntityBinding: `USER_PROFILE:${profileId}:${slot}` });
  await ProviderAssetGuard.create({ provider: "CLOUDINARY", resourceType: "image", providerAssetId: publicId });
  const { job } = await profileMediaCleanupJobRepository.enqueue({ replacementEventKey: `event-${new Types.ObjectId()}`, userId, profileId, formerReference: reference, cloudinaryPublicId: publicId, slot });
  return { userId, profileId, reference, publicId, job };
}
test.before(async () => { process.env.NODE_ENV = "test"; await connectPhase7HDatabase(); });
test.beforeEach(clearPhase7HDatabase); test.after(disconnectPhase7HDatabase);

test("deletes a proven obsolete asset only after a provider-guard reservation", async () => {
  const seeded = await fixture(); const calls: string[] = [];
  const result = await new ProfileMediaCleanupWorkerService(undefined, undefined, undefined, async (id) => { calls.push(id); return "DELETED"; }).processNext();
  assert.equal(result?.kind, "DELETED"); assert.deepEqual(calls, [seeded.publicId]);
  assert.equal((await ProfileMediaCleanupJob.findById(seeded.job._id))?.status, "COMPLETED");
  assert.equal((await ProviderAssetGuard.findOne({ providerAssetId: seeded.publicId }))?.state, "DELETED");
});

test("skips current and verification-history references without a provider call", async () => {
  const seeded = await fixture(); await UserProfile.updateOne({ _id: seeded.profileId }, { $set: { avatar: seeded.reference } });
  let calls = 0; const service = new ProfileMediaCleanupWorkerService(undefined, undefined, undefined, async () => { calls += 1; return "DELETED"; });
  assert.equal((await service.processNext())?.kind, "SKIPPED"); assert.equal(calls, 0);
  await clearPhase7HDatabase(); const history = await fixture();
  await ProfileVerificationRequest.create({ verificationReference: `PVR_${new Types.ObjectId()}`, profileId: history.profileId, userId: history.userId, attemptNumber: 1, profileSubmissionVersion: 1, submittedMedia: { avatar: { role: "AVATAR", sourceReference: history.reference, fingerprint: "a".repeat(64) }, cover: { role: "COVER", sourceReference: "cover", fingerprint: "b".repeat(64) }, profilePhotos: [{ role: "PROFILE_PHOTO", profilePhotoIndex: 0, sourceReference: "one", fingerprint: "c".repeat(64) }, { role: "PROFILE_PHOTO", profilePhotoIndex: 1, sourceReference: "two", fingerprint: "d".repeat(64) }] } });
  assert.equal((await service.processNext())?.kind, "SKIPPED"); assert.equal(calls, 0);
});

test("protects creator and evidence dependencies", async () => {
  const seeded = await fixture(); await CreatorProfile.create({ userId: new Types.ObjectId(), slug: `creator-${new Types.ObjectId()}`, displayName: "x", primaryCategory: "x", country: "x", city: "x", currency: "INR", rating: 0, reviewCount: 0, status: "active", avatarUrl: seeded.reference });
  assert.equal((await new ProfileMediaCleanupWorkerService(undefined, undefined, undefined, async () => "DELETED").processNext())?.kind, "SKIPPED");
  await clearPhase7HDatabase(); const evidence = await fixture(); await FaceVerificationEvidence.create({ evidenceReference: `FVE_${new Types.ObjectId()}`, sessionId: new Types.ObjectId(), userId: evidence.userId, profileId: evidence.profileId, challengeIndex: 0, challenge: "NEUTRAL", cloudinaryPublicId: evidence.publicId, status: "STORED" });
  assert.equal((await new ProfileMediaCleanupWorkerService(undefined, undefined, undefined, async () => "DELETED").processNext())?.kind, "SKIPPED");
});

test("contains ambiguous outcomes and schedules bounded retryable failures", async () => {
  const ambiguous = await fixture();
  assert.equal((await new ProfileMediaCleanupWorkerService(undefined, undefined, undefined, async () => "AMBIGUOUS_FAILURE").processNext())?.kind, "AMBIGUOUS");
  assert.equal((await ProfileMediaCleanupJob.findById(ambiguous.job._id))?.status, "DELETE_UNKNOWN");
  assert.equal((await ProviderAssetGuard.findOne({ providerAssetId: ambiguous.publicId }))?.state, "DELETE_UNKNOWN");
  await clearPhase7HDatabase(); const retry = await fixture();
  assert.equal((await new ProfileMediaCleanupWorkerService(undefined, undefined, undefined, async () => "RETRYABLE_FAILURE").processNext())?.kind, "RETRY_SCHEDULED");
  assert.equal((await ProfileMediaCleanupJob.findById(retry.job._id))?.status, "RETRY_WAIT");
  assert.equal((await ProviderAssetGuard.findOne({ providerAssetId: retry.publicId }))?.state, "ACTIVE");
});

test("reconciles pre-call reservations and contains abandoned in-progress deletion", async () => {
  const reserved = await fixture(); const now = new Date();
  const claim = await profileMediaCleanupJobRepository.claimDue(now, 1); assert.ok(claim);
  await ProviderAssetGuard.updateOne({ providerAssetId: reserved.publicId }, { $set: { state: "DELETE_RESERVED", reservationJobId: claim!._id, reservationToken: claim!.leaseToken, reservationExpiresAt: new Date(now.getTime() - 1) } });
  const worker = new ProfileMediaCleanupWorkerService();
  const first = await worker.reconcile(new Date(now.getTime() + 10));
  assert.equal(first.releasedReservations, 1);
  assert.equal((await ProviderAssetGuard.findOne({ providerAssetId: reserved.publicId }))?.state, "ACTIVE");
  assert.equal((await ProfileMediaCleanupJob.findById(reserved.job._id))?.status, "RETRY_WAIT");
  await clearPhase7HDatabase(); const started = await fixture(); const running = await profileMediaCleanupJobRepository.claimDue(new Date(), 1); assert.ok(running);
  await ProviderAssetGuard.updateOne({ providerAssetId: started.publicId }, { $set: { state: "DELETE_IN_PROGRESS", reservationJobId: running!._id, reservationToken: running!.leaseToken, reservationExpiresAt: new Date(now.getTime() - 1), deletionStartedAt: now } });
  const second = await worker.reconcile(new Date(now.getTime() + 10));
  assert.equal(second.containedInProgress, 1);
  assert.equal((await ProviderAssetGuard.findOne({ providerAssetId: started.publicId }))?.state, "DELETE_UNKNOWN");
  assert.equal((await ProfileMediaCleanupJob.findById(started.job._id))?.status, "DELETE_UNKNOWN");
});
