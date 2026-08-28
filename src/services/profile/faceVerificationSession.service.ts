import crypto from "node:crypto";
import { Types } from "mongoose";
import { ulid } from "ulid";
import { AppError } from "../../utils/AppError";
import { UserProfile, UserProfileDocument } from "../../models/userProfile.model";
import { FaceVerificationChallenge, FaceVerificationSessionDocument } from "../../models/faceVerificationSession.model";
import { faceVerificationSessionRepository } from "../../repositories/faceVerificationSession.repository";
import { faceVerificationEvidenceRepository } from "../../repositories/faceVerificationEvidence.repository";
import { storeFaceVerificationEvidence } from "./faceVerificationEvidenceStorage.service";
import { FACE_VERIFICATION_SESSION_TTL_MS, FACE_VERIFICATION_SHORT_CLEANUP_MS } from "./faceVerification.constants";

const challengePool: FaceVerificationChallenge[] = ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "LOOK_DOWN", "BLINK"];
const duplicateKey = (error: unknown) => typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === 11000;
const cleanAt = () => new Date(Date.now() + FACE_VERIFICATION_SHORT_CLEANUP_MS);
export const fingerprintAvatarReference = (avatar: string) => crypto.createHash("sha256").update(avatar).digest("hex");

const challengeSequence = (): FaceVerificationChallenge[] => {
  const remaining = [...challengePool]; const selected: FaceVerificationChallenge[] = [];
  while (selected.length < 5) selected.push(remaining.splice(crypto.randomInt(remaining.length), 1)[0]);
  return selected;
};

const ensureDraftProfile = async (userId: Types.ObjectId): Promise<UserProfileDocument> => {
  let profile = await UserProfile.findOne({ userId });
  if (profile) return profile;
  // This is a draft only. It is deliberately incomplete and never creates a request/job.
  profile = await UserProfile.create({ userId, username: `draft-${ulid().toLowerCase()}`, bio: "", interests: [], avatar: "", cover: "", profilePhotos: [], profileStatus: "incomplete", verificationSubmissionVersion: 0 });
  return profile;
};

const expireIfNeeded = async (session: FaceVerificationSessionDocument) => {
  if (["CREATED", "CAPTURING"].includes(session.status) && session.expiresAt.getTime() <= Date.now()) {
    const transitioned = await faceVerificationSessionRepository.expire(session._id, new Date(), cleanAt());
    if (transitioned) {
      await faceVerificationEvidenceRepository.setCleanupForSession(transitioned._id, transitioned.cleanupAfter!);
      return transitioned;
    }
    return (await faceVerificationSessionRepository.findById(session._id)) ?? session;
  }
  return session;
};

const hasValidChallengeSequence = (session: FaceVerificationSessionDocument) => session.requiredCaptureCount === 5 && session.challenges.length === 5 && new Set(session.challenges).size === 5;
const isSameSubmission = (session: FaceVerificationSessionDocument, input: { userId: Types.ObjectId; avatarFingerprint: string; targetVersion: number }) =>
  session.isCurrent && String(session.userId) === String(input.userId) && session.avatarFingerprint === input.avatarFingerprint && session.profileSubmissionVersion === input.targetVersion;
const isReusableCurrentSession = (session: FaceVerificationSessionDocument, input: { userId: Types.ObjectId; avatarFingerprint: string; targetVersion: number }) => {
  if (!isSameSubmission(session, input) || !hasValidChallengeSequence(session)) return false;
  if (["CREATED", "CAPTURING"].includes(session.status) && session.expiresAt.getTime() <= Date.now()) return false;
  if (session.status === "CREATED") return session.acceptedCaptureCount === 0;
  if (session.status === "CAPTURE_COMPLETE") return session.acceptedCaptureCount === session.requiredCaptureCount;
  return false;
};
const retireCurrentSession = async (session: FaceVerificationSessionDocument, input: { status: "CANCELLED" | "INVALIDATED"; invalidationCode?: string }) => {
  const retired = await faceVerificationSessionRepository.retireCurrent({ sessionId: session._id, status: input.status, invalidationCode: input.invalidationCode, cleanupAfter: cleanAt() });
  if (retired) await faceVerificationEvidenceRepository.setCleanupForSession(retired._id, retired.cleanupAfter!);
  return retired;
};

export const startFaceVerificationSession = async (input: { userId: string; avatar: unknown }) => {
  if (!Types.ObjectId.isValid(input.userId)) throw new AppError("Invalid authenticated user", 401);
  if (typeof input.avatar !== "string" || !input.avatar.trim() || input.avatar.trim().length > 2048) throw new AppError("A valid avatar reference is required", 400);
  const userId = new Types.ObjectId(input.userId); const profile = await ensureDraftProfile(userId);
  if (profile.profileStatus === "pending_verification") throw new AppError("Profile is already pending verification", 409);
  const avatarFingerprint = fingerprintAvatarReference(input.avatar.trim());
  const targetVersion = Math.max(1, (profile.verificationSubmissionVersion ?? 0) + 1);
  const expected = { userId, avatarFingerprint, targetVersion };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await faceVerificationSessionRepository.findCurrent(profile._id);
    if (current) {
      const reconciled = await expireIfNeeded(current);
      if (!reconciled.isCurrent) continue;
      if (isReusableCurrentSession(reconciled, expected)) return reconciled;
      const avatarOrVersionMismatch = !isSameSubmission(reconciled, expected);
      const partialAttempt = reconciled.status === "CAPTURING" || reconciled.acceptedCaptureCount > 0;
      await retireCurrentSession(reconciled, avatarOrVersionMismatch || !partialAttempt
        ? { status: "INVALIDATED", invalidationCode: avatarOrVersionMismatch ? "SUBMISSION_MISMATCH" : "SESSION_INCONSISTENT" }
        : { status: "CANCELLED" });
      continue;
    }
    try {
      return await faceVerificationSessionRepository.create({ sessionReference: `FACE_SESSION_${ulid()}`, userId, profileId: profile._id, profileSubmissionVersion: targetVersion, avatarFingerprint, challenges: challengeSequence(), expiresAt: new Date(Date.now() + FACE_VERIFICATION_SESSION_TTL_MS) });
    } catch (error) {
      if (!duplicateKey(error)) throw error;
      const winner = await faceVerificationSessionRepository.findCurrent(profile._id);
      if (winner && isReusableCurrentSession(winner, expected)) return winner;
    }
  }
  throw new AppError("Unable to start a compatible face verification session. Please try again.", 409);
};

export const getOwnedFaceVerificationSession = async (input: { userId: string; sessionReference: string }) => {
  if (!Types.ObjectId.isValid(input.userId)) throw new AppError("Unauthorized", 401);
  const session = await faceVerificationSessionRepository.findOwned(input.sessionReference, new Types.ObjectId(input.userId));
  if (!session) throw new AppError("Face verification session not found", 404);
  return expireIfNeeded(session);
};

export const cancelFaceVerificationSession = async (input: { userId: string; sessionReference: string }) => {
  const session = await getOwnedFaceVerificationSession(input);
  if (["CANCELLED", "EXPIRED", "INVALIDATED"].includes(session.status)) return session;
  if (session.status === "CAPTURE_COMPLETE") throw new AppError("A completed face verification session cannot be cancelled", 409);
  session.status = "CANCELLED"; session.isCurrent = false; session.cancelledAt = new Date(); session.cleanupAfter = cleanAt(); await session.save();
  await faceVerificationEvidenceRepository.setCleanupForSession(session._id, session.cleanupAfter);
  return session;
};

export const acceptFaceVerificationCapture = async (input: { userId: string; sessionReference: string; challengeIndex: unknown; file: Express.Multer.File }) => {
  const index = typeof input.challengeIndex === "string" && /^\d+$/.test(input.challengeIndex) ? Number(input.challengeIndex) : -1;
  if (!Number.isInteger(index) || index < 0 || index > 4) throw new AppError("Invalid face verification challenge index", 400);
  const session = await getOwnedFaceVerificationSession(input);
  if (!session.isCurrent || !["CREATED", "CAPTURING", "CAPTURE_COMPLETE"].includes(session.status)) throw new AppError("Face verification session is not accepting captures", 409);
  const existing = await faceVerificationEvidenceRepository.findSlot(session._id, index);
  if (existing?.status === "STORED") return { session, evidence: existing, replayed: true };
  if (!["CREATED", "CAPTURING"].includes(session.status) || !session.isCurrent) throw new AppError("Face verification session is not accepting captures", 409);
  const challenge = session.challenges[index];
  if (!challenge) throw new AppError("Challenge does not belong to this session", 400);
  if (existing) throw new AppError("This challenge capture is already being processed", 409);
  const evidenceReference = `FACE_EVIDENCE_${ulid()}`;
  const publicId = `sthn/verification/face-evidence/${session.sessionReference}/${index}-${evidenceReference}`;
  let evidence;
  try { evidence = await faceVerificationEvidenceRepository.createReservation({ evidenceReference, sessionId: session._id, userId: session.userId, profileId: session.profileId, challengeIndex: index, challenge, cloudinaryPublicId: publicId }); }
  catch (error) { if (duplicateKey(error)) { const replay = await faceVerificationEvidenceRepository.findSlot(session._id, index); if (replay?.status === "STORED") return { session, evidence: replay, replayed: true }; } throw error; }
  const stored = await storeFaceVerificationEvidence({ buffer: input.file.buffer, publicId });
  const finalized = await faceVerificationEvidenceRepository.finalizeStored(evidence._id, { mimeType: stored.mimeType, bytes: stored.bytes, format: stored.format, captureReceivedAt: new Date() });
  if (!finalized) throw new AppError("Face evidence could not be finalized; it will be cleaned up", 500);
  const count = await faceVerificationEvidenceRepository.countStored(session._id);
  session.acceptedCaptureCount = count;
  if (count === 5) { session.status = "CAPTURE_COMPLETE"; session.captureCompletedAt = new Date(); }
  else if (session.status === "CREATED") session.status = "CAPTURING";
  await session.save();
  return { session, evidence: finalized, replayed: false };
};

export const bindCompletedFaceSessionToVerificationRequest = async (input: { profile: UserProfileDocument; requestId: Types.ObjectId }) => {
  const session = await faceVerificationSessionRepository.bindCompletedToRequest({ profileId: input.profile._id, requestId: input.requestId, version: input.profile.verificationSubmissionVersion, avatarFingerprint: fingerprintAvatarReference(input.profile.avatar) });
  if (session) await faceVerificationEvidenceRepository.bindSessionEvidence(session._id, input.requestId);
  return session;
};

/** Stage 3E guard: only the initial incomplete-draft submission is capture-gated. */
export const requireCompletedFaceSessionForInitialSubmission = async (input: { userId: string; avatar: string }) => {
  if (!Types.ObjectId.isValid(input.userId)) throw new AppError("Unauthorized", 401);
  const userId = new Types.ObjectId(input.userId);
  const profile = await UserProfile.findOne({ userId });
  if (!profile || profile.profileStatus !== "incomplete") {
    throw new AppError("Complete live face verification for the current avatar before submitting.", 409);
  }
  const expectedVersion = Math.max(1, (profile.verificationSubmissionVersion ?? 0) + 1);
  const session = await faceVerificationSessionRepository.findCurrentCompletedForInitialSubmission({ profileId: profile._id, userId, version: expectedVersion, avatarFingerprint: fingerprintAvatarReference(input.avatar) });
  if (!session) throw new AppError("Complete live face verification for the current avatar before submitting.", 409);
  return session;
};

/**
 * The rejected-profile path creates a new submission version.  It must have
 * the same exact, completed capture authority as first-time onboarding before
 * the profile is allowed to become pending again.
 */
export const requireCompletedFaceSessionForRejectedResubmission = async (input: { userId: string; avatar: string }) => {
  if (!Types.ObjectId.isValid(input.userId)) throw new AppError("Unauthorized", 401);
  const userId = new Types.ObjectId(input.userId);
  const profile = await UserProfile.findOne({ userId });
  if (!profile || profile.profileStatus !== "rejected") {
    throw new AppError("A rejected profile is required for verification resubmission.", 409);
  }
  const expectedVersion = (profile.verificationSubmissionVersion ?? 0) + 1;
  const session = await faceVerificationSessionRepository.findCurrentCompletedForInitialSubmission({
    profileId: profile._id,
    userId,
    version: expectedVersion,
    avatarFingerprint: fingerprintAvatarReference(input.avatar),
  });
  if (!session || session.acceptedCaptureCount !== 5) {
    throw new AppError("Complete fresh live face verification for the current avatar before resubmitting.", 409);
  }
  const storedCaptureCount = await faceVerificationEvidenceRepository.countStored(session._id);
  if (storedCaptureCount !== 5) {
    throw new AppError("Complete fresh live face verification for the current avatar before resubmitting.", 409);
  }
  return session;
};

export const invalidateFaceSessionsForAvatar = async (profile: UserProfileDocument) => {
  if (!profile.avatar?.trim()) return;
  const cleanupAfter = cleanAt();
  const invalidated = await faceVerificationSessionRepository.invalidateCompletedForAvatar(profile._id, fingerprintAvatarReference(profile.avatar), cleanupAfter);
  if (invalidated) await faceVerificationEvidenceRepository.setCleanupForSession(invalidated._id, cleanupAfter);
};

export const expireFaceVerificationSessions = async (now = new Date()) => {
  const cleanupAfter = new Date(now.getTime() + FACE_VERIFICATION_SHORT_CLEANUP_MS);
  const candidates = await faceVerificationSessionRepository.listExpiredCurrent(now);
  let expired = 0;
  for (const candidate of candidates) {
    const transitioned = await faceVerificationSessionRepository.expire(candidate._id, now, cleanupAfter);
    if (!transitioned) continue;
    await faceVerificationEvidenceRepository.setCleanupForSession(transitioned._id, cleanupAfter);
    expired += 1;
  }
  return { expired };
};
export const toFaceVerificationSessionDto = (session: FaceVerificationSessionDocument) => ({ sessionReference: session.sessionReference, status: session.status, challenges: session.challenges, requiredCaptureCount: session.requiredCaptureCount, acceptedCaptureCount: session.acceptedCaptureCount, expiresAt: session.expiresAt, captureComplete: session.status === "CAPTURE_COMPLETE" });
