import crypto from "node:crypto";
import mongoose, { ClientSession, Types } from "mongoose";
import { ulid } from "ulid";

import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";
import { CreatorApplication, CreatorApplicationDocument } from "../../models/creatorApplication.model";
import { FaceVerificationChallenge, FaceVerificationSession, FaceVerificationSessionDocument } from "../../models/faceVerificationSession.model";
import { AppError } from "../../utils/AppError";
import { Booking } from "../../models/booking.model";
import { faceVerificationEvidenceRepository } from "../../repositories/faceVerificationEvidence.repository";
import { faceVerificationSessionRepository } from "../../repositories/faceVerificationSession.repository";
import { profileVerificationJobRepository } from "../../repositories/profileVerificationJob.repository";
import { profileVerificationRequestRepository } from "../../repositories/profileVerificationRequest.repository";
import { FACE_VERIFICATION_SESSION_TTL_MS, FACE_VERIFICATION_SHORT_CLEANUP_MS } from "../profile/faceVerification.constants";
import { fingerprintProfileMediaReference } from "../profile/profileVerificationSubmittedMedia.service";
import { selectNewProfileVerificationPolicy } from "../profile/profileVerificationPolicy.service";
import { storeFaceVerificationEvidence } from "../profile/faceVerificationEvidenceStorage.service";
import { VerificationTarget } from "./creatorVerificationTarget";

const challenges: FaceVerificationChallenge[] = ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "LOOK_DOWN", "BLINK"];
const duplicateKey = (error: unknown) => typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000;
const cleanupAt = () => new Date(Date.now() + FACE_VERIFICATION_SHORT_CLEANUP_MS);
const randomizedChallenges = () => {
  const remaining = [...challenges]; const result: FaceVerificationChallenge[] = [];
  while (result.length < 5) result.push(remaining.splice(crypto.randomInt(remaining.length), 1)[0]);
  return result;
};

const ownedDraft = async (userId: string, session?: ClientSession) => {
  if (!Types.ObjectId.isValid(userId)) throw new AppError("Unauthorized", 401);
  const account = await User.findById(userId).session(session ?? null);
  const profile = await UserProfile.findOne({ userId }).select("profileStatus").session(session ?? null).lean();
  const application = await CreatorApplication.findOne({ userId }).session(session ?? null);
  if (!account || !application) throw new AppError("Creator application not found", 404);
  if (account.role !== "user" || account.status !== "active" || account.governanceState !== "ACTIVE" || application.applicationJourney !== "user_upgrade" || profile?.profileStatus !== "verified" || !["none", "rejected", "pending"].includes(account.creatorStatus)) throw new AppError("Account is not eligible for Creator verification", 403);
  if (application.status !== "draft" && application.status !== "submitted") throw new AppError("Creator application is not eligible for verification", 409);
  return { account, application };
};

const targetFor = (application: CreatorApplicationDocument): VerificationTarget => {
  if (!application.avatarUrl?.trim()) throw new AppError("Creator avatar is required before face verification", 409);
  if (!Number.isInteger(application.verificationRevision) || application.verificationRevision < 1) throw new AppError("Save the Creator draft before face verification", 409);
  return { targetType: "CREATOR_APPLICATION", targetId: application._id, ownerUserId: application.userId, verificationRevision: application.verificationRevision, avatarReference: application.avatarUrl, avatarFingerprint: fingerprintProfileMediaReference(application.avatarUrl) };
};

const expireIfNeeded = async (session: FaceVerificationSessionDocument) => {
  if (session.isCurrent && ["CREATED", "CAPTURING", "CAPTURE_COMPLETE"].includes(session.status) && !session.verificationRequestId && session.expiresAt <= new Date()) {
    const expired = await faceVerificationSessionRepository.expire(session._id, new Date(), cleanupAt());
    if (expired) await faceVerificationEvidenceRepository.setCleanupForSession(expired._id, expired.cleanupAfter!);
    return expired ?? session;
  }
  return session;
};

export const startCreatorVerificationSession = async (userId: string) => {
  const { application } = await ownedDraft(userId); const target = targetFor(application);
  const current = await faceVerificationSessionRepository.findCurrentByTarget(target);
  if (current) {
    const session = await expireIfNeeded(current);
    if (session.isCurrent && session.status !== "INVALIDATED" && session.expiresAt > new Date() && session.verificationRevision === target.verificationRevision && session.avatarFingerprint === target.avatarFingerprint) return session;
    if (session.isCurrent) {
      if (session.verificationRequestId) throw new AppError("A previous Creator verification request must be resolved before starting another session", 409);
      const retired = await faceVerificationSessionRepository.retireCurrent({ sessionId: session._id, status: "INVALIDATED", invalidationCode: "CREATOR_REVISION_CHANGED", cleanupAfter: cleanupAt() });
      if (retired) await faceVerificationEvidenceRepository.setCleanupForSession(retired._id, retired.cleanupAfter!);
    }
  }
  try {
    return await faceVerificationSessionRepository.createForTarget({ ...target, sessionReference: `CREATOR_FACE_SESSION_${ulid()}`, challenges: randomizedChallenges(), expiresAt: new Date(Date.now() + FACE_VERIFICATION_SESSION_TTL_MS) });
  } catch (error) {
    if (!duplicateKey(error)) throw error;
    const winner = await faceVerificationSessionRepository.findCurrentByTarget(target);
    if (winner && winner.verificationRevision === target.verificationRevision && winner.avatarFingerprint === target.avatarFingerprint && winner.expiresAt > new Date() && ["CREATED", "CAPTURING", "CAPTURE_COMPLETE"].includes(winner.status)) return winner;
    if (winner) throw new AppError("Creator verification changed concurrently; retry with the current application", 409);
    throw error;
  }
};

export const getOwnedCreatorVerificationSession = async (input: { userId: string; sessionReference: string }) => {
  const { application } = await ownedDraft(input.userId);
  const session = await faceVerificationSessionRepository.findOwned(input.sessionReference, application.userId);
  if (!session || session.targetType !== "CREATOR_APPLICATION" || String(session.targetId) !== String(application._id)) throw new AppError("Creator face verification session not found", 404);
  if (session.verificationRevision !== application.verificationRevision || session.avatarFingerprint !== fingerprintProfileMediaReference(application.avatarUrl ?? "")) throw new AppError("Creator face verification session is stale", 409);
  return expireIfNeeded(session);
};

export const acceptCreatorVerificationCapture = async (input: { userId: string; sessionReference: string; challengeIndex: unknown; file: Express.Multer.File; storeEvidence?: typeof storeFaceVerificationEvidence }) => {
  const index = typeof input.challengeIndex === "string" && /^\d+$/.test(input.challengeIndex) ? Number(input.challengeIndex) : -1;
  if (index < 0 || index > 4) throw new AppError("Invalid face verification challenge index", 400);
  const session = await getOwnedCreatorVerificationSession(input);
  if (!session.isCurrent || !["CREATED", "CAPTURING", "CAPTURE_COMPLETE"].includes(session.status)) throw new AppError("Face verification session is not accepting captures", 409);
  const existing = await faceVerificationEvidenceRepository.findSlot(session._id, index);
  if (existing?.status === "STORED") return { session, evidence: existing, replayed: true };
  if (!session.targetId || !session.ownerUserId || !session.verificationRevision || !["CREATED", "CAPTURING"].includes(session.status)) throw new AppError("Face verification session is not accepting captures", 409);
  const challenge = session.challenges[index]; if (!challenge) throw new AppError("Challenge does not belong to this session", 400);
  const evidenceReference = `CREATOR_FACE_EVIDENCE_${ulid()}`; const cloudinaryPublicId = `sthn/verification/creator-face-evidence/${session.sessionReference}/${index}-${evidenceReference}`;
  let evidence;
  try { evidence = await faceVerificationEvidenceRepository.createTargetReservation({ targetType: "CREATOR_APPLICATION", targetId: session.targetId, ownerUserId: session.ownerUserId, verificationRevision: session.verificationRevision, evidenceReference, sessionId: session._id, challengeIndex: index, challenge, cloudinaryPublicId }); }
  catch (error) { if (duplicateKey(error)) { const replay = await faceVerificationEvidenceRepository.findSlot(session._id, index); if (replay?.status === "STORED") return { session, evidence: replay, replayed: true }; } throw error; }
  const stored = await (input.storeEvidence ?? storeFaceVerificationEvidence)({ buffer: input.file.buffer, publicId: cloudinaryPublicId });
  const finalized = await faceVerificationEvidenceRepository.finalizeStored(evidence._id, { mimeType: stored.mimeType, bytes: stored.bytes, format: stored.format, captureReceivedAt: new Date() });
  if (!finalized) throw new AppError("Face evidence could not be finalized", 500);
  const count = await faceVerificationEvidenceRepository.countStored(session._id);
  const updated = await FaceVerificationSession.findOneAndUpdate({ _id: session._id, isCurrent: true, verificationRevision: session.verificationRevision, status: { $in: ["CREATED", "CAPTURING"] } }, { $max: { acceptedCaptureCount: count }, $set: count === 5 ? { status: "CAPTURE_COMPLETE", captureCompletedAt: new Date() } : { status: "CAPTURING" } }, { new: true });
  const current = updated ?? await FaceVerificationSession.findById(session._id);
  if (!current || !current.isCurrent || current.status === "INVALIDATED" || current.status === "EXPIRED") throw new AppError("Face verification session is not accepting captures", 409);
  return { session: current, evidence: finalized, replayed: false };
};

const mediaSnapshot = (application: CreatorApplicationDocument) => ({
  avatar: { role: "AVATAR" as const, sourceReference: application.avatarUrl!, fingerprint: fingerprintProfileMediaReference(application.avatarUrl!) },
  cover: { role: "COVER" as const, sourceReference: application.coverUrl!, fingerprint: fingerprintProfileMediaReference(application.coverUrl!) },
  profilePhotos: (application.media ?? []).map((sourceReference, profilePhotoIndex) => ({ role: "PROFILE_PHOTO" as const, profilePhotoIndex, sourceReference, fingerprint: fingerprintProfileMediaReference(sourceReference) })),
});

export const submitCreatorVerificationRequest = async (userId: string) => {
  const mongoSession = await mongoose.startSession();
  try {
    let requestId: Types.ObjectId | undefined;
    await mongoSession.withTransaction(async () => {
      const { account, application } = await ownedDraft(userId, mongoSession); const target = targetFor(application);
      if (await Booking.exists({ userId: account._id, status: { $in: ["REQUESTED", "CONFIRMED"] } }).session(mongoSession)) throw new AppError("Resolve active bookings before applying to become a Creator", 403);
      if (!application.displayName?.trim() || !application.country?.trim() || !application.city?.trim() || !application.publicBio?.trim() || !application.currency?.trim() || !application.coverUrl?.trim() || !application.avatarUrl?.trim() || (application.media?.length ?? 0) < 2 || (application.media?.length ?? 0) > 6 || (application.languages?.length ?? 0) < 1) throw new AppError("Complete all Creator application requirements before submitting", 409);
      const existing = await profileVerificationRequestRepository.findActiveByTarget(target, mongoSession);
      if (existing) {
        if (existing.verificationRevision !== target.verificationRevision || application.status !== "submitted") throw new AppError("Creator verification submission is stale", 409);
        const boundSession = await faceVerificationSessionRepository.findCurrentByTarget(target, mongoSession);
        if (!boundSession || String(boundSession.verificationRequestId) !== String(existing._id) || boundSession.verificationRevision !== target.verificationRevision || boundSession.status !== "CAPTURE_COMPLETE" || await faceVerificationEvidenceRepository.countStoredBoundToRequest(boundSession._id, existing._id, mongoSession) !== 5) throw new AppError("Creator verification evidence is unavailable", 409);
        requestId = existing._id; return;
      }
      const session = await faceVerificationSessionRepository.findCurrentByTarget(target, mongoSession);
      if (!session || session.verificationRevision !== target.verificationRevision || session.profileSubmissionVersion !== target.verificationRevision || String(session.userId) !== String(target.ownerUserId) || session.status !== "CAPTURE_COMPLETE" || session.requiredCaptureCount !== 5 || session.acceptedCaptureCount !== 5 || session.expiresAt <= new Date() || session.avatarFingerprint !== target.avatarFingerprint) throw new AppError("Complete five fresh live face captures for the current Creator draft before submitting", 409);
      const stored = await faceVerificationEvidenceRepository.listStoredForSession(session._id, mongoSession);
      if (stored.length !== 5 || stored.some((item, index) => item.challengeIndex !== index || item.challenge !== session.challenges[index] || item.targetType !== target.targetType || String(item.targetId) !== String(target.targetId) || String(item.userId) !== String(target.ownerUserId) || String(item.ownerUserId) !== String(target.ownerUserId) || item.verificationRevision !== target.verificationRevision || item.verificationRequestId)) throw new AppError("Five correctly bound face captures are required", 409);
      const request = await profileVerificationRequestRepository.createForTarget({ ...target, verificationReference: `CREATOR_VERIFICATION_${ulid()}`, attemptNumber: 1, submittedAt: new Date(), submittedMedia: mediaSnapshot(application), verificationPolicy: selectNewProfileVerificationPolicy() }, mongoSession);
      const bound = await faceVerificationSessionRepository.bindCompletedTargetToRequest({ ...target, requestId: request._id, session: mongoSession });
      if (!bound) throw new AppError("Completed Creator face verification session is no longer eligible", 409);
      await faceVerificationEvidenceRepository.bindSessionEvidence(bound._id, request._id, mongoSession);
      await profileVerificationJobRepository.createForTarget({ ...target, jobReference: `CREATOR_VERIFICATION_JOB_${ulid()}`, verificationRequestId: request._id, nextAttemptAt: new Date() }, mongoSession);
      application.status = "submitted"; application.submittedForReviewAt = new Date();
      // Pending records the application state without changing the User role.
      account.creatorStatus = "pending";
      await application.save({ session: mongoSession });
      await account.save({ session: mongoSession });
      requestId = request._id;
    });
    if (!requestId) throw new AppError("Creator verification submission did not complete", 500);
    return profileVerificationRequestRepository.findById(requestId);
  } finally { await mongoSession.endSession(); }
};

export const creatorVerificationStatus = async (userId: string) => {
  const { application } = await ownedDraft(userId); const target = targetFor(application);
  const [session, request] = await Promise.all([faceVerificationSessionRepository.findCurrentByTarget(target), profileVerificationRequestRepository.findActiveByTarget(target)]);
  const job = request ? await profileVerificationJobRepository.findByRequestId(request._id) : null;
  const result = request ? await (await import("../../repositories/profileVerificationInferenceResult.repository")).profileVerificationInferenceResultRepository.findAnyByRequestId(request._id) : null;
  const lifecycle = result ? "COMPLETED" : request?.status === "ADMIN_REVIEW_REQUIRED" ? "AWAITING_ADMIN_REVIEW" : job?.status === "FAILED" ? "FAILED" : job?.status === "RETRY_WAIT" ? "RETRYING" : job?.status === "RUNNING" ? "PROCESSING" : job?.status === "PENDING" ? "QUEUED" : request ? "SUBMITTED" : "DRAFT";
  return { applicationStatus: application.status, verificationRevision: application.verificationRevision, lifecycle, capture: session ? { acceptedCaptureCount: session.acceptedCaptureCount, requiredCaptureCount: session.requiredCaptureCount, status: session.status, expiresAt: session.expiresAt } : null, request: request ? { status: request.status, reference: request.verificationReference } : null, job: job ? { status: job.status, attemptCount: job.attemptCount } : null, inference: result ? { completed: true, reference: result.inferenceReference } : null, adminReviewRequired: request?.status === "ADMIN_REVIEW_REQUIRED" };
};
