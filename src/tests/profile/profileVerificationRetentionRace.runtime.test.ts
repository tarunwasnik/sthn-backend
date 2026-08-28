import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";
import { ProfileVerificationRequest } from "../../models/profileVerificationRequest.model";
import { profileVerificationRequestRepository } from "../../repositories/profileVerificationRequest.repository";
import { expireProfileVerificationRequests } from "../../services/profile/profileVerificationRequest.service";
import { FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS } from "../../services/profile/faceVerification.constants";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";

before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

const createRequest = async (suffix: string, submittedAt = new Date()) => {
  const user = await User.create({ email: `retention-race-${suffix}@test.local`, password: "test-password", status: "active", governanceState: "ACTIVE" });
  const profile = await UserProfile.create({ userId: user._id, username: `retention-race-${suffix}`, dateOfBirth: new Date("1990-01-01"), interests: [], bio: "Retention race profile.", avatar: "https://example.test/avatar.jpg", cover: "https://example.test/cover.jpg", profilePhotos: ["https://example.test/one.jpg", "https://example.test/two.jpg"], profileStatus: "pending_verification", verificationSubmittedAt: submittedAt, verificationSubmissionVersion: 7 });
  const request = await ProfileVerificationRequest.create({ verificationReference: `PROFILE_RETENTION_RACE_${suffix}`, profileId: profile._id, userId: user._id, attemptNumber: 1, profileSubmissionVersion: 7, submittedAt });
  return { user, profile, request };
};

test("stale Admin mutation cannot overwrite an expiry transition", async () => {
  const submittedAt = new Date(Date.now() - FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS - 1);
  const { request } = await createRequest("stale-admin", submittedAt);
  const deadline = new Date(submittedAt.getTime() + FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS);
  const expired = await profileVerificationRequestRepository.transitionToExpired({ requestId: request._id, now: new Date(), retentionDeadline: deadline });
  assert.equal(expired?.status, "EXPIRED");
  const staleAdmin = await profileVerificationRequestRepository.transitionToTerminal({ requestId: request._id, decision: "APPROVE", authority: "ADMIN", decidedAt: new Date(), now: new Date() });
  assert.equal(staleAdmin, null);
  const reloaded = await ProfileVerificationRequest.findById(request._id);
  assert.equal(reloaded?.status, "EXPIRED"); assert.equal(reloaded?.decision, undefined); assert.equal(reloaded?.decisionAuthority, undefined);
});

test("stale expiry mutation cannot overwrite a valid Admin terminal decision", async () => {
  const { request } = await createRequest("stale-expiry");
  const staleDeadline = new Date(Date.now());
  const approved = await profileVerificationRequestRepository.transitionToTerminal({ requestId: request._id, decision: "APPROVE", authority: "ADMIN", decidedAt: new Date(), now: new Date() });
  assert.equal(approved?.status, "APPROVED");
  assert.equal(await profileVerificationRequestRepository.transitionToExpired({ requestId: request._id, now: new Date(), retentionDeadline: staleDeadline }), null);
  const reloaded = await ProfileVerificationRequest.findById(request._id);
  assert.equal(reloaded?.status, "APPROVED"); assert.equal(reloaded?.expiredAt, undefined);
});

test("processing and admin-review transitions reject the retention boundary", async () => {
  const submittedAt = new Date(Date.now() - FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS);
  const { request } = await createRequest("deadline", submittedAt);
  assert.equal(await profileVerificationRequestRepository.transitionPendingToProcessing(request._id, new Date()), null);
  await ProfileVerificationRequest.updateOne({ _id: request._id }, { $set: { status: "PROCESSING" } });
  assert.equal(await profileVerificationRequestRepository.transitionToAdminReview({ requestId: request._id, reasonCode: "OTHER", requiredAt: new Date(), now: new Date() }), null);
});

test("expiry reconciliation is replay-safe and does not mutate version or decision authority", async () => {
  const submittedAt = new Date(Date.now() - FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS - 1);
  const { profile, request } = await createRequest("replay", submittedAt);
  await expireProfileVerificationRequests(new Date());
  const first = await ProfileVerificationRequest.findById(request._id);
  const firstExpiredAt = first?.expiredAt?.getTime();
  await expireProfileVerificationRequests(new Date());
  const [second, reloadedProfile] = await Promise.all([ProfileVerificationRequest.findById(request._id), UserProfile.findById(profile._id)]);
  assert.equal(second?.status, "EXPIRED"); assert.equal(second?.isActive, false); assert.equal(second?.expiredAt?.getTime(), firstExpiredAt);
  assert.equal(second?.decision, undefined); assert.equal(second?.decisionAuthority, undefined); assert.equal(second?.decidedAt, undefined); assert.equal(second?.decidedBy, undefined);
  assert.equal(reloadedProfile?.profileStatus, "incomplete"); assert.equal(reloadedProfile?.verificationSubmissionVersion, 7);
  assert.equal(await ProfileVerificationRequest.countDocuments({ profileId: profile._id }), 1);
});
