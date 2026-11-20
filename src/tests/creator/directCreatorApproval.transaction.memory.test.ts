import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import User from "../../models/User";
import { CreatorApplication } from "../../models/creatorApplication.model";
import { CreatorProfile } from "../../models/creatorProfile.model";
import { UserProfile } from "../../models/userProfile.model";
import { ImageModerationAsset } from "../../models/imageModerationAsset.model";
import { ProviderAssetGuard } from "../../models/providerAssetGuard.model";
import { ProviderAssetReference } from "../../models/providerAssetReference.model";
import { AuditLog } from "../../models/auditLog.model";
import { Notification } from "../../models/notification.model";
import { approveCreatorApplication, rejectCreatorApplication } from "../../controllers/adminCreatorApproval.controller";
import { ProfileVerificationRequest } from "../../models/profileVerificationRequest.model";
import { FaceVerificationSession } from "../../models/faceVerificationSession.model";
import { startCreatorVerificationSession, acceptCreatorVerificationCapture, submitCreatorVerificationRequest } from "../../services/creator/creatorVerification.service";

let replicaSet: MongoMemoryReplSet;
const diagnosticStart = Date.now();
const timing = (phase: string) => console.log(`approval-memory-test ${phase} +${Date.now() - diagnosticStart}ms`);

timing("module-loaded");

before(async () => {
  timing("replica-set-starting");
  replicaSet = await MongoMemoryReplSet.create({ binary: { systemBinary: "D:/StHn/backend/node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe" }, replSet: { count: 1 } });
  timing("replica-set-started");
  const uri = replicaSet.getUri("direct-creator-approval-isolated");
  assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:/);
  assert.doesNotMatch(uri, /sthn_db|mongodb\.net/i);
  await mongoose.connect(uri);
  await Promise.all([User.init(), CreatorApplication.init(), CreatorProfile.init(), UserProfile.init(), ImageModerationAsset.init(), ProviderAssetGuard.init(), ProviderAssetReference.init(), AuditLog.init(), Notification.init()]);
  timing("mongoose-connected");
});
after(async () => { timing("mongoose-disconnecting"); await mongoose.disconnect(); timing("mongoose-disconnected"); await replicaSet.stop(); timing("replica-set-stopped"); });

test("direct Creator approval is denied inside the transaction before role or profile side effects", async () => {
  timing("fixture-starting");
  const user = await User.create({ email: "direct-approval-isolated@example.test", password: "test", role: "user", status: "pending_profile", creatorStatus: "none", governanceState: "ACTIVE" });
  const application = await CreatorApplication.create({ userId: user._id, applicationJourney: "direct_creator", verificationRevision: 1, displayName: "Direct Applicant", primaryCategory: "Music", country: "IN", city: "Kolkata", currency: "INR", services: [], publicBio: "Creator biography", languages: ["English"], avatarUrl: "https://res.cloudinary.com/test/image/upload/avatar.jpg", coverUrl: "https://res.cloudinary.com/test/image/upload/cover.jpg", media: ["https://res.cloudinary.com/test/image/upload/gallery-1.jpg", "https://res.cloudinary.com/test/image/upload/gallery-2.jpg"], status: "submitted", rejectionReason: "" });
  let statusCode = 0; let payload: unknown;
  const response = { status: (status: number) => { statusCode = status; return { json: (body: unknown) => { payload = body; } }; } };
  timing("fixture-created");
  await approveCreatorApplication({ params: { applicationId: String(application._id) }, user: { id: String(user._id) } } as never, response as never);
  timing("approval-controller-returned");
  assert.equal(statusCode, 400);
  assert.match(String((payload as { message?: string }).message), /authoritative identity-verification decision/i);
  const [storedUser, profile, storedApplication] = await Promise.all([User.findById(user._id).lean(), CreatorProfile.findOne({ userId: user._id }).lean(), CreatorApplication.findById(application._id).lean()]);
  assert.equal(storedUser?.role, "user"); assert.equal(storedUser?.creatorStatus, "none"); assert.equal(profile, null); assert.equal(storedApplication?.status, "submitted");
  const repeat = async () => {
    let code = 0;
    await approveCreatorApplication({ params: { applicationId: String(application._id) }, user: { id: String(user._id) } } as never, { status: (status: number) => { code = status; return { json: () => undefined }; } } as never);
    return code;
  };
  const repeated = await Promise.all([repeat(), repeat()]);
  assert.deepEqual(repeated, [400, 400]);
  assert.equal(await CreatorProfile.countDocuments({ userId: user._id }), 0);
});

const approvalResponse = () => {
  let statusCode = 0;
  let payload: unknown;
  return {
    response: { status: (status: number) => { statusCode = status; return { json: (body: unknown) => { payload = body; } }; } },
    result: () => ({ statusCode, payload }),
  };
};

const createVerifiedUpgradeFixture = async (suffix: string) => {
  const user = await User.create({ email: `verified-upgrade-${suffix}@example.test`, password: "test", role: "user", status: "active", creatorStatus: "none", governanceState: "ACTIVE" });
  await UserProfile.create({ userId: user._id, username: `verified-upgrade-${suffix}`, dateOfBirth: new Date("1990-01-01"), interests: ["Music"], bio: "Verified user profile", avatar: "https://trusted.example/user-avatar.jpg", cover: "https://trusted.example/user-cover.jpg", profilePhotos: ["https://trusted.example/user-gallery-1.jpg", "https://trusted.example/user-gallery-2.jpg"], profileStatus: "verified", verificationSubmissionVersion: 1 });
  const application = await CreatorApplication.create({ userId: user._id, applicationJourney: "user_upgrade", verificationRevision: 1, displayName: `Verified Upgrade ${suffix}`, country: "IN", city: "Kolkata", currency: "INR", interests: ["Music"], services: [], publicBio: "Creator biography", languages: ["English"], avatarUrl: `https://trusted.example/${suffix}-avatar.jpg`, coverUrl: `https://trusted.example/${suffix}-cover.jpg`, media: [`https://trusted.example/${suffix}-gallery-1.jpg`, `https://trusted.example/${suffix}-gallery-2.jpg`], status: "draft", rejectionReason: "" });
  const media = [
    { slot: "avatar", reference: application.avatarUrl! }, { slot: "cover", reference: application.coverUrl! },
    ...application.media!.map((reference, index) => ({ slot: `media:${index}`, reference })),
  ];
  for (const [index, item] of media.entries()) {
    const asset = await ImageModerationAsset.create({ assetReference: `upgrade-asset-${suffix}-${index}`, actorId: user._id, contentSha256: `${index}`.repeat(64), providerAssetId: `upgrade-provider-${suffix}-${index}`, trustedMediaReference: item.reference, status: "COMMITTED", expiresAt: new Date(Date.now() + 86_400_000), retentionDeadline: new Date(Date.now() + 86_400_000), committedAt: new Date(), committedEntityBinding: `CREATOR_APPLICATION:${application._id}:${item.slot}`, cleanupStatus: "PENDING", cleanupAttemptCount: 0 });
    const guard = await ProviderAssetGuard.create({ provider: "CLOUDINARY", providerAssetId: asset.providerAssetId, resourceType: "image", state: "ACTIVE", generation: 1, currentReferenceCount: 1 });
    await ProviderAssetReference.create({ guardId: guard._id, entityType: "CREATOR_APPLICATION", entityId: application._id, slot: item.slot, authoritativeReference: item.reference, imageModerationAssetId: asset._id, state: "CURRENT", generation: 1, acquiredAt: new Date() });
  }
  const captureSession = await startCreatorVerificationSession(String(user._id));
  for (let index = 0; index < 5; index++) await acceptCreatorVerificationCapture({ userId: String(user._id), sessionReference: captureSession.sessionReference, challengeIndex: String(index), file: { buffer: Buffer.from([1, 2, 3]) } as Express.Multer.File, storeEvidence: async ({ buffer, publicId }) => ({ publicId, bytes: buffer.length, mimeType: "image/png", format: "png" }) });
  await submitCreatorVerificationRequest(String(user._id));
  return { user, application, media };
};

test("verified User-to-Creator approval promotes trusted application media and is duplicate-safe", async () => {
  const fixture = await createVerifiedUpgradeFixture("primary");
  const first = approvalResponse();
  await approveCreatorApplication({ params: { applicationId: String(fixture.application._id) }, user: { id: String(fixture.user._id) } } as never, first.response as never);
  assert.equal(first.result().statusCode, 200);

  const [user, application, profile, audit, notification] = await Promise.all([
    User.findById(fixture.user._id).lean(), CreatorApplication.findById(fixture.application._id).lean(), CreatorProfile.findOne({ userId: fixture.user._id }).lean(),
    AuditLog.findOne({ entityId: fixture.application._id, action: "CREATOR_APPLICATION_APPROVED" }).lean(), Notification.findOne({ recipientId: fixture.user._id, category: "CREATOR_APPLICATION" }).lean(),
  ]);
  assert.equal(user?.role, "creator"); assert.equal(user?.creatorStatus, "approved"); assert.equal(application?.status, "approved");
  assert.equal(profile?.status, "active"); assert.deepEqual(profile?.media, fixture.application.media); assert.equal(profile?.avatarUrl, fixture.application.avatarUrl); assert.equal(profile?.coverUrl, fixture.application.coverUrl);
  assert.equal(profile?.primaryCategory, undefined); assert.deepEqual(profile?.categories, []); assert.deepEqual(profile?.interests, ["Music"]);
  assert.equal(audit?.action, "CREATOR_APPLICATION_APPROVED"); assert.equal(notification?.type, "CREATOR_APPLICATION_UPDATE");
  const promoted = await ProviderAssetReference.find({ entityType: "CREATOR_PROFILE", entityId: profile!._id, state: "CURRENT" }).lean();
  assert.deepEqual(promoted.map((item) => item.slot).sort(), ["avatar", "cover", "media:0", "media:1"]);

  const replay = approvalResponse();
  await approveCreatorApplication({ params: { applicationId: String(fixture.application._id) }, user: { id: String(fixture.user._id) } } as never, replay.response as never);
  assert.equal(replay.result().statusCode, 400);
  assert.equal(await CreatorProfile.countDocuments({ userId: fixture.user._id }), 1);
  assert.equal(await Notification.countDocuments({ recipientId: fixture.user._id, category: "CREATOR_APPLICATION" }), 1);
});

test("verified User approval fails closed when the Creator application revision is stale", async () => {
  const fixture = await createVerifiedUpgradeFixture("stale-upgrade");
  await CreatorApplication.updateOne({ _id: fixture.application._id }, { $inc: { verificationRevision: 1 } });
  const response = approvalResponse();
  await approveCreatorApplication({ params: { applicationId: String(fixture.application._id) }, user: { id: String(fixture.user._id) } } as never, response.response as never);
  assert.equal(response.result().statusCode, 400);
  assert.equal(await CreatorProfile.countDocuments({ userId: fixture.user._id }), 0);
  assert.equal((await User.findById(fixture.user._id))?.role, "user");
});

test("rejected upgrade retires its capture authority while preserving the User profile", async () => {
  const fixture = await createVerifiedUpgradeFixture("rejected-upgrade");
  const previous = await ProfileVerificationRequest.findOne({ targetId: fixture.application._id, isActive: true }).orFail();
  const response = approvalResponse();
  await rejectCreatorApplication({ params: { applicationId: String(fixture.application._id) }, body: { reason: "Please revise your application" }, user: { id: String(fixture.user._id) } } as never, response.response as never);
  assert.equal(response.result().statusCode, 200);
  assert.equal((await ProfileVerificationRequest.findById(previous._id))?.isActive, false);
  assert.equal((await FaceVerificationSession.findOne({ verificationRequestId: previous._id }))?.isCurrent, false);
  assert.equal((await UserProfile.findOne({ userId: fixture.user._id }))?.profileStatus, "verified");
  await CreatorApplication.updateOne({ _id: fixture.application._id }, { $set: { status: "draft" }, $inc: { verificationRevision: 1 } });
  const replacement = await startCreatorVerificationSession(String(fixture.user._id));
  assert.equal(replacement.verificationRevision, 2);
});

test("concurrent verified User-to-Creator approvals create exactly one Creator profile", async () => {
  const fixture = await createVerifiedUpgradeFixture("concurrent");
  const first = approvalResponse(); const second = approvalResponse();
  await Promise.all([
    approveCreatorApplication({ params: { applicationId: String(fixture.application._id) }, user: { id: String(fixture.user._id) } } as never, first.response as never),
    approveCreatorApplication({ params: { applicationId: String(fixture.application._id) }, user: { id: String(fixture.user._id) } } as never, second.response as never),
  ]);
  assert.deepEqual([first.result().statusCode, second.result().statusCode].sort(), [200, 400]);
  assert.equal(await CreatorProfile.countDocuments({ userId: fixture.user._id }), 1);
  assert.equal(await CreatorApplication.countDocuments({ _id: fixture.application._id, status: "approved" }), 1);
  assert.equal(await Notification.countDocuments({ recipientId: fixture.user._id, category: "CREATOR_APPLICATION" }), 1);
});
