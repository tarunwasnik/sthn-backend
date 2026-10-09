import assert from "node:assert/strict";
import test from "node:test";
import { Types } from "mongoose";
import { CreatorProfile } from "../../models/creatorProfile.model";
import { ImageModerationAsset } from "../../models/imageModerationAsset.model";
import { ProfileMediaCleanupJob } from "../../models/profileMediaCleanupJob.model";
import { UserProfile } from "../../models/userProfile.model";
import { profileMediaCleanupJobRepository } from "../../repositories/profileMediaCleanupJob.repository";
import { ProfileMediaCleanupWorkerService } from "../../services/profile/profileMediaCleanupWorker.service";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

const future = () => new Date(Date.now() + 60_000);
async function fixture(slot = "avatar") {
  const userId = new Types.ObjectId(), profileId = new Types.ObjectId(), reference = `https://trusted.test/${new Types.ObjectId()}`, publicId = `profile/${new Types.ObjectId()}`;
  await UserProfile.create({ _id: profileId, userId, username: `user-${new Types.ObjectId()}`, dateOfBirth: new Date("1990-01-01"), interests: [], bio: "", avatar: "", cover: "", profilePhotos: [], profileStatus: "incomplete" });
  await ImageModerationAsset.create({ assetReference: `ima_${new Types.ObjectId()}`, actorId: userId, contentSha256: "a".repeat(64), providerAssetId: publicId, trustedMediaReference: reference, status: "COMMITTED", expiresAt: future(), retentionDeadline: future(), committedAt: new Date(), committedEntityBinding: `USER_PROFILE:${profileId}:${slot}` });
  const { job } = await profileMediaCleanupJobRepository.enqueue({ replacementEventKey: `event-${new Types.ObjectId()}`, userId, profileId, formerReference: reference, cloudinaryPublicId: publicId, slot });
  return { userId, profileId, reference, publicId, job };
}
test.before(async()=>{process.env.NODE_ENV="test";await connectPhase7HDatabase()});test.beforeEach(clearPhase7HDatabase);test.after(disconnectPhase7HDatabase);

test("assesses a proven obsolete asset as eligible without destructive completion",async()=>{const seeded=await fixture();const result=await new ProfileMediaCleanupWorkerService().processNext();assert.equal(result?.eligibility.kind,"ELIGIBLE");assert.equal(result?.finalized,false);assert.equal((await ProfileMediaCleanupJob.findById(seeded.job._id))?.status,"RUNNING");});
test("skips current avatar, cover, gallery, and shared provider references",async()=>{for(const [slot,field] of [["avatar","avatar"],["cover","cover"],["photo:0","profilePhotos"]] as const){const seeded=await fixture(slot);await UserProfile.updateOne({_id:seeded.profileId},{$set:{avatar:field==="avatar"?seeded.reference:"a",cover:field==="cover"?seeded.reference:"c",profilePhotos:field==="profilePhotos"?[seeded.reference,"p"]:["p1","p2"]}});const result=await new ProfileMediaCleanupWorkerService().processNext();assert.equal(result?.eligibility.kind,"STILL_REFERENCED");assert.equal((await ProfileMediaCleanupJob.findById(seeded.job._id))?.status,"SKIPPED_STILL_REFERENCED");await clearPhase7HDatabase();}const seeded=await fixture();await CreatorProfile.create({userId:new Types.ObjectId(),slug:`creator-${new Types.ObjectId()}`,displayName:"x",primaryCategory:"x",country:"x",city:"x",currency:"INR",rating:0,reviewCount:0,status:"active",avatarUrl:seeded.reference});const result=await new ProfileMediaCleanupWorkerService().processNext();assert.equal(result?.eligibility.kind,"STILL_REFERENCED");});
test("rejects invalid provenance, recovers expired leases, and honors token ownership",async()=>{const seeded=await fixture();await ImageModerationAsset.deleteOne({providerAssetId:seeded.publicId});const worker=new ProfileMediaCleanupWorkerService();const result=await worker.processNext();assert.equal(result?.eligibility.kind,"UNSAFE_PROVENANCE");assert.equal((await ProfileMediaCleanupJob.findById(seeded.job._id))?.status,"RETRY_WAIT");const claimed=await profileMediaCleanupJobRepository.claimDue(new Date(Date.now()+1),1);assert.ok(claimed);assert.equal(await profileMediaCleanupJobRepository.skipStillReferenced(claimed!._id,"stale",new Date()),null);await worker.reconcile(new Date(Date.now()+100));assert.equal((await ProfileMediaCleanupJob.findById(seeded.job._id))?.status,"RETRY_WAIT");});
test("concurrent workers claim at most one job and isolate later failures",async()=>{const seeded=await fixture();const [a,b]=await Promise.all([new ProfileMediaCleanupWorkerService().processNext(),new ProfileMediaCleanupWorkerService().processNext()]);assert.equal([a,b].filter(Boolean).length,1);assert.equal((await ProfileMediaCleanupJob.findById(seeded.job._id))?.status,"RUNNING");});
