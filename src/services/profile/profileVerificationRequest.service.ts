import mongoose from "mongoose";
import { ulid } from "ulid";

import {
  ProfileVerificationAdminReviewReasonCode,
  ProfileVerificationDecision,
  ProfileVerificationDecisionAuthority,
  ProfileVerificationRequestDocument,
} from "../../models/profileVerificationRequest.model";
import { UserProfile, UserProfileDocument } from "../../models/userProfile.model";
import { profileVerificationRequestRepository } from "../../repositories/profileVerificationRequest.repository";
import { createAuditLog } from "../auditLog.service";
import { AppError } from "../../utils/AppError";
import { toAdminProfileVerificationQueueDto, AdminProfileVerificationQueueDto, ProfileVerificationQueueProfileSource } from "../../dtos/admin/profileVerificationQueue.dto";
import { scheduleFaceEvidenceRetentionForDecision } from "./faceVerificationEvidenceCleanup.service";
import { FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS, FACE_VERIFICATION_SHORT_CLEANUP_MS } from "./faceVerification.constants";
import { faceVerificationSessionRepository } from "../../repositories/faceVerificationSession.repository";
import { faceVerificationEvidenceRepository } from "../../repositories/faceVerificationEvidence.repository";
import { profileVerificationJobRepository } from "../../repositories/profileVerificationJob.repository";
import { profileVerificationInferenceResultRepository } from "../../repositories/profileVerificationInferenceResult.repository";
import { deriveProfileVerificationLifecycleStage } from "./profileVerificationLifecycle.service";

const adminReviewReasonCodes = new Set<ProfileVerificationAdminReviewReasonCode>([
  "FACE_MATCH_UNCERTAIN", "LIVENESS_UNCERTAIN", "TEXT_MODERATION_UNCERTAIN",
  "IMAGE_MODERATION_UNCERTAIN", "CONFLICTING_CHECKS", "PROCESSING_TIMEOUT", "MODEL_FAILURE", "OTHER",
]);

export type ProfileVerificationQueueKind = "AI" | "ADMIN_REVIEW";

const verificationReference = () => `PROFILE_VERIFICATION_${ulid()}`;

const duplicateKey = (error: unknown) => (
  typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === 11000
);
const requestRetentionDeadline = (request: Pick<ProfileVerificationRequestDocument, "submittedAt">) => new Date(request.submittedAt.getTime() + FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS);

export const ensureActiveProfileVerificationRequest = async (
  profile: UserProfileDocument,
  session?: mongoose.ClientSession,
): Promise<{ request: ProfileVerificationRequestDocument; created: boolean }> => {
  const existing = await profileVerificationRequestRepository.findActiveByProfileId(profile._id, session);
  if (existing) return { request: existing, created: false };

  const attemptNumber = (await profileVerificationRequestRepository.countByProfileId(profile._id, session)) + 1;
  if (profile.verificationSubmissionVersion < 1) {
    profile.verificationSubmissionVersion = 1;
    await profile.save(session ? { session } : undefined);
  }
  const submissionVersion = profile.verificationSubmissionVersion;
  try {
    const request = await profileVerificationRequestRepository.create({
      verificationReference: verificationReference(),
      profileId: profile._id,
      userId: profile.userId,
      attemptNumber,
      profileSubmissionVersion: submissionVersion,
      submittedAt: profile.verificationSubmittedAt ?? new Date(),
    }, session);
    return { request, created: true };
  } catch (error) {
    if (!duplicateKey(error)) throw error;
    const concurrent = await profileVerificationRequestRepository.findActiveByProfileId(profile._id, session);
    if (!concurrent) throw error;
    return { request: concurrent, created: false };
  }
};

export const ensureLegacyPendingProfileVerificationRequest = async (
  profile: UserProfileDocument,
  session?: mongoose.ClientSession,
) => {
  if (profile.profileStatus !== "pending_verification") return null;
  return ensureActiveProfileVerificationRequest(profile, session);
};

export const listProfileVerificationQueue = async (
  queue: ProfileVerificationQueueKind,
): Promise<AdminProfileVerificationQueueDto[]> => {
  const legacyPendingProfiles = await UserProfile.find({ profileStatus: "pending_verification" });
  await Promise.all(legacyPendingProfiles.map((profile) => ensureLegacyPendingProfileVerificationRequest(profile)));

  const statuses = queue === "AI" ? ["PENDING", "PROCESSING"] as const : ["ADMIN_REVIEW_REQUIRED"] as const;
  const requests = await profileVerificationRequestRepository.listActiveByStatuses([...statuses]);
  if (requests.length === 0) return [];

  const profileIds = requests.map((request) => request.profileId);
  const profiles = await UserProfile.find({ _id: { $in: profileIds }, profileStatus: "pending_verification" })
    .populate("userId", "email")
    .exec();
  const profilesById = new Map(profiles.map((profile) => [String(profile._id), profile]));
  const [jobs, inferenceResults] = await Promise.all([
    profileVerificationJobRepository.findByRequestIds(requests.map((request) => request._id)),
    profileVerificationInferenceResultRepository.findByRequestIds(requests.map((request) => request._id)),
  ]);
  const jobsByRequestId = new Map(jobs.map((job) => [String(job.verificationRequestId), job]));
  const inferenceRequestIds = new Set(inferenceResults.map((result) => String(result.verificationRequestId)));

  return requests.flatMap((request) => {
    const profile = profilesById.get(String(request.profileId));
    if (!profile) return [];
    const job = jobsByRequestId.get(String(request._id));
    return [toAdminProfileVerificationQueueDto(
      request,
      profile.toObject() as unknown as ProfileVerificationQueueProfileSource,
      deriveProfileVerificationLifecycleStage({
        profileStatus: profile.profileStatus,
        requestStatus: request.status,
        jobStatus: job?.status,
        hasCompletedInference: inferenceRequestIds.has(String(request._id)),
      }),
    )];
  });
};

export const escalateProfileVerificationRequest = async (input: {
  profileId: string;
  reasonCode: ProfileVerificationAdminReviewReasonCode;
  reason?: string;
  now?: Date;
}): Promise<{ request: ProfileVerificationRequestDocument; replayed: boolean }> => {
  if (!mongoose.Types.ObjectId.isValid(input.profileId)) throw new AppError("Invalid profileId", 400);
  if (!adminReviewReasonCodes.has(input.reasonCode)) throw new AppError("Invalid admin review reason code", 400);
  if (input.reason !== undefined && (typeof input.reason !== "string" || !input.reason.trim() || input.reason.trim().length > 500)) {
    throw new AppError("Invalid admin review reason", 400);
  }

  const now = input.now ?? new Date();
  const session = await mongoose.startSession();
  try {
    let outcome: { request: ProfileVerificationRequestDocument; replayed: boolean } | null = null;
    await session.withTransaction(async () => {
      const profile = await UserProfile.findById(input.profileId).session(session);
      if (!profile) throw new AppError("Profile not found", 404);
      if (profile.profileStatus !== "pending_verification") throw new AppError("Profile is not pending verification", 409);
      const active = await ensureLegacyPendingProfileVerificationRequest(profile, session);
      const request = active?.request ?? await profileVerificationRequestRepository.findActiveByProfileId(profile._id, session);
      if (!request) throw new AppError("Profile verification request not found", 409);

      if (request.status === "ADMIN_REVIEW_REQUIRED") {
        if (request.adminReviewReasonCode === input.reasonCode && (request.adminReviewReason ?? undefined) === input.reason?.trim()) {
          outcome = { request, replayed: true };
          return;
        }
        throw new AppError("Profile verification request is already in admin review", 409);
      }

      const updated = await profileVerificationRequestRepository.transitionToAdminReview({
        requestId: request._id,
        reasonCode: input.reasonCode,
        reason: input.reason?.trim(),
        requiredAt: now,
        now,
        session,
      });
      if (!updated) {
        const latest = await profileVerificationRequestRepository.findLatestByProfileId(profile._id, session);
        if (latest?.status === "ADMIN_REVIEW_REQUIRED" && latest.adminReviewReasonCode === input.reasonCode && (latest.adminReviewReason ?? undefined) === input.reason?.trim()) {
          outcome = { request: latest, replayed: true };
          return;
        }
        throw new AppError("Profile verification request is no longer eligible for admin review", 409);
      }

      await createAuditLog({
        actorType: "SYSTEM",
        actorReference: "PROFILE_VERIFICATION_ESCALATION",
        action: "PROFILE_VERIFICATION_ADMIN_REVIEW_REQUIRED",
        entityType: "PROFILE_VERIFICATION_REQUEST",
        entityId: updated._id,
        before: { status: request.status, profileStatus: profile.profileStatus },
        after: {
          verificationReference: updated.verificationReference,
          status: updated.status,
          reasonCode: updated.adminReviewReasonCode!,
          ...(updated.adminReviewReason ? { reason: updated.adminReviewReason } : {}),
          profileStatus: profile.profileStatus,
        },
        session,
      });
      outcome = { request: updated, replayed: false };
    });
    if (!outcome) throw new AppError("Profile verification escalation did not complete", 500);
    return outcome;
  } finally {
    await session.endSession();
  }
};

export const decideProfileVerificationRequest = async (input: {
  profileId: string;
  decision: ProfileVerificationDecision;
  authority: ProfileVerificationDecisionAuthority;
  decidedBy?: string;
  reason?: string;
}): Promise<{ request: ProfileVerificationRequestDocument; replayed: boolean }> => {
  if (!mongoose.Types.ObjectId.isValid(input.profileId)) throw new AppError("Invalid profileId", 400);
  if (input.authority === "ADMIN" && (!input.decidedBy || !mongoose.Types.ObjectId.isValid(input.decidedBy))) {
    throw new AppError("Admin identity is required", 400);
  }
  if (input.authority === "AI" && input.decidedBy) throw new AppError("AI decisions cannot have an admin identity", 400);
  if (input.decision === "REJECT" && (!input.reason || !input.reason.trim())) {
    throw new AppError("Rejection reason is required", 400);
  }

  const profileObjectId = new mongoose.Types.ObjectId(input.profileId);
  const session = await mongoose.startSession();
  try {
    let outcome: { request: ProfileVerificationRequestDocument; replayed: boolean } | null = null;
    await session.withTransaction(async () => {
      const profile = await UserProfile.findById(profileObjectId).session(session);
      if (!profile) throw new AppError("Profile not found", 404);
      const active = await ensureLegacyPendingProfileVerificationRequest(profile, session);
      const request = active?.request ?? await profileVerificationRequestRepository.findActiveByProfileId(profile._id, session);
      if (!request) {
        const latest = await profileVerificationRequestRepository.findLatestByProfileId(profile._id, session);
        if (!latest) throw new AppError("Profile verification request not found", 409);
        if (latest.decision === input.decision) {
          outcome = { request: latest, replayed: true };
          return;
        }
        throw new AppError(latest.status === "EXPIRED" ? "Verification attempt expired; fresh submission required" : "Profile verification decision is already final", 409);
      }

      const now = new Date();
      const updated = await profileVerificationRequestRepository.transitionToTerminal({
        requestId: request._id,
        decision: input.decision,
        authority: input.authority,
        reason: input.decision === "REJECT" ? input.reason?.trim() : undefined,
        decidedBy: input.decidedBy ? new mongoose.Types.ObjectId(input.decidedBy) : undefined,
        decidedAt: now,
        now,
        session,
      });

      if (!updated) {
        const latest = await profileVerificationRequestRepository.findLatestByProfileId(profile._id, session);
        if (latest?.decision === input.decision) {
          outcome = { request: latest, replayed: true };
          return;
        }
        throw new AppError(latest?.status === "EXPIRED" ? "Verification attempt expired; fresh submission required" : "Profile verification decision is already final", 409);
      }

      profile.profileStatus = input.decision === "APPROVE" ? "verified" : "rejected";
      profile.rejectionReason = input.decision === "REJECT" ? input.reason!.trim() : "";
      await profile.save({ session });

      await createAuditLog({
        actorType: input.authority === "ADMIN" ? "ADMIN" : "SYSTEM",
        actorId: input.decidedBy ? new mongoose.Types.ObjectId(input.decidedBy) : undefined,
        actorReference: input.authority === "AI" ? "PROFILE_VERIFICATION_AI" : undefined,
        action: input.decision === "APPROVE" ? "PROFILE_VERIFICATION_APPROVED" : "PROFILE_VERIFICATION_REJECTED",
        entityType: "PROFILE_VERIFICATION_REQUEST",
        entityId: updated._id,
        before: { status: request.status, profileStatus: "pending_verification" },
        after: {
          verificationReference: updated.verificationReference,
          status: updated.status,
          decisionAuthority: updated.decisionAuthority!,
          profileStatus: profile.profileStatus,
          ...(input.decision === "REJECT" ? { reason: profile.rejectionReason } : {}),
        },
        session,
      });
      outcome = { request: updated, replayed: false };
    });
    if (!outcome) throw new AppError("Profile verification decision did not complete", 500);
    const resolvedOutcome = outcome as { request: ProfileVerificationRequestDocument; replayed: boolean };
    if (!resolvedOutcome.replayed) await scheduleFaceEvidenceRetentionForDecision(resolvedOutcome.request._id, input.decision, resolvedOutcome.request.decidedAt ?? new Date());
    return resolvedOutcome;
  } finally {
    await session.endSession();
  }
};

/** Reconciles the non-punitive maximum biometric-retention lifecycle. */
export const expireProfileVerificationRequests = async (now = new Date()) => {
  const active = await profileVerificationRequestRepository.listActive();
  let expired = 0;
  for (const request of active) {
    const deadline = requestRetentionDeadline(request);
    if (deadline.getTime() > now.getTime()) continue;
    const updated = await profileVerificationRequestRepository.transitionToExpired({ requestId: request._id, now, retentionDeadline: deadline });
    if (!updated) continue;
    const profile = await UserProfile.findById(updated.profileId);
    if (profile) {
      profile.profileStatus = "incomplete";
      profile.rejectionReason = "";
      await profile.save();
    }
    const cleanupAfter = new Date(Math.min(deadline.getTime(), now.getTime() + FACE_VERIFICATION_SHORT_CLEANUP_MS));
    const invalidated = await faceVerificationSessionRepository.invalidateForRequestRetentionExpiry({ requestId: updated._id, now, cleanupAfter });
    if (invalidated) await faceVerificationEvidenceRepository.setCleanupForSession(invalidated._id, cleanupAfter);
    await createAuditLog({
      actorType: "SYSTEM", actorReference: "BIOMETRIC_RETENTION_EXPIRED", action: "PROFILE_VERIFICATION_EXPIRED",
      entityType: "PROFILE_VERIFICATION_REQUEST", entityId: updated._id,
      before: { status: request.status, profileStatus: "pending_verification" },
      after: { verificationReference: updated.verificationReference, status: updated.status, expiredAt: updated.expiredAt, submissionVersion: updated.profileSubmissionVersion },
    });
    expired += 1;
  }
  return { expired };
};
