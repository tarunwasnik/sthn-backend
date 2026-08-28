"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const faceVerificationEvidence_model_1 = require("../../models/faceVerificationEvidence.model");
const faceVerificationSession_model_1 = require("../../models/faceVerificationSession.model");
const profileVerificationJob_model_1 = require("../../models/profileVerificationJob.model");
const profileVerificationRequest_model_1 = require("../../models/profileVerificationRequest.model");
const userProfile_model_1 = require("../../models/userProfile.model");
const User_1 = __importDefault(require("../../models/User"));
const faceVerificationSession_service_1 = require("../../services/profile/faceVerificationSession.service");
const faceVerificationSession_service_2 = require("../../services/profile/faceVerificationSession.service");
const faceVerificationEvidenceCleanup_service_1 = require("../../services/profile/faceVerificationEvidenceCleanup.service");
const faceVerificationEvidence_repository_1 = require("../../repositories/faceVerificationEvidence.repository");
const faceVerificationSession_repository_1 = require("../../repositories/faceVerificationSession.repository");
const faceVerification_constants_1 = require("../../services/profile/faceVerification.constants");
const profile_controller_1 = require("../../controllers/profile.controller");
const upload_middleware_1 = require("../../middlewares/upload.middleware");
const database_1 = require("../financial/phase7h/helpers/database");
process.env.NODE_ENV = "test";
const storage = require("../../services/profile/faceVerificationEvidenceStorage.service");
const deletionStorage = require("../../services/profile/faceVerificationEvidenceStorage.service");
const originalStore = storage.storeFaceVerificationEvidence;
const originalDelete = deletionStorage.deleteFaceVerificationEvidence;
let uploadCalls = 0;
storage.storeFaceVerificationEvidence = async (input) => { uploadCalls += 1; return { publicId: input.publicId, bytes: input.buffer.length, format: "jpeg", mimeType: "image/jpeg" }; };
const file = (index) => ({ buffer: Buffer.from([0xff, 0xd8, 0xff, index]), mimetype: "image/jpeg", size: 4, originalname: "capture.jpg" });
const invoke = (controller, request) => new Promise((resolve, reject) => {
    const response = { status: () => response, json: (body) => { resolve(body); return response; } };
    controller(request, response, reject);
});
const submission = (username, avatar) => ({ username, realName: "Face Test User", dateOfBirth: "1990-01-01", mobileCountryCode: "+91", mobileNumber: "9876543210", country: "India", city: "Mumbai", languages: ["English"], interests: [], bio: "Face verification test profile.", avatar, cover: "https://example.test/cover.jpg", profilePhotos: ["https://example.test/one.jpg", "https://example.test/two.jpg"] });
(0, node_test_1.before)(async () => (0, database_1.connectPhase7HDatabase)(), { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => { await (0, database_1.clearPhase7HDatabase)(); uploadCalls = 0; storage.storeFaceVerificationEvidence = async (input) => { uploadCalls += 1; return { publicId: input.publicId, bytes: input.buffer.length, format: "jpeg", mimeType: "image/jpeg" }; }; });
(0, node_test_1.after)(async () => { storage.storeFaceVerificationEvidence = originalStore; deletionStorage.deleteFaceVerificationEvidence = originalDelete; await (0, database_1.disconnectPhase7HDatabase)(); }, { timeout: 30000 });
(0, node_test_1.test)("face session provisions only a draft and never creates a submitted verification authority", async () => {
    const user = await User_1.default.create({ email: "face-draft@test.local", password: "test-password", status: "pending_profile", governanceState: "ACTIVE" });
    const session = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(user._id), avatar: "https://example.test/avatar-a.jpg" });
    const profile = await userProfile_model_1.UserProfile.findById(session.profileId);
    strict_1.default.equal(profile?.profileStatus, "incomplete");
    strict_1.default.equal(await profileVerificationRequest_model_1.ProfileVerificationRequest.countDocuments({ profileId: session.profileId }), 0);
    strict_1.default.equal(await profileVerificationJob_model_1.ProfileVerificationJob.countDocuments({ profileId: session.profileId }), 0);
    strict_1.default.equal((await User_1.default.findById(user._id))?.status, "pending_profile");
    strict_1.default.equal(session.challenges.length, 5);
    strict_1.default.equal(new Set(session.challenges).size, 5);
});
(0, node_test_1.test)("five distinct server-owned capture slots complete a session once and replay does not duplicate", async () => {
    const user = await User_1.default.create({ email: "face-captures@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
    const session = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(user._id), avatar: "https://example.test/avatar-b.jpg" });
    for (let index = 0; index < 5; index += 1)
        await (0, faceVerificationSession_service_1.acceptFaceVerificationCapture)({ userId: String(user._id), sessionReference: session.sessionReference, challengeIndex: String(index), file: file(index) });
    const complete = await faceVerificationSession_model_1.FaceVerificationSession.findById(session._id);
    strict_1.default.equal(complete?.status, "CAPTURE_COMPLETE");
    strict_1.default.equal(complete?.acceptedCaptureCount, 5);
    strict_1.default.equal(await faceVerificationEvidence_model_1.FaceVerificationEvidence.countDocuments({ sessionId: session._id, status: "STORED" }), 5);
    const replay = await (0, faceVerificationSession_service_1.acceptFaceVerificationCapture)({ userId: String(user._id), sessionReference: session.sessionReference, challengeIndex: "0", file: file(0) });
    strict_1.default.equal(replay.replayed, true);
    strict_1.default.equal(await faceVerificationEvidence_model_1.FaceVerificationEvidence.countDocuments({ sessionId: session._id }), 5);
});
(0, node_test_1.test)("session TTL is fifteen minutes and cross-user reads, cancellation, and capture are BOLA-safe", async () => {
    const [owner, other] = await Promise.all([
        User_1.default.create({ email: "face-owner@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" }),
        User_1.default.create({ email: "face-other@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" }),
    ]);
    const session = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(owner._id), avatar: "https://example.test/avatar-owner.jpg" });
    strict_1.default.equal(session.expiresAt.getTime() - session.startedAt.getTime(), faceVerification_constants_1.FACE_VERIFICATION_SESSION_TTL_MS);
    await strict_1.default.rejects((0, faceVerificationSession_service_2.getOwnedFaceVerificationSession)({ userId: String(other._id), sessionReference: session.sessionReference }), /not found/);
    await strict_1.default.rejects((0, faceVerificationSession_service_2.cancelFaceVerificationSession)({ userId: String(other._id), sessionReference: session.sessionReference }), /not found/);
    await strict_1.default.rejects((0, faceVerificationSession_service_1.acceptFaceVerificationCapture)({ userId: String(other._id), sessionReference: session.sessionReference, challengeIndex: "0", file: file(0) }), /not found/);
    strict_1.default.equal(await faceVerificationEvidence_model_1.FaceVerificationEvidence.countDocuments({ sessionId: session._id }), 0);
    strict_1.default.equal(uploadCalls, 0);
});
(0, node_test_1.test)("current-session, challenge, index, replay, sixth-capture, and terminal-mutation invariants hold", async () => {
    const user = await User_1.default.create({ email: "face-invariants@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
    const session = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(user._id), avatar: "https://example.test/avatar-invariants.jpg" });
    const replayStart = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(user._id), avatar: "https://example.test/avatar-invariants.jpg" });
    strict_1.default.equal(String(replayStart._id), String(session._id));
    strict_1.default.equal(await faceVerificationSession_model_1.FaceVerificationSession.countDocuments({ profileId: session.profileId, isCurrent: true }), 1);
    strict_1.default.equal(session.challenges.length, 5);
    strict_1.default.equal(new Set(session.challenges).size, 5);
    for (const invalid of ["-1", "5", "bad"])
        await strict_1.default.rejects((0, faceVerificationSession_service_1.acceptFaceVerificationCapture)({ userId: String(user._id), sessionReference: session.sessionReference, challengeIndex: invalid, file: file(0) }), /Invalid/);
    await (0, faceVerificationSession_service_1.acceptFaceVerificationCapture)({ userId: String(user._id), sessionReference: session.sessionReference, challengeIndex: "0", file: file(0) });
    const replay = await (0, faceVerificationSession_service_1.acceptFaceVerificationCapture)({ userId: String(user._id), sessionReference: session.sessionReference, challengeIndex: "0", file: file(9) });
    strict_1.default.equal(replay.replayed, true);
    strict_1.default.equal(await faceVerificationEvidence_model_1.FaceVerificationEvidence.countDocuments({ sessionId: session._id }), 1);
    for (let index = 1; index < 5; index += 1)
        await (0, faceVerificationSession_service_1.acceptFaceVerificationCapture)({ userId: String(user._id), sessionReference: session.sessionReference, challengeIndex: String(index), file: file(index) });
    const completed = await faceVerificationSession_model_1.FaceVerificationSession.findById(session._id);
    strict_1.default.equal(completed?.status, "CAPTURE_COMPLETE");
    strict_1.default.equal(completed?.acceptedCaptureCount, 5);
    await strict_1.default.rejects((0, faceVerificationSession_service_1.acceptFaceVerificationCapture)({ userId: String(user._id), sessionReference: session.sessionReference, challengeIndex: "5", file: file(5) }), /Invalid/);
    strict_1.default.equal((await faceVerificationSession_model_1.FaceVerificationSession.findById(session._id))?.acceptedCaptureCount, 5);
});
(0, node_test_1.test)("cancelled and expired partial sessions become cleanup eligible and cannot accept captures", async () => {
    const user = await User_1.default.create({ email: "face-terminal@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
    const cancelled = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(user._id), avatar: "https://example.test/avatar-cancel.jpg" });
    await (0, faceVerificationSession_service_1.acceptFaceVerificationCapture)({ userId: String(user._id), sessionReference: cancelled.sessionReference, challengeIndex: "0", file: file(0) });
    await (0, faceVerificationSession_service_2.cancelFaceVerificationSession)({ userId: String(user._id), sessionReference: cancelled.sessionReference });
    await strict_1.default.rejects((0, faceVerificationSession_service_1.acceptFaceVerificationCapture)({ userId: String(user._id), sessionReference: cancelled.sessionReference, challengeIndex: "1", file: file(1) }), /not accepting/);
    const cancelledEvidence = await faceVerificationEvidence_model_1.FaceVerificationEvidence.findOne({ sessionId: cancelled._id });
    strict_1.default.ok(cancelledEvidence?.cleanupAfter);
    const expired = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(user._id), avatar: "https://example.test/avatar-expired.jpg" });
    await (0, faceVerificationSession_service_1.acceptFaceVerificationCapture)({ userId: String(user._id), sessionReference: expired.sessionReference, challengeIndex: "0", file: file(0) });
    await faceVerificationSession_model_1.FaceVerificationSession.updateOne({ _id: expired._id }, { $set: { expiresAt: new Date(Date.now() - 1) } });
    await (0, faceVerificationSession_service_2.expireFaceVerificationSessions)(new Date());
    await strict_1.default.rejects((0, faceVerificationSession_service_1.acceptFaceVerificationCapture)({ userId: String(user._id), sessionReference: expired.sessionReference, challengeIndex: "1", file: file(1) }), /not accepting/);
    strict_1.default.equal((await faceVerificationSession_model_1.FaceVerificationSession.findById(expired._id))?.status, "EXPIRED");
    strict_1.default.ok((await faceVerificationEvidence_model_1.FaceVerificationEvidence.findOne({ sessionId: expired._id }))?.cleanupAfter);
});
(0, node_test_1.test)("avatar invalidates complete evidence while non-avatar profile data does not", async () => {
    const user = await User_1.default.create({ email: "face-avatar@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
    const session = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(user._id), avatar: "https://example.test/avatar-a.jpg" });
    for (let index = 0; index < 5; index += 1)
        await (0, faceVerificationSession_service_1.acceptFaceVerificationCapture)({ userId: String(user._id), sessionReference: session.sessionReference, challengeIndex: String(index), file: file(index) });
    const profile = await userProfile_model_1.UserProfile.findById(session.profileId);
    strict_1.default.ok(profile);
    profile.bio = "Changed bio only";
    await profile.save();
    await (0, faceVerificationSession_service_2.invalidateFaceSessionsForAvatar)(profile);
    strict_1.default.equal((await faceVerificationSession_model_1.FaceVerificationSession.findById(session._id))?.status, "CAPTURE_COMPLETE");
    profile.avatar = "https://example.test/avatar-b.jpg";
    await profile.save();
    await (0, faceVerificationSession_service_2.invalidateFaceSessionsForAvatar)(profile);
    strict_1.default.equal((await faceVerificationSession_model_1.FaceVerificationSession.findById(session._id))?.status, "INVALIDATED");
    await strict_1.default.rejects((0, faceVerificationSession_service_1.acceptFaceVerificationCapture)({ userId: String(user._id), sessionReference: session.sessionReference, challengeIndex: "0", file: file(0) }), /not accepting/);
});
(0, node_test_1.test)("storage failure and finalization failure never falsely accept evidence and leave recoverable cleanup state", async () => {
    const user = await User_1.default.create({ email: "face-failure@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
    const failedUpload = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(user._id), avatar: "https://example.test/avatar-failure.jpg" });
    storage.storeFaceVerificationEvidence = async () => { throw new Error("controlled upload failure"); };
    await strict_1.default.rejects((0, faceVerificationSession_service_1.acceptFaceVerificationCapture)({ userId: String(user._id), sessionReference: failedUpload.sessionReference, challengeIndex: "0", file: file(0) }), /controlled upload failure/);
    strict_1.default.equal((await faceVerificationSession_model_1.FaceVerificationSession.findById(failedUpload._id))?.acceptedCaptureCount, 0);
    strict_1.default.equal((await faceVerificationEvidence_model_1.FaceVerificationEvidence.findOne({ sessionId: failedUpload._id }))?.status, "UPLOADING");
    const originalFinalize = faceVerificationEvidence_repository_1.faceVerificationEvidenceRepository.finalizeStored.bind(faceVerificationEvidence_repository_1.faceVerificationEvidenceRepository);
    faceVerificationEvidence_repository_1.faceVerificationEvidenceRepository.finalizeStored = async () => null;
    storage.storeFaceVerificationEvidence = async (input) => ({ publicId: input.publicId, bytes: 4, format: "jpeg", mimeType: "image/jpeg" });
    const secondUser = await User_1.default.create({ email: "face-finalization@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
    try {
        const finalizationFailed = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(secondUser._id), avatar: "https://example.test/avatar-finalize.jpg" });
        await strict_1.default.rejects((0, faceVerificationSession_service_1.acceptFaceVerificationCapture)({ userId: String(secondUser._id), sessionReference: finalizationFailed.sessionReference, challengeIndex: "0", file: file(0) }), /could not be finalized/);
        const orphan = await faceVerificationEvidence_model_1.FaceVerificationEvidence.findOne({ sessionId: finalizationFailed._id });
        strict_1.default.equal(orphan?.status, "UPLOADING");
        strict_1.default.ok(orphan?.cleanupAfter);
    }
    finally {
        faceVerificationEvidence_repository_1.faceVerificationEvidenceRepository.finalizeStored = originalFinalize;
    }
});
(0, node_test_1.test)("retention defaults start at terminal decision, not capture completion", async () => {
    const user = await User_1.default.create({ email: "face-retention@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
    const session = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(user._id), avatar: "https://example.test/avatar-retention.jpg" });
    await (0, faceVerificationSession_service_1.acceptFaceVerificationCapture)({ userId: String(user._id), sessionReference: session.sessionReference, challengeIndex: "0", file: file(0) });
    const evidence = await faceVerificationEvidence_model_1.FaceVerificationEvidence.findOne({ sessionId: session._id });
    strict_1.default.equal(evidence?.cleanupAfter, undefined);
    const requestId = new (require("mongoose").Types.ObjectId)();
    await faceVerificationEvidence_model_1.FaceVerificationEvidence.updateOne({ _id: evidence?._id }, { $set: { verificationRequestId: requestId } });
    const approvedAt = new Date();
    await (0, faceVerificationEvidenceCleanup_service_1.scheduleFaceEvidenceRetentionForDecision)(requestId, "APPROVE", approvedAt);
    strict_1.default.equal((await faceVerificationEvidence_model_1.FaceVerificationEvidence.findById(evidence?._id))?.cleanupAfter?.getTime(), approvedAt.getTime() + faceVerification_constants_1.FACE_VERIFICATION_APPROVED_RETENTION_MS);
    await faceVerificationEvidence_model_1.FaceVerificationEvidence.updateOne({ _id: evidence?._id }, { $set: { status: "STORED" } });
    await (0, faceVerificationEvidenceCleanup_service_1.scheduleFaceEvidenceRetentionForDecision)(requestId, "REJECT", approvedAt);
    strict_1.default.equal((await faceVerificationEvidence_model_1.FaceVerificationEvidence.findById(evidence?._id))?.cleanupAfter?.getTime(), approvedAt.getTime() + faceVerification_constants_1.FACE_VERIFICATION_REJECTED_RETENTION_MS);
    strict_1.default.equal(faceVerification_constants_1.FACE_VERIFICATION_SHORT_CLEANUP_MS, 24 * 60 * 60 * 1000);
});
(0, node_test_1.test)("matching completed pre-submit capture binds once to the first real verification request, while mismatches do not bind", async () => {
    const user = await User_1.default.create({ email: "face-binding@test.local", password: "test-password", status: "pending_profile", governanceState: "ACTIVE" });
    const avatarA = "https://example.test/avatar-binding-a.jpg";
    const session = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(user._id), avatar: avatarA });
    for (let index = 0; index < 5; index += 1)
        await (0, faceVerificationSession_service_1.acceptFaceVerificationCapture)({ userId: String(user._id), sessionReference: session.sessionReference, challengeIndex: String(index), file: file(index) });
    await invoke(profile_controller_1.upsertProfile, { user: { id: String(user._id), role: "user", status: "pending_profile" }, body: submission("face-binding", avatarA) });
    const [profile, request, bound] = await Promise.all([
        userProfile_model_1.UserProfile.findById(session.profileId), profileVerificationRequest_model_1.ProfileVerificationRequest.findOne({ profileId: session.profileId }), faceVerificationSession_model_1.FaceVerificationSession.findById(session._id),
    ]);
    strict_1.default.equal(profile?.profileStatus, "pending_verification");
    strict_1.default.ok(request);
    strict_1.default.equal(String(bound?.verificationRequestId), String(request?._id));
    strict_1.default.equal(await profileVerificationJob_model_1.ProfileVerificationJob.countDocuments({ verificationRequestId: request?._id }), 1);
    const mismatchUser = await User_1.default.create({ email: "face-binding-mismatch@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
    const mismatch = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(mismatchUser._id), avatar: "https://example.test/avatar-old.jpg" });
    for (let index = 0; index < 5; index += 1)
        await (0, faceVerificationSession_service_1.acceptFaceVerificationCapture)({ userId: String(mismatchUser._id), sessionReference: mismatch.sessionReference, challengeIndex: String(index), file: file(index) });
    const mismatchProfile = await userProfile_model_1.UserProfile.findById(mismatch.profileId);
    strict_1.default.ok(mismatchProfile);
    mismatchProfile.avatar = "https://example.test/avatar-new.jpg";
    mismatchProfile.verificationSubmissionVersion = 1;
    await mismatchProfile.save();
    const unbound = await (0, faceVerificationSession_service_2.bindCompletedFaceSessionToVerificationRequest)({ profile: mismatchProfile, requestId: new (require("mongoose").Types.ObjectId)() });
    strict_1.default.equal(unbound, null);
});
(0, node_test_1.test)("face evidence magic-byte validation rejects non-image, SVG, GIF, and malformed payloads", () => {
    strict_1.default.doesNotThrow(() => (0, upload_middleware_1.assertFaceVerificationImageBytes)(file(0)));
    for (const buffer of [Buffer.from("<svg></svg>"), Buffer.from("GIF89a"), Buffer.from("%PDF-1.7"), Buffer.from([0x00, 0x01, 0x02])]) {
        strict_1.default.throws(() => (0, upload_middleware_1.assertFaceVerificationImageBytes)({ ...file(0), buffer }));
    }
});
(0, node_test_1.test)("cleanup is idempotent and only deletes evidence that is due", async () => {
    const user = await User_1.default.create({ email: "face-cleanup@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
    const session = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(user._id), avatar: "https://example.test/avatar-cleanup.jpg" });
    await (0, faceVerificationSession_service_1.acceptFaceVerificationCapture)({ userId: String(user._id), sessionReference: session.sessionReference, challengeIndex: "0", file: file(0) });
    const evidence = await faceVerificationEvidence_model_1.FaceVerificationEvidence.findOne({ sessionId: session._id });
    strict_1.default.ok(evidence);
    await faceVerificationEvidence_model_1.FaceVerificationEvidence.updateOne({ _id: evidence._id }, { $set: { status: "DELETE_PENDING", cleanupAfter: new Date(Date.now() - 1) } });
    let deletes = 0;
    deletionStorage.deleteFaceVerificationEvidence = async () => { deletes += 1; };
    await (0, faceVerificationEvidenceCleanup_service_1.reconcileFaceVerificationEvidenceRetention)(new Date());
    await (0, faceVerificationEvidenceCleanup_service_1.reconcileFaceVerificationEvidenceRetention)(new Date());
    strict_1.default.equal(deletes, 1);
    strict_1.default.equal((await faceVerificationEvidence_model_1.FaceVerificationEvidence.findById(evidence._id))?.status, "DELETED");
    deletionStorage.deleteFaceVerificationEvidence = originalDelete;
});
(0, node_test_1.test)("an abandoned partial session is retired and a same-avatar restart begins at challenge index zero", async () => {
    const user = await User_1.default.create({ email: "face-restart-partial@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
    const previous = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(user._id), avatar: "https://example.test/avatar-restart.jpg" });
    await (0, faceVerificationSession_service_1.acceptFaceVerificationCapture)({ userId: String(user._id), sessionReference: previous.sessionReference, challengeIndex: "0", file: file(0) });
    const replacement = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(user._id), avatar: "https://example.test/avatar-restart.jpg" });
    const retired = await faceVerificationSession_model_1.FaceVerificationSession.findById(previous._id);
    strict_1.default.notEqual(String(replacement._id), String(previous._id));
    strict_1.default.equal(replacement.status, "CREATED");
    strict_1.default.equal(replacement.acceptedCaptureCount, 0);
    strict_1.default.equal(retired?.status, "CANCELLED");
    strict_1.default.equal(retired?.isCurrent, false);
    strict_1.default.ok(retired?.cleanupAfter);
    strict_1.default.equal(await faceVerificationSession_model_1.FaceVerificationSession.countDocuments({ profileId: previous.profileId, isCurrent: true }), 1);
});
(0, node_test_1.test)("avatar mismatch replaces created, partial, and completed sessions without preserving current authority", async () => {
    const createdUser = await User_1.default.create({ email: "face-avatar-created@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
    const created = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(createdUser._id), avatar: "https://example.test/avatar-created-a.jpg" });
    const createdReplacement = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(createdUser._id), avatar: "https://example.test/avatar-created-b.jpg" });
    strict_1.default.equal((await faceVerificationSession_model_1.FaceVerificationSession.findById(created._id))?.status, "INVALIDATED");
    strict_1.default.equal(createdReplacement.acceptedCaptureCount, 0);
    const partialUser = await User_1.default.create({ email: "face-avatar-partial@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
    const partial = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(partialUser._id), avatar: "https://example.test/avatar-partial-a.jpg" });
    await (0, faceVerificationSession_service_1.acceptFaceVerificationCapture)({ userId: String(partialUser._id), sessionReference: partial.sessionReference, challengeIndex: "0", file: file(0) });
    await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(partialUser._id), avatar: "https://example.test/avatar-partial-b.jpg" });
    const invalidatedPartial = await faceVerificationSession_model_1.FaceVerificationSession.findById(partial._id);
    strict_1.default.equal(invalidatedPartial?.status, "INVALIDATED");
    strict_1.default.equal(invalidatedPartial?.isCurrent, false);
    strict_1.default.ok(invalidatedPartial?.cleanupAfter);
    const completeUser = await User_1.default.create({ email: "face-avatar-complete@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
    const complete = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(completeUser._id), avatar: "https://example.test/avatar-complete-a.jpg" });
    for (let index = 0; index < 5; index += 1)
        await (0, faceVerificationSession_service_1.acceptFaceVerificationCapture)({ userId: String(completeUser._id), sessionReference: complete.sessionReference, challengeIndex: String(index), file: file(index) });
    const completeReplacement = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(completeUser._id), avatar: "https://example.test/avatar-complete-b.jpg" });
    const invalidatedComplete = await faceVerificationSession_model_1.FaceVerificationSession.findById(complete._id);
    strict_1.default.equal(invalidatedComplete?.status, "INVALIDATED");
    strict_1.default.equal(invalidatedComplete?.isCurrent, false);
    strict_1.default.ok(invalidatedComplete?.cleanupAfter);
    strict_1.default.equal(await faceVerificationEvidence_model_1.FaceVerificationEvidence.countDocuments({ sessionId: complete._id, status: "DELETE_PENDING" }), 5);
    strict_1.default.equal(completeReplacement.acceptedCaptureCount, 0);
});
(0, node_test_1.test)("matching completed sessions replay while expired, terminal, and version-mismatched sessions are replaced", async () => {
    const user = await User_1.default.create({ email: "face-replay-terminal@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
    const avatar = "https://example.test/avatar-replay.jpg";
    const complete = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(user._id), avatar });
    for (let index = 0; index < 5; index += 1)
        await (0, faceVerificationSession_service_1.acceptFaceVerificationCapture)({ userId: String(user._id), sessionReference: complete.sessionReference, challengeIndex: String(index), file: file(index) });
    const replay = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(user._id), avatar });
    strict_1.default.equal(String(replay._id), String(complete._id));
    strict_1.default.equal(await faceVerificationEvidence_model_1.FaceVerificationEvidence.countDocuments({ sessionId: complete._id, status: "STORED" }), 5);
    const expiredUser = await User_1.default.create({ email: "face-immediate-expiry@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
    const expired = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(expiredUser._id), avatar: "https://example.test/avatar-expired-now.jpg" });
    await faceVerificationSession_model_1.FaceVerificationSession.updateOne({ _id: expired._id }, { $set: { expiresAt: new Date(Date.now() - 1) } });
    const afterExpiry = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(expiredUser._id), avatar: "https://example.test/avatar-expired-now.jpg" });
    strict_1.default.notEqual(String(afterExpiry._id), String(expired._id));
    strict_1.default.equal((await faceVerificationSession_model_1.FaceVerificationSession.findById(expired._id))?.status, "EXPIRED");
    const versionUser = await User_1.default.create({ email: "face-version-mismatch@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
    const versioned = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(versionUser._id), avatar: "https://example.test/avatar-version.jpg" });
    await userProfile_model_1.UserProfile.updateOne({ _id: versioned.profileId }, { $set: { verificationSubmissionVersion: 1 } });
    const versionReplacement = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(versionUser._id), avatar: "https://example.test/avatar-version.jpg" });
    strict_1.default.equal((await faceVerificationSession_model_1.FaceVerificationSession.findById(versioned._id))?.status, "INVALIDATED");
    strict_1.default.equal(versionReplacement.profileSubmissionVersion, 2);
    const cancelledUser = await User_1.default.create({ email: "face-cancelled-restart@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
    const cancelled = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(cancelledUser._id), avatar: "https://example.test/avatar-cancelled.jpg" });
    await (0, faceVerificationSession_service_2.cancelFaceVerificationSession)({ userId: String(cancelledUser._id), sessionReference: cancelled.sessionReference });
    const afterCancel = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(cancelledUser._id), avatar: "https://example.test/avatar-cancelled.jpg" });
    strict_1.default.notEqual(String(afterCancel._id), String(cancelled._id));
});
(0, node_test_1.test)("concurrent starts converge on one compatible current session", async () => {
    const user = await User_1.default.create({ email: "face-concurrent-start@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
    const avatar = "https://example.test/avatar-concurrent.jpg";
    const prior = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(user._id), avatar });
    await (0, faceVerificationSession_service_2.cancelFaceVerificationSession)({ userId: String(user._id), sessionReference: prior.sessionReference });
    const [first, second] = await Promise.all([(0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(user._id), avatar }), (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(user._id), avatar })]);
    strict_1.default.equal(String(first._id), String(second._id));
    strict_1.default.equal(first.avatarFingerprint, second.avatarFingerprint);
    strict_1.default.equal(first.profileSubmissionVersion, second.profileSubmissionVersion);
    strict_1.default.equal(await faceVerificationSession_model_1.FaceVerificationSession.countDocuments({ profileId: first.profileId, isCurrent: true }), 1);
});
(0, node_test_1.test)("duplicate-key recovery retires an incompatible winner instead of returning incorrect authority", async () => {
    const user = await User_1.default.create({ email: "face-duplicate-recovery@test.local", password: "test-password", status: "active", governanceState: "ACTIVE" });
    const avatar = "https://example.test/avatar-duplicate.jpg";
    const draft = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(user._id), avatar });
    await (0, faceVerificationSession_service_2.cancelFaceVerificationSession)({ userId: String(user._id), sessionReference: draft.sessionReference });
    const originalCreate = faceVerificationSession_repository_1.faceVerificationSessionRepository.create.bind(faceVerificationSession_repository_1.faceVerificationSessionRepository);
    let injected = false;
    faceVerificationSession_repository_1.faceVerificationSessionRepository.create = async (input) => {
        if (!injected) {
            injected = true;
            await originalCreate({ ...input, avatarFingerprint: (0, faceVerificationSession_service_1.fingerprintAvatarReference)("https://example.test/avatar-other.jpg") });
            const duplicate = Object.assign(new Error("controlled duplicate"), { code: 11000 });
            throw duplicate;
        }
        return originalCreate(input);
    };
    try {
        const recovered = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(user._id), avatar });
        strict_1.default.equal(recovered.avatarFingerprint, (0, faceVerificationSession_service_1.fingerprintAvatarReference)(avatar));
        strict_1.default.equal(recovered.profileSubmissionVersion, 1);
        strict_1.default.equal(await faceVerificationSession_model_1.FaceVerificationSession.countDocuments({ profileId: draft.profileId, isCurrent: true }), 1);
        strict_1.default.equal(await faceVerificationSession_model_1.FaceVerificationSession.countDocuments({ profileId: draft.profileId, avatarFingerprint: (0, faceVerificationSession_service_1.fingerprintAvatarReference)("https://example.test/avatar-other.jpg"), isCurrent: false, status: "INVALIDATED" }), 1);
    }
    finally {
        faceVerificationSession_repository_1.faceVerificationSessionRepository.create = originalCreate;
    }
});
