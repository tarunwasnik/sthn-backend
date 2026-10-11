import crypto from "node:crypto";
import { Types } from "mongoose";
import { ulid } from "ulid";
import { AppError } from "../../utils/AppError";
import { UserProfile, UserProfileDocument } from "../../models/userProfile.model";
import { FaceVerificationAvatarCandidate, FaceVerificationChallenge, FaceVerificationSessionDocument } from "../../models/faceVerificationSession.model";
import { faceVerificationAvatarCandidateMatches, faceVerificationSessionRepository } from "../../repositories/faceVerificationSession.repository";
import { faceVerificationEvidenceRepository } from "../../repositories/faceVerificationEvidence.repository";
import { storeFaceVerificationEvidence } from "./faceVerificationEvidenceStorage.service";
import { FACE_VERIFICATION_SESSION_TTL_MS, FACE_VERIFICATION_SHORT_CLEANUP_MS } from "./faceVerification.constants";
import { requireBiometricReferenceAvatar, requireBiometricReferenceAvatarFromReader } from "./profileVerificationReferenceAvatarValidation.service";
import { fingerprintProfileMediaReference } from "./profileVerificationSubmittedMedia.service";
import { imageAdmissionService } from "../imageModeration/imageAdmission.service";
import { readBoundProfileVerificationAvatar, readTrustedAvatarAdmissionCandidate } from "./profileVerificationAvatarRead.service";
import { ProfileMediaClaim, parseProfileMediaClaim } from "./profileImageAdmissionContract";

const challengePool: FaceVerificationChallenge[] = ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "LOOK_DOWN", "BLINK"];
const duplicateKey = (error: unknown) => typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === 11000;
const cleanAt = () => new Date(Date.now() + FACE_VERIFICATION_SHORT_CLEANUP_MS);
/** Compatibility alias for the avatar authority used by existing face sessions. */
export const fingerprintAvatarReference = (avatar: string) => fingerprintProfileMediaReference(avatar);

const challengeSequence = (): FaceVerificationChallenge[] => {
  const remaining = [...challengePool]; const selected: FaceVerificationChallenge[] = [];
  while (selected.length < 5) selected.push(remaining.splice(crypto.randomInt(remaining.length), 1)[0]);
  return selected;
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
type SessionAuthority = { userId: Types.ObjectId; avatarFingerprint: string; targetVersion: number; avatarCandidate?: FaceVerificationAvatarCandidate };
const isSameSubmission = (session: FaceVerificationSessionDocument, input: SessionAuthority) =>
  session.isCurrent && String(session.userId) === String(input.userId) && session.avatarFingerprint === input.avatarFingerprint && session.profileSubmissionVersion === input.targetVersion && faceVerificationAvatarCandidateMatches(session.avatarCandidate, input.avatarCandidate);
const isReusableCurrentSession = (session: FaceVerificationSessionDocument, input: SessionAuthority) => {
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

const createOrReuseCandidateSession = async (input: { userId: Types.ObjectId; profile: UserProfileDocument; avatarFingerprint: string; avatarCandidate: FaceVerificationAvatarCandidate; expiresAt: Date }) => {
  const targetVersion = Math.max(1, (input.profile.verificationSubmissionVersion ?? 0) + 1);
  const expected: SessionAuthority = { userId: input.userId, avatarFingerprint: input.avatarFingerprint, targetVersion, avatarCandidate: input.avatarCandidate };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await faceVerificationSessionRepository.findCurrent(input.profile._id);
    if (current) {
      const reconciled = await expireIfNeeded(current);
      if (!reconciled.isCurrent) continue;
      if (isReusableCurrentSession(reconciled, expected)) return reconciled;
      const candidateOrVersionMismatch = !isSameSubmission(reconciled, expected);
      const partialAttempt = reconciled.status === "CAPTURING" || reconciled.acceptedCaptureCount > 0;
      await retireCurrentSession(reconciled, candidateOrVersionMismatch || !partialAttempt
        ? { status: "INVALIDATED", invalidationCode: candidateOrVersionMismatch ? "SUBMISSION_MISMATCH" : "SESSION_INCONSISTENT" }
        : { status: "CANCELLED" });
      continue;
    }
    try {
      return await faceVerificationSessionRepository.create({ sessionReference: `FACE_SESSION_${ulid()}`, userId: input.userId, profileId: input.profile._id, profileSubmissionVersion: targetVersion, avatarFingerprint: input.avatarFingerprint, avatarCandidate: input.avatarCandidate, challenges: challengeSequence(), expiresAt: input.expiresAt });
    } catch (error) {
      if (!duplicateKey(error)) throw error;
      const winner = await faceVerificationSessionRepository.findCurrent(input.profile._id);
      if (winner && isReusableCurrentSession(winner, expected)) return winner;
    }
  }
  throw new AppError("Unable to start a compatible face verification session. Please try again.", 409);
};

export const startFaceVerificationSession = async (input: { userId: string; avatar?: unknown; candidateAvatar?: unknown }) => {
  if (!Types.ObjectId.isValid(input.userId)) throw new AppError("Invalid authenticated user", 401);
  if (input.avatar !== undefined && input.candidateAvatar !== undefined) throw new AppError("Provide either avatar or candidateAvatar, not both", 400);
  const userId = new Types.ObjectId(input.userId);
  const profile = await UserProfile.findOne({ userId });
  if (!profile) throw new AppError("Save your admission-backed profile draft before starting face verification", 409);
  if (profile.profileStatus === "pending_verification") throw new AppError("Profile is already pending verification", 409);
  if (profile.profileStatus === "rejected") {
    if (input.avatar !== undefined || input.candidateAvatar === undefined) throw new AppError("A rejected profile requires an avatar candidate claim", 400);
    let claim;
    try { claim = parseProfileMediaClaim(input.candidateAvatar, "candidateAvatar"); }
    catch { throw new AppError("Invalid candidateAvatar media claim", 400); }
    let avatarCandidate: FaceVerificationAvatarCandidate;
    let reader: () => Promise<Buffer>;
    if (claim.kind === "UNCHANGED") {
      if (!profile.avatar || claim.reference !== profile.avatar) throw new AppError("The unchanged avatar candidate does not match this profile", 409);
      const fingerprint = fingerprintAvatarReference(profile.avatar);
      avatarCandidate = { kind: "PROFILE_REFERENCE", trustedMediaReference: profile.avatar, fingerprint };
      reader = () => readBoundProfileVerificationAvatar({ profileId: String(profile._id), userId: String(userId), avatarFingerprint: fingerprint });
    } else {
      let resolved;
      try { resolved = await imageAdmissionService.resolveTrustedAvatarAdmissionCandidate({ admissionReference: claim.admissionReference, actorId: userId }); }
      catch { throw new AppError("Avatar image admission is not eligible for face verification", 409); }
      const fingerprint = fingerprintAvatarReference(resolved.trustedMediaReference);
      avatarCandidate = { kind: "ADMISSION", admissionId: resolved.admissionId, admissionReference: resolved.admissionReference, assetId: resolved.assetId, trustedMediaReference: resolved.trustedMediaReference, contentSha256: resolved.contentSha256, fingerprint, expiresAt: resolved.expiresAt };
      reader = () => readTrustedAvatarAdmissionCandidate(resolved);
    }
    await requireBiometricReferenceAvatarFromReader({ profileId: String(profile._id), userId: String(userId), avatarFingerprint: avatarCandidate.fingerprint }, reader);
    const normalExpiry = new Date(Date.now() + FACE_VERIFICATION_SESSION_TTL_MS);
    const expiresAt = avatarCandidate.kind === "ADMISSION" && avatarCandidate.expiresAt < normalExpiry ? avatarCandidate.expiresAt : normalExpiry;
    if (expiresAt.getTime() <= Date.now()) throw new AppError("Avatar image admission is no longer eligible for face verification", 409);
    return createOrReuseCandidateSession({ userId, profile, avatarFingerprint: avatarCandidate.fingerprint, avatarCandidate, expiresAt });
  }
  if (input.candidateAvatar !== undefined) throw new AppError("candidateAvatar is only supported for rejected profiles", 400);
  if (typeof input.avatar !== "string" || !input.avatar.trim() || input.avatar.trim().length > 2048) throw new AppError("A valid avatar reference is required", 400);
  const avatar = input.avatar.trim();
  if (!profile.avatar?.trim()) throw new AppError("Save an admission-backed profile avatar before starting face verification", 409);
  if (profile.avatar !== avatar) throw new AppError("Face verification avatar must match the persisted profile avatar", 409);
  const avatarFingerprint = fingerprintAvatarReference(avatar);
  await requireBiometricReferenceAvatar({ profileId: String(profile._id), userId: String(userId), avatarFingerprint });
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

export const bindCompletedFaceSessionToVerificationRequest = async (input: { profile: UserProfileDocument; requestId: Types.ObjectId; session?: import("mongoose").ClientSession; actorId?: Types.ObjectId; avatarCandidate?: FaceVerificationAvatarCandidate; previousAvatar?: string }) => {
  let candidateForBinding = input.avatarCandidate;
  if (input.avatarCandidate) {
    const candidate = input.avatarCandidate;
    const fingerprint = fingerprintAvatarReference(input.profile.avatar);
    if (!input.session?.inTransaction() || !input.actorId || candidate.fingerprint !== fingerprint || candidate.trustedMediaReference !== input.profile.avatar || (candidate.kind === "ADMISSION" && candidate.expiresAt.getTime() <= Date.now())) {
      throw new AppError("Completed face verification session is no longer eligible", 409);
    }
    if (candidate.kind === "PROFILE_REFERENCE") {
      if (!input.previousAvatar || input.previousAvatar !== input.profile.avatar) throw new AppError("Completed face verification session is no longer eligible", 409);
    } else {
      await imageAdmissionService.assertConsumedAvatarCandidateInSession({ session: input.session, actorId: input.actorId, profileId: input.profile._id, candidate });
    }
    let eligible = await faceVerificationSessionRepository.findCurrentCompletedForCandidate({
      profileId: input.profile._id,
      userId: input.actorId,
      version: input.profile.verificationSubmissionVersion,
      avatarFingerprint: fingerprint,
      avatarCandidate: candidate,
      session: input.session,
    });
    if (!eligible && candidate.kind === "PROFILE_REFERENCE") {
      eligible = await faceVerificationSessionRepository.findCurrentCompletedForInitialSubmission({ profileId: input.profile._id, userId: input.actorId, version: input.profile.verificationSubmissionVersion, avatarFingerprint: fingerprint, session: input.session });
      if (eligible?.avatarCandidate?.kind === "ADMISSION" || (eligible?.avatarCandidate?.kind === "PROFILE_REFERENCE" && !faceVerificationAvatarCandidateMatches(eligible.avatarCandidate, candidate))) eligible = null;
      if (eligible?.avatarCandidate === undefined) candidateForBinding = undefined;
    }
    if (!eligible || eligible.expiresAt.getTime() <= Date.now() || eligible.requiredCaptureCount !== 5 || eligible.acceptedCaptureCount !== 5 || eligible.challenges.length !== 5 || new Set(eligible.challenges).size !== 5 || await faceVerificationEvidenceRepository.countStored(eligible._id, input.session) !== 5) {
      throw new AppError("Completed face verification session is no longer eligible", 409);
    }
  }
  const bound = await faceVerificationSessionRepository.bindCompletedToRequest({ profileId: input.profile._id, requestId: input.requestId, version: input.profile.verificationSubmissionVersion, avatarFingerprint: fingerprintAvatarReference(input.profile.avatar), avatarCandidate: candidateForBinding, session: input.session });
  if (bound) await faceVerificationEvidenceRepository.bindSessionEvidence(bound._id, input.requestId, input.session);
  return bound;
};

/** Resolves a rejected resubmission avatar claim into server-only session authority. */
export const resolveRejectedResubmissionAvatarCandidate = async (input: { actorId: Types.ObjectId; profile: UserProfileDocument; claim: ProfileMediaClaim }) => {
  if (input.profile.profileStatus !== "rejected") throw new AppError("A rejected profile is required for verification resubmission.", 409);
  if (input.claim.kind === "UNCHANGED") {
    if (input.claim.reference !== input.profile.avatar) throw new AppError("Avatar unchanged reference is not valid for this profile", 400);
    const fingerprint = fingerprintAvatarReference(input.profile.avatar);
    return { avatar: input.profile.avatar, avatarCandidate: { kind: "PROFILE_REFERENCE", trustedMediaReference: input.profile.avatar, fingerprint } as FaceVerificationAvatarCandidate };
  }
  let resolved;
  try { resolved = await imageAdmissionService.resolveTrustedAvatarAdmissionCandidate({ admissionReference: input.claim.admissionReference, actorId: input.actorId }); }
  catch { throw new AppError("Avatar image admission is not eligible", 400); }
  const fingerprint = fingerprintAvatarReference(resolved.trustedMediaReference);
  return { avatar: resolved.trustedMediaReference, avatarCandidate: { kind: "ADMISSION", admissionId: resolved.admissionId, admissionReference: resolved.admissionReference, assetId: resolved.assetId, trustedMediaReference: resolved.trustedMediaReference, contentSha256: resolved.contentSha256, fingerprint, expiresAt: resolved.expiresAt } as FaceVerificationAvatarCandidate };
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
  await requireBiometricReferenceAvatar({ profileId: String(profile._id), userId: String(userId), avatarFingerprint: fingerprintAvatarReference(input.avatar) });
  return session;
};

/**
 * The rejected-profile path creates a new submission version.  It must have
 * the same exact, completed capture authority as first-time onboarding before
 * the profile is allowed to become pending again.
 */
/**
 * Pre-transaction eligibility only. D5 must repeat candidate/admission authority
 * checks after consumption and promotion inside the resubmission transaction.
 */
export const requireCompletedFaceSessionForRejectedResubmission = async (input: { userId: string; avatar: string; avatarCandidate?: FaceVerificationAvatarCandidate }) => {
  if (!Types.ObjectId.isValid(input.userId)) throw new AppError("Unauthorized", 401);
  const userId = new Types.ObjectId(input.userId);
  const profile = await UserProfile.findOne({ userId });
  if (!profile || profile.profileStatus !== "rejected") {
    throw new AppError("A rejected profile is required for verification resubmission.", 409);
  }
  const expectedVersion = (profile.verificationSubmissionVersion ?? 0) + 1;
  const fingerprint = fingerprintAvatarReference(input.avatar);
  let session: FaceVerificationSessionDocument | null;
  if (input.avatarCandidate) {
    const candidate = input.avatarCandidate;
    const profileReferenceCandidate = candidate.kind === "PROFILE_REFERENCE";
    if (candidate.fingerprint !== fingerprint
      || candidate.trustedMediaReference !== input.avatar
      || (profileReferenceCandidate && (!profile.avatar || input.avatar !== profile.avatar))) {
      throw new AppError("Complete fresh live face verification for the current avatar before resubmitting.", 409);
    }
    if (candidate.kind === "ADMISSION" && candidate.expiresAt.getTime() <= Date.now()) {
      throw new AppError("Complete fresh live face verification for the current avatar before resubmitting.", 409);
    }
    session = await faceVerificationSessionRepository.findCurrentCompletedForCandidate({
      profileId: profile._id,
      userId,
      version: expectedVersion,
      avatarFingerprint: fingerprint,
      avatarCandidate: candidate,
    });
    if (!session && candidate.kind === "PROFILE_REFERENCE") {
      session = await faceVerificationSessionRepository.findCurrentCompletedForInitialSubmission({
        profileId: profile._id,
        userId,
        version: expectedVersion,
        avatarFingerprint: fingerprint,
      });
      if (session?.avatarCandidate?.kind === "ADMISSION" || (session?.avatarCandidate?.kind === "PROFILE_REFERENCE" && !faceVerificationAvatarCandidateMatches(session.avatarCandidate, candidate))) session = null;
    }
  } else {
    // Explicit compatibility: historical metadata-free sessions and a
    // deterministic PROFILE_REFERENCE candidate for this exact persisted
    // avatar remain usable. Admission candidates can never downgrade.
    if (input.avatar !== profile.avatar) {
      throw new AppError("Complete fresh live face verification for the current avatar before resubmitting.", 409);
    }
    session = await faceVerificationSessionRepository.findCurrentCompletedForInitialSubmission({
      profileId: profile._id,
      userId,
      version: expectedVersion,
      avatarFingerprint: fingerprint,
    });
    if (session?.avatarCandidate?.kind === "ADMISSION"
      || (session?.avatarCandidate?.kind === "PROFILE_REFERENCE"
        && (session.avatarCandidate.trustedMediaReference !== input.avatar || session.avatarCandidate.fingerprint !== fingerprint))) session = null;
  }
  if (!session || session.expiresAt.getTime() <= Date.now() || session.requiredCaptureCount !== 5 || session.acceptedCaptureCount !== 5 || session.challenges.length !== 5 || new Set(session.challenges).size !== 5) {
    throw new AppError("Complete fresh live face verification for the current avatar before resubmitting.", 409);
  }
  const storedCaptureCount = await faceVerificationEvidenceRepository.countStored(session._id);
  if (storedCaptureCount !== 5) {
    throw new AppError("Complete fresh live face verification for the current avatar before resubmitting.", 409);
  }
  if (!input.avatarCandidate || input.avatarCandidate.kind === "PROFILE_REFERENCE") {
    await requireBiometricReferenceAvatar({ profileId: String(profile._id), userId: String(userId), avatarFingerprint: fingerprint });
  }
  return session;
};

export const invalidateFaceSessionsForAvatar = async (profile: UserProfileDocument, session?: import("mongoose").ClientSession) => {
  if (!profile.avatar?.trim()) return;
  const cleanupAfter = cleanAt();
  const invalidated = await faceVerificationSessionRepository.invalidateCompletedForAvatar(profile._id, fingerprintAvatarReference(profile.avatar), cleanupAfter, session);
  if (invalidated) await faceVerificationEvidenceRepository.setCleanupForSession(invalidated._id, cleanupAfter, session);
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
