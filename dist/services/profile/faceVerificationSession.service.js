"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toFaceVerificationSessionDto = exports.expireFaceVerificationSessions = exports.invalidateFaceSessionsForAvatar = exports.requireCompletedFaceSessionForInitialSubmission = exports.bindCompletedFaceSessionToVerificationRequest = exports.acceptFaceVerificationCapture = exports.cancelFaceVerificationSession = exports.getOwnedFaceVerificationSession = exports.startFaceVerificationSession = exports.fingerprintAvatarReference = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const mongoose_1 = require("mongoose");
const ulid_1 = require("ulid");
const AppError_1 = require("../../utils/AppError");
const userProfile_model_1 = require("../../models/userProfile.model");
const faceVerificationSession_repository_1 = require("../../repositories/faceVerificationSession.repository");
const faceVerificationEvidence_repository_1 = require("../../repositories/faceVerificationEvidence.repository");
const faceVerificationEvidenceStorage_service_1 = require("./faceVerificationEvidenceStorage.service");
const faceVerification_constants_1 = require("./faceVerification.constants");
const challengePool = ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "LOOK_DOWN", "BLINK"];
const duplicateKey = (error) => typeof error === "object" && error !== null && "code" in error && error.code === 11000;
const cleanAt = () => new Date(Date.now() + faceVerification_constants_1.FACE_VERIFICATION_SHORT_CLEANUP_MS);
const fingerprintAvatarReference = (avatar) => node_crypto_1.default.createHash("sha256").update(avatar).digest("hex");
exports.fingerprintAvatarReference = fingerprintAvatarReference;
const challengeSequence = () => {
    const remaining = [...challengePool];
    const selected = [];
    while (selected.length < 5)
        selected.push(remaining.splice(node_crypto_1.default.randomInt(remaining.length), 1)[0]);
    return selected;
};
const ensureDraftProfile = async (userId) => {
    let profile = await userProfile_model_1.UserProfile.findOne({ userId });
    if (profile)
        return profile;
    // This is a draft only. It is deliberately incomplete and never creates a request/job.
    profile = await userProfile_model_1.UserProfile.create({ userId, username: `draft-${(0, ulid_1.ulid)().toLowerCase()}`, bio: "", interests: [], avatar: "", cover: "", profilePhotos: [], profileStatus: "incomplete", verificationSubmissionVersion: 0 });
    return profile;
};
const expireIfNeeded = async (session) => {
    if (["CREATED", "CAPTURING"].includes(session.status) && session.expiresAt.getTime() <= Date.now()) {
        const transitioned = await faceVerificationSession_repository_1.faceVerificationSessionRepository.expire(session._id, new Date(), cleanAt());
        if (transitioned) {
            await faceVerificationEvidence_repository_1.faceVerificationEvidenceRepository.setCleanupForSession(transitioned._id, transitioned.cleanupAfter);
            return transitioned;
        }
        return (await faceVerificationSession_repository_1.faceVerificationSessionRepository.findById(session._id)) ?? session;
    }
    return session;
};
const hasValidChallengeSequence = (session) => session.requiredCaptureCount === 5 && session.challenges.length === 5 && new Set(session.challenges).size === 5;
const isSameSubmission = (session, input) => session.isCurrent && String(session.userId) === String(input.userId) && session.avatarFingerprint === input.avatarFingerprint && session.profileSubmissionVersion === input.targetVersion;
const isReusableCurrentSession = (session, input) => {
    if (!isSameSubmission(session, input) || !hasValidChallengeSequence(session))
        return false;
    if (["CREATED", "CAPTURING"].includes(session.status) && session.expiresAt.getTime() <= Date.now())
        return false;
    if (session.status === "CREATED")
        return session.acceptedCaptureCount === 0;
    if (session.status === "CAPTURE_COMPLETE")
        return session.acceptedCaptureCount === session.requiredCaptureCount;
    return false;
};
const retireCurrentSession = async (session, input) => {
    const retired = await faceVerificationSession_repository_1.faceVerificationSessionRepository.retireCurrent({ sessionId: session._id, status: input.status, invalidationCode: input.invalidationCode, cleanupAfter: cleanAt() });
    if (retired)
        await faceVerificationEvidence_repository_1.faceVerificationEvidenceRepository.setCleanupForSession(retired._id, retired.cleanupAfter);
    return retired;
};
const startFaceVerificationSession = async (input) => {
    if (!mongoose_1.Types.ObjectId.isValid(input.userId))
        throw new AppError_1.AppError("Invalid authenticated user", 401);
    if (typeof input.avatar !== "string" || !input.avatar.trim() || input.avatar.trim().length > 2048)
        throw new AppError_1.AppError("A valid avatar reference is required", 400);
    const userId = new mongoose_1.Types.ObjectId(input.userId);
    const profile = await ensureDraftProfile(userId);
    if (profile.profileStatus === "pending_verification")
        throw new AppError_1.AppError("Profile is already pending verification", 409);
    const avatarFingerprint = (0, exports.fingerprintAvatarReference)(input.avatar.trim());
    const targetVersion = Math.max(1, (profile.verificationSubmissionVersion ?? 0) + 1);
    const expected = { userId, avatarFingerprint, targetVersion };
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const current = await faceVerificationSession_repository_1.faceVerificationSessionRepository.findCurrent(profile._id);
        if (current) {
            const reconciled = await expireIfNeeded(current);
            if (!reconciled.isCurrent)
                continue;
            if (isReusableCurrentSession(reconciled, expected))
                return reconciled;
            const avatarOrVersionMismatch = !isSameSubmission(reconciled, expected);
            const partialAttempt = reconciled.status === "CAPTURING" || reconciled.acceptedCaptureCount > 0;
            await retireCurrentSession(reconciled, avatarOrVersionMismatch || !partialAttempt
                ? { status: "INVALIDATED", invalidationCode: avatarOrVersionMismatch ? "SUBMISSION_MISMATCH" : "SESSION_INCONSISTENT" }
                : { status: "CANCELLED" });
            continue;
        }
        try {
            return await faceVerificationSession_repository_1.faceVerificationSessionRepository.create({ sessionReference: `FACE_SESSION_${(0, ulid_1.ulid)()}`, userId, profileId: profile._id, profileSubmissionVersion: targetVersion, avatarFingerprint, challenges: challengeSequence(), expiresAt: new Date(Date.now() + faceVerification_constants_1.FACE_VERIFICATION_SESSION_TTL_MS) });
        }
        catch (error) {
            if (!duplicateKey(error))
                throw error;
            const winner = await faceVerificationSession_repository_1.faceVerificationSessionRepository.findCurrent(profile._id);
            if (winner && isReusableCurrentSession(winner, expected))
                return winner;
        }
    }
    throw new AppError_1.AppError("Unable to start a compatible face verification session. Please try again.", 409);
};
exports.startFaceVerificationSession = startFaceVerificationSession;
const getOwnedFaceVerificationSession = async (input) => {
    if (!mongoose_1.Types.ObjectId.isValid(input.userId))
        throw new AppError_1.AppError("Unauthorized", 401);
    const session = await faceVerificationSession_repository_1.faceVerificationSessionRepository.findOwned(input.sessionReference, new mongoose_1.Types.ObjectId(input.userId));
    if (!session)
        throw new AppError_1.AppError("Face verification session not found", 404);
    return expireIfNeeded(session);
};
exports.getOwnedFaceVerificationSession = getOwnedFaceVerificationSession;
const cancelFaceVerificationSession = async (input) => {
    const session = await (0, exports.getOwnedFaceVerificationSession)(input);
    if (["CANCELLED", "EXPIRED", "INVALIDATED"].includes(session.status))
        return session;
    if (session.status === "CAPTURE_COMPLETE")
        throw new AppError_1.AppError("A completed face verification session cannot be cancelled", 409);
    session.status = "CANCELLED";
    session.isCurrent = false;
    session.cancelledAt = new Date();
    session.cleanupAfter = cleanAt();
    await session.save();
    await faceVerificationEvidence_repository_1.faceVerificationEvidenceRepository.setCleanupForSession(session._id, session.cleanupAfter);
    return session;
};
exports.cancelFaceVerificationSession = cancelFaceVerificationSession;
const acceptFaceVerificationCapture = async (input) => {
    const index = typeof input.challengeIndex === "string" && /^\d+$/.test(input.challengeIndex) ? Number(input.challengeIndex) : -1;
    if (!Number.isInteger(index) || index < 0 || index > 4)
        throw new AppError_1.AppError("Invalid face verification challenge index", 400);
    const session = await (0, exports.getOwnedFaceVerificationSession)(input);
    const existing = await faceVerificationEvidence_repository_1.faceVerificationEvidenceRepository.findSlot(session._id, index);
    if (existing?.status === "STORED")
        return { session, evidence: existing, replayed: true };
    if (!["CREATED", "CAPTURING"].includes(session.status) || !session.isCurrent)
        throw new AppError_1.AppError("Face verification session is not accepting captures", 409);
    const challenge = session.challenges[index];
    if (!challenge)
        throw new AppError_1.AppError("Challenge does not belong to this session", 400);
    if (existing)
        throw new AppError_1.AppError("This challenge capture is already being processed", 409);
    const evidenceReference = `FACE_EVIDENCE_${(0, ulid_1.ulid)()}`;
    const publicId = `sthn/verification/face-evidence/${session.sessionReference}/${index}-${evidenceReference}`;
    let evidence;
    try {
        evidence = await faceVerificationEvidence_repository_1.faceVerificationEvidenceRepository.createReservation({ evidenceReference, sessionId: session._id, userId: session.userId, profileId: session.profileId, challengeIndex: index, challenge, cloudinaryPublicId: publicId });
    }
    catch (error) {
        if (duplicateKey(error)) {
            const replay = await faceVerificationEvidence_repository_1.faceVerificationEvidenceRepository.findSlot(session._id, index);
            if (replay?.status === "STORED")
                return { session, evidence: replay, replayed: true };
        }
        throw error;
    }
    const stored = await (0, faceVerificationEvidenceStorage_service_1.storeFaceVerificationEvidence)({ buffer: input.file.buffer, publicId });
    const finalized = await faceVerificationEvidence_repository_1.faceVerificationEvidenceRepository.finalizeStored(evidence._id, { mimeType: stored.mimeType, bytes: stored.bytes, format: stored.format, captureReceivedAt: new Date() });
    if (!finalized)
        throw new AppError_1.AppError("Face evidence could not be finalized; it will be cleaned up", 500);
    const count = await faceVerificationEvidence_repository_1.faceVerificationEvidenceRepository.countStored(session._id);
    session.acceptedCaptureCount = count;
    if (count === 5) {
        session.status = "CAPTURE_COMPLETE";
        session.captureCompletedAt = new Date();
    }
    else if (session.status === "CREATED")
        session.status = "CAPTURING";
    await session.save();
    return { session, evidence: finalized, replayed: false };
};
exports.acceptFaceVerificationCapture = acceptFaceVerificationCapture;
const bindCompletedFaceSessionToVerificationRequest = async (input) => {
    const session = await faceVerificationSession_repository_1.faceVerificationSessionRepository.bindCompletedToRequest({ profileId: input.profile._id, requestId: input.requestId, version: input.profile.verificationSubmissionVersion, avatarFingerprint: (0, exports.fingerprintAvatarReference)(input.profile.avatar) });
    if (session)
        await faceVerificationEvidence_repository_1.faceVerificationEvidenceRepository.bindSessionEvidence(session._id, input.requestId);
    return session;
};
exports.bindCompletedFaceSessionToVerificationRequest = bindCompletedFaceSessionToVerificationRequest;
/** Stage 3E guard: only the initial incomplete-draft submission is capture-gated. */
const requireCompletedFaceSessionForInitialSubmission = async (input) => {
    if (!mongoose_1.Types.ObjectId.isValid(input.userId))
        throw new AppError_1.AppError("Unauthorized", 401);
    const userId = new mongoose_1.Types.ObjectId(input.userId);
    const profile = await userProfile_model_1.UserProfile.findOne({ userId });
    if (!profile || profile.profileStatus !== "incomplete") {
        throw new AppError_1.AppError("Complete live face verification for the current avatar before submitting.", 409);
    }
    const expectedVersion = Math.max(1, (profile.verificationSubmissionVersion ?? 0) + 1);
    const session = await faceVerificationSession_repository_1.faceVerificationSessionRepository.findCurrentCompletedForInitialSubmission({ profileId: profile._id, userId, version: expectedVersion, avatarFingerprint: (0, exports.fingerprintAvatarReference)(input.avatar) });
    if (!session)
        throw new AppError_1.AppError("Complete live face verification for the current avatar before submitting.", 409);
    return session;
};
exports.requireCompletedFaceSessionForInitialSubmission = requireCompletedFaceSessionForInitialSubmission;
const invalidateFaceSessionsForAvatar = async (profile) => {
    if (!profile.avatar?.trim())
        return;
    const cleanupAfter = cleanAt();
    const invalidated = await faceVerificationSession_repository_1.faceVerificationSessionRepository.invalidateCompletedForAvatar(profile._id, (0, exports.fingerprintAvatarReference)(profile.avatar), cleanupAfter);
    if (invalidated)
        await faceVerificationEvidence_repository_1.faceVerificationEvidenceRepository.setCleanupForSession(invalidated._id, cleanupAfter);
};
exports.invalidateFaceSessionsForAvatar = invalidateFaceSessionsForAvatar;
const expireFaceVerificationSessions = async (now = new Date()) => {
    const cleanupAfter = new Date(now.getTime() + faceVerification_constants_1.FACE_VERIFICATION_SHORT_CLEANUP_MS);
    const candidates = await faceVerificationSession_repository_1.faceVerificationSessionRepository.listExpiredCurrent(now);
    let expired = 0;
    for (const candidate of candidates) {
        const transitioned = await faceVerificationSession_repository_1.faceVerificationSessionRepository.expire(candidate._id, now, cleanupAfter);
        if (!transitioned)
            continue;
        await faceVerificationEvidence_repository_1.faceVerificationEvidenceRepository.setCleanupForSession(transitioned._id, cleanupAfter);
        expired += 1;
    }
    return { expired };
};
exports.expireFaceVerificationSessions = expireFaceVerificationSessions;
const toFaceVerificationSessionDto = (session) => ({ sessionReference: session.sessionReference, status: session.status, challenges: session.challenges, requiredCaptureCount: session.requiredCaptureCount, acceptedCaptureCount: session.acceptedCaptureCount, expiresAt: session.expiresAt, captureComplete: session.status === "CAPTURE_COMPLETE" });
exports.toFaceVerificationSessionDto = toFaceVerificationSessionDto;
