"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const User_1 = __importDefault(require("../../models/User"));
const userProfile_model_1 = require("../../models/userProfile.model");
const profileVerificationRequest_model_1 = require("../../models/profileVerificationRequest.model");
const profileVerificationJob_model_1 = require("../../models/profileVerificationJob.model");
const faceVerificationSession_model_1 = require("../../models/faceVerificationSession.model");
const profile_controller_1 = require("../../controllers/profile.controller");
const profileVerificationRequest_service_1 = require("../../services/profile/profileVerificationRequest.service");
const faceVerificationSession_service_1 = require("../../services/profile/faceVerificationSession.service");
const database_1 = require("../financial/phase7h/helpers/database");
process.env.NODE_ENV = "test";
const invoke = (controller, request) => new Promise((resolve, reject) => {
    const response = {
        status: () => response,
        json: (body) => {
            resolve(body);
            return response;
        },
    };
    controller(request, response, reject);
});
const profileBody = (username) => ({
    username,
    realName: "Verification Test User",
    dateOfBirth: "1990-01-01",
    mobileCountryCode: "+91",
    mobileNumber: "9876543210",
    country: "India",
    city: "Mumbai",
    languages: ["English"],
    interests: ["Music"],
    bio: "Profile verification foundation test.",
    avatar: "https://example.test/avatar.jpg",
    cover: "https://example.test/cover.jpg",
    profilePhotos: ["https://example.test/one.jpg", "https://example.test/two.jpg"],
});
const createUser = (email, status = "pending_profile") => User_1.default.create({
    email,
    password: "test-password",
    status,
    governanceState: "ACTIVE",
});
const submitProfile = async (email, username) => {
    const user = await createUser(email);
    const body = profileBody(username);
    const faceSession = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(user._id), avatar: body.avatar });
    await faceVerificationSession_model_1.FaceVerificationSession.updateOne({ _id: faceSession._id }, { $set: { status: "CAPTURE_COMPLETE", acceptedCaptureCount: 5, captureCompletedAt: new Date() } });
    await invoke(profile_controller_1.upsertProfile, { user: { id: String(user._id), role: "user", status: "pending_profile" }, body });
    const profile = await userProfile_model_1.UserProfile.findOne({ userId: user._id });
    strict_1.default.ok(profile);
    return { user, profile };
};
(0, node_test_1.before)(async () => (0, database_1.connectPhase7HDatabase)(), { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => (0, database_1.clearPhase7HDatabase)());
(0, node_test_1.after)(async () => (0, database_1.disconnectPhase7HDatabase)(), { timeout: 30000 });
(0, node_test_1.test)("first submission creates exactly one active verification request and replays safely", async () => {
    const { profile } = await submitProfile("verification-first@test.local", "verification-first");
    strict_1.default.equal(profile.profileStatus, "pending_verification");
    strict_1.default.equal(profile.verificationSubmissionVersion, 1);
    strict_1.default.equal(await profileVerificationRequest_model_1.ProfileVerificationRequest.countDocuments({ profileId: profile._id, isActive: true }), 1);
    strict_1.default.equal(await profileVerificationJob_model_1.ProfileVerificationJob.countDocuments({ verificationRequestId: (await profileVerificationRequest_model_1.ProfileVerificationRequest.findOne({ profileId: profile._id, isActive: true }))?._id }), 1);
    await Promise.all([
        (0, profileVerificationRequest_service_1.ensureActiveProfileVerificationRequest)(profile),
        (0, profileVerificationRequest_service_1.ensureActiveProfileVerificationRequest)(profile),
    ]);
    strict_1.default.equal(await profileVerificationRequest_model_1.ProfileVerificationRequest.countDocuments({ profileId: profile._id, isActive: true }), 1);
});
(0, node_test_1.test)("initial onboarding submission requires a current matching completed face session before promotion", async () => {
    const missing = await createUser("verification-face-guard-missing@test.local");
    await strict_1.default.rejects(invoke(profile_controller_1.upsertProfile, { user: { id: String(missing._id), role: "user", status: "pending_profile" }, body: profileBody("verification-face-guard-missing") }), /Complete live face verification/);
    strict_1.default.equal(await profileVerificationRequest_model_1.ProfileVerificationRequest.countDocuments({ userId: missing._id }), 0);
    const invalid = await createUser("verification-face-guard-invalid@test.local");
    const invalidBody = profileBody("verification-face-guard-invalid");
    const cancelled = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(invalid._id), avatar: invalidBody.avatar });
    await faceVerificationSession_model_1.FaceVerificationSession.updateOne({ _id: cancelled._id }, { $set: { status: "CANCELLED", isCurrent: false } });
    await strict_1.default.rejects(invoke(profile_controller_1.upsertProfile, { user: { id: String(invalid._id), role: "user", status: "pending_profile" }, body: invalidBody }), /Complete live face verification/);
    strict_1.default.equal((await userProfile_model_1.UserProfile.findById(cancelled.profileId))?.profileStatus, "incomplete");
});
(0, node_test_1.test)("pending profile mutation is rejected and leaves the submitted profile unchanged", async () => {
    const { user, profile } = await submitProfile("verification-lock@test.local", "verification-lock");
    await strict_1.default.rejects(invoke(profile_controller_1.updateMyProfile, {
        user: { id: String(user._id), role: "user", status: "active" },
        body: { bio: "An unauthorized pending mutation." },
    }));
    const reloaded = await userProfile_model_1.UserProfile.findById(profile._id).lean();
    strict_1.default.equal(reloaded?.bio, "Profile verification foundation test.");
    strict_1.default.equal(await profileVerificationRequest_model_1.ProfileVerificationRequest.countDocuments({ profileId: profile._id, isActive: true }), 1);
});
(0, node_test_1.test)("new submissions appear only in the AI Verification Queue", async () => {
    const { profile } = await submitProfile("verification-ai-queue@test.local", "verification-ai-queue");
    const [aiQueue, adminReviewQueue] = await Promise.all([
        (0, profileVerificationRequest_service_1.listProfileVerificationQueue)("AI"),
        (0, profileVerificationRequest_service_1.listProfileVerificationQueue)("ADMIN_REVIEW"),
    ]);
    strict_1.default.equal(aiQueue.filter((entry) => entry._id === String(profile._id)).length, 1);
    strict_1.default.equal(aiQueue.find((entry) => entry._id === String(profile._id))?.verificationRequest.status, "PENDING");
    strict_1.default.equal(adminReviewQueue.some((entry) => entry._id === String(profile._id)), false);
});
(0, node_test_1.test)("escalation moves the same pending request into Admin Review without changing user-facing status", async () => {
    const { profile } = await submitProfile("verification-escalation@test.local", "verification-escalation");
    const before = await profileVerificationRequest_model_1.ProfileVerificationRequest.findOne({ profileId: profile._id, isActive: true });
    strict_1.default.ok(before);
    const escalated = await (0, profileVerificationRequest_service_1.escalateProfileVerificationRequest)({
        profileId: String(profile._id),
        reasonCode: "PROCESSING_TIMEOUT",
        reason: "Automated verification remained unresolved.",
    });
    strict_1.default.equal(escalated.replayed, false);
    strict_1.default.equal(String(escalated.request._id), String(before._id));
    strict_1.default.equal(escalated.request.isActive, true);
    strict_1.default.equal(escalated.request.status, "ADMIN_REVIEW_REQUIRED");
    strict_1.default.equal(escalated.request.adminReviewReasonCode, "PROCESSING_TIMEOUT");
    strict_1.default.ok(escalated.request.adminReviewRequiredAt);
    strict_1.default.equal((await userProfile_model_1.UserProfile.findById(profile._id))?.profileStatus, "pending_verification");
    const [aiQueue, adminReviewQueue] = await Promise.all([
        (0, profileVerificationRequest_service_1.listProfileVerificationQueue)("AI"),
        (0, profileVerificationRequest_service_1.listProfileVerificationQueue)("ADMIN_REVIEW"),
    ]);
    strict_1.default.equal(aiQueue.some((entry) => entry._id === String(profile._id)), false);
    strict_1.default.equal(adminReviewQueue.find((entry) => entry._id === String(profile._id))?.verificationRequest.adminReviewReason, "Automated verification remained unresolved.");
});
(0, node_test_1.test)("admin approval is terminal, replay-safe, and cannot be overwritten by future AI", async () => {
    const { profile } = await submitProfile("verification-approve@test.local", "verification-approve");
    const admin = await User_1.default.create({ email: "verification-admin@test.local", password: "test-password", role: "admin", status: "active", governanceState: "ACTIVE" });
    const approved = await (0, profileVerificationRequest_service_1.decideProfileVerificationRequest)({ profileId: String(profile._id), decision: "APPROVE", authority: "ADMIN", decidedBy: String(admin._id) });
    strict_1.default.equal(approved.replayed, false);
    strict_1.default.equal(approved.request.status, "APPROVED");
    strict_1.default.equal(approved.request.decisionAuthority, "ADMIN");
    strict_1.default.equal((await userProfile_model_1.UserProfile.findById(profile._id))?.profileStatus, "verified");
    const replay = await (0, profileVerificationRequest_service_1.decideProfileVerificationRequest)({ profileId: String(profile._id), decision: "APPROVE", authority: "ADMIN", decidedBy: String(admin._id) });
    strict_1.default.equal(replay.replayed, true);
    await strict_1.default.rejects((0, profileVerificationRequest_service_1.decideProfileVerificationRequest)({ profileId: String(profile._id), decision: "REJECT", authority: "AI", reason: "stale result" }));
    strict_1.default.equal((await userProfile_model_1.UserProfile.findById(profile._id))?.profileStatus, "verified");
});
(0, node_test_1.test)("an AI terminal decision cannot be overwritten by a later admin decision", async () => {
    const { profile } = await submitProfile("verification-ai-first@test.local", "verification-ai-first");
    const admin = await User_1.default.create({ email: "verification-ai-first-admin@test.local", password: "test-password", role: "admin", status: "active", governanceState: "ACTIVE" });
    const approved = await (0, profileVerificationRequest_service_1.decideProfileVerificationRequest)({ profileId: String(profile._id), decision: "APPROVE", authority: "AI" });
    strict_1.default.equal(approved.request.decisionAuthority, "AI");
    await strict_1.default.rejects((0, profileVerificationRequest_service_1.decideProfileVerificationRequest)({ profileId: String(profile._id), decision: "REJECT", authority: "ADMIN", decidedBy: String(admin._id), reason: "stale manual decision" }));
    strict_1.default.equal((await userProfile_model_1.UserProfile.findById(profile._id))?.profileStatus, "verified");
});
(0, node_test_1.test)("AI and Admin can decide an unresolved Admin Review request, and terminal requests leave both queues", async () => {
    const { profile } = await submitProfile("verification-review-ai@test.local", "verification-review-ai");
    await (0, profileVerificationRequest_service_1.escalateProfileVerificationRequest)({ profileId: String(profile._id), reasonCode: "MODEL_FAILURE" });
    const decided = await (0, profileVerificationRequest_service_1.decideProfileVerificationRequest)({ profileId: String(profile._id), decision: "REJECT", authority: "AI", reason: "Verification could not be completed." });
    strict_1.default.equal(decided.request.status, "REJECTED");
    strict_1.default.equal((await userProfile_model_1.UserProfile.findById(profile._id))?.profileStatus, "rejected");
    const [aiQueue, adminReviewQueue] = await Promise.all([
        (0, profileVerificationRequest_service_1.listProfileVerificationQueue)("AI"),
        (0, profileVerificationRequest_service_1.listProfileVerificationQueue)("ADMIN_REVIEW"),
    ]);
    strict_1.default.equal(aiQueue.some((entry) => entry._id === String(profile._id)), false);
    strict_1.default.equal(adminReviewQueue.some((entry) => entry._id === String(profile._id)), false);
    const { profile: adminProfile } = await submitProfile("verification-review-admin@test.local", "verification-review-admin");
    const admin = await User_1.default.create({ email: "verification-review-admin-user@test.local", password: "test-password", role: "admin", status: "active", governanceState: "ACTIVE" });
    await (0, profileVerificationRequest_service_1.escalateProfileVerificationRequest)({ profileId: String(adminProfile._id), reasonCode: "TEXT_MODERATION_UNCERTAIN" });
    const approved = await (0, profileVerificationRequest_service_1.decideProfileVerificationRequest)({ profileId: String(adminProfile._id), decision: "APPROVE", authority: "ADMIN", decidedBy: String(admin._id) });
    strict_1.default.equal(approved.request.status, "APPROVED");
    strict_1.default.equal((await userProfile_model_1.UserProfile.findById(adminProfile._id))?.profileStatus, "verified");
});
(0, node_test_1.test)("first terminal decision still wins after escalation and same-decision replay remains safe", async () => {
    const { profile } = await submitProfile("verification-review-race@test.local", "verification-review-race");
    const admin = await User_1.default.create({ email: "verification-review-race-admin@test.local", password: "test-password", role: "admin", status: "active", governanceState: "ACTIVE" });
    await (0, profileVerificationRequest_service_1.escalateProfileVerificationRequest)({ profileId: String(profile._id), reasonCode: "LIVENESS_UNCERTAIN" });
    const adminApproval = await (0, profileVerificationRequest_service_1.decideProfileVerificationRequest)({ profileId: String(profile._id), decision: "APPROVE", authority: "ADMIN", decidedBy: String(admin._id) });
    strict_1.default.equal(adminApproval.replayed, false);
    const replay = await (0, profileVerificationRequest_service_1.decideProfileVerificationRequest)({ profileId: String(profile._id), decision: "APPROVE", authority: "ADMIN", decidedBy: String(admin._id) });
    strict_1.default.equal(replay.replayed, true);
    await strict_1.default.rejects((0, profileVerificationRequest_service_1.decideProfileVerificationRequest)({ profileId: String(profile._id), decision: "REJECT", authority: "AI", reason: "stale AI result" }));
    const { profile: aiProfile } = await submitProfile("verification-review-ai-race@test.local", "verification-review-ai-race");
    await (0, profileVerificationRequest_service_1.escalateProfileVerificationRequest)({ profileId: String(aiProfile._id), reasonCode: "FACE_MATCH_UNCERTAIN" });
    await (0, profileVerificationRequest_service_1.decideProfileVerificationRequest)({ profileId: String(aiProfile._id), decision: "APPROVE", authority: "AI" });
    await strict_1.default.rejects((0, profileVerificationRequest_service_1.decideProfileVerificationRequest)({ profileId: String(aiProfile._id), decision: "REJECT", authority: "ADMIN", decidedBy: String(admin._id), reason: "stale manual result" }));
    strict_1.default.equal((await userProfile_model_1.UserProfile.findById(aiProfile._id))?.profileStatus, "verified");
});
(0, node_test_1.test)("admin rejection preserves reason and a rejected resubmission creates a new active attempt", async () => {
    const { user, profile } = await submitProfile("verification-reject@test.local", "verification-reject");
    const admin = await User_1.default.create({ email: "verification-reject-admin@test.local", password: "test-password", role: "admin", status: "active", governanceState: "ACTIVE" });
    const rejected = await (0, profileVerificationRequest_service_1.decideProfileVerificationRequest)({ profileId: String(profile._id), decision: "REJECT", authority: "ADMIN", decidedBy: String(admin._id), reason: "Please improve the profile information." });
    strict_1.default.equal(rejected.request.status, "REJECTED");
    strict_1.default.equal((await userProfile_model_1.UserProfile.findById(profile._id))?.rejectionReason, "Please improve the profile information.");
    await invoke(profile_controller_1.updateMyProfile, {
        user: { id: String(user._id), role: "user", status: "active" },
        body: { ...profileBody("verification-reject"), bio: "Corrected profile information." },
    });
    const reloaded = await userProfile_model_1.UserProfile.findById(profile._id);
    strict_1.default.equal(reloaded?.profileStatus, "pending_verification");
    strict_1.default.equal(reloaded?.verificationSubmissionVersion, 2);
    const requests = await profileVerificationRequest_model_1.ProfileVerificationRequest.find({ profileId: profile._id }).sort({ attemptNumber: 1 }).lean();
    strict_1.default.equal(requests.length, 2);
    strict_1.default.equal(requests[0].status, "REJECTED");
    strict_1.default.equal(requests[1].status, "PENDING");
    strict_1.default.equal(requests[1].isActive, true);
    const [aiQueue, adminReviewQueue] = await Promise.all([
        (0, profileVerificationRequest_service_1.listProfileVerificationQueue)("AI"),
        (0, profileVerificationRequest_service_1.listProfileVerificationQueue)("ADMIN_REVIEW"),
    ]);
    strict_1.default.equal(aiQueue.some((entry) => entry._id === String(profile._id)), true);
    strict_1.default.equal(adminReviewQueue.some((entry) => entry._id === String(profile._id)), false);
});
(0, node_test_1.test)("legacy pending profiles receive one compatible active request without duplicate creation", async () => {
    const user = await createUser("verification-legacy@test.local", "active");
    const profile = await userProfile_model_1.UserProfile.create({
        userId: user._id,
        username: "verification-legacy",
        dateOfBirth: new Date("1990-01-01"),
        interests: [],
        bio: "Legacy pending profile.",
        avatar: "https://example.test/avatar.jpg",
        cover: "https://example.test/cover.jpg",
        profilePhotos: ["https://example.test/one.jpg", "https://example.test/two.jpg"],
        profileStatus: "pending_verification",
        verificationSubmittedAt: new Date(),
    });
    await (0, profileVerificationRequest_service_1.ensureLegacyPendingProfileVerificationRequest)(profile);
    await (0, profileVerificationRequest_service_1.ensureLegacyPendingProfileVerificationRequest)(profile);
    strict_1.default.equal(await profileVerificationRequest_model_1.ProfileVerificationRequest.countDocuments({ profileId: profile._id, isActive: true }), 1);
    strict_1.default.equal((await userProfile_model_1.UserProfile.findById(profile._id))?.verificationSubmissionVersion, 1);
    const [aiQueue, adminReviewQueue] = await Promise.all([
        (0, profileVerificationRequest_service_1.listProfileVerificationQueue)("AI"),
        (0, profileVerificationRequest_service_1.listProfileVerificationQueue)("ADMIN_REVIEW"),
    ]);
    strict_1.default.equal(aiQueue.some((entry) => entry._id === String(profile._id)), true);
    strict_1.default.equal(adminReviewQueue.some((entry) => entry._id === String(profile._id)), false);
});
