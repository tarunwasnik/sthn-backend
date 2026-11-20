import { ulid } from "ulid";
import { ClientSession, Types } from "mongoose";

import { ProfileVerificationRequestDocument } from "../../models/profileVerificationRequest.model";
import { ProfileVerificationJob, ProfileVerificationJobDocument } from "../../models/profileVerificationJob.model";
import { profileVerificationJobRepository } from "../../repositories/profileVerificationJob.repository";
import { profileVerificationRequestRepository } from "../../repositories/profileVerificationRequest.repository";
import { FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS } from "./faceVerification.constants";
import { finalizeProfileVerificationInference } from "./profileVerificationInference.service";
import { createSFaceProfileVerificationAdapter } from "./profileVerificationSFaceAdapter";
import { ProfileVerificationInferenceError } from "../../errors/profile/ProfileVerificationInferenceError";
import { profileVerificationInferenceResultRepository } from "../../repositories/profileVerificationInferenceResult.repository";
import { withYuNetRunnerAuditContext } from "./profileVerificationYuNetRuntimeAudit.service";
import { applyProfileVerificationAiDecision } from "./profileVerificationAiDecision.service";
import { UserProfile } from "../../models/userProfile.model";
import { CreatorApplication } from "../../models/creatorApplication.model";
import { AppError } from "../../utils/AppError";
import { ProfileVerificationInferenceAdapter } from "./profileVerificationInferenceAdapter";
import { reportProfileVerificationMemory } from "./profileVerificationMemoryDiagnostic.service";
import { applyCreatorV3AutomaticDecision } from "../creator/creatorV3AutomaticDecision.service";
import { emitIdentityChanged } from "../../sockets/chat.socket";
import { notificationDeliveryService } from "../notification/notificationDelivery.service";

const LEASE_MS = 5 * 60 * 1000;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000];
const PROCESSING_TIMEOUT_MS = 30 * 60 * 1000;
const processingJobReference = () => `PROFILE_VERIFICATION_JOB_${ulid()}`;
const eligibleCreatorUpgradeIds = async () => {
  const candidates = await ProfileVerificationJob.distinct("targetId", { targetType: "CREATOR_APPLICATION", status: { $in: ["PENDING", "RETRY_WAIT", "RUNNING"] } });
  return CreatorApplication.distinct("_id", { _id: { $in: candidates }, applicationJourney: "user_upgrade" });
};

const escalateStaleSubmission = async (request: ProfileVerificationRequestDocument, now: Date) => (
  profileVerificationRequestRepository.transitionToAdminReview({
    requestId: request._id,
    reasonCode: "OTHER",
    reason: "The submitted verification evidence no longer matches its authoritative revision. A new verification submission is required.",
    requiredAt: now,
    now,
  })
);

const boundedError = (value: unknown, maximum: number) => (
  typeof value === "string" && value.trim() ? value.trim().slice(0, maximum) : undefined
);

const isTerminalRequest = (request: ProfileVerificationRequestDocument | null) => (
  !request || !request.isActive || request.status === "APPROVED" || request.status === "REJECTED" || request.status === "EXPIRED"
);

const isReconciliationApplicableProfile = async (profileId: Types.ObjectId, submissionVersion: number) => {
  const profile = await UserProfile.findById(profileId).select("profileStatus verificationSubmissionVersion").lean();
  return profile?.profileStatus === "pending_verification" && profile.verificationSubmissionVersion === submissionVersion;
};

const escalateFailedProfileVerificationJob = async (job: ProfileVerificationJobDocument, reason: string, now: Date) => {
  const request = await profileVerificationRequestRepository.findById(job.verificationRequestId);
  if (job.targetType === "CREATOR_APPLICATION" && (!request || request.targetType !== "CREATOR_APPLICATION" || !job.targetId || !request.targetId || !job.targetId.equals(request.targetId) || !job.ownerUserId || !request.ownerUserId || !job.ownerUserId.equals(request.ownerUserId))) return;
  if (request?.targetType === "CREATOR_APPLICATION") {
    if (job.targetType !== "CREATOR_APPLICATION") return;
    await profileVerificationRequestRepository.transitionToAdminReview({ requestId: request._id, reasonCode: "OTHER", reason, requiredAt: now, now });
    return;
  }
  if (request && request.isActive && (request.status === "PENDING" || request.status === "PROCESSING")) {
    const { escalateProfileVerificationRequest } = await import("./profileVerificationRequest.service");
    await escalateProfileVerificationRequest({ profileId: String(request.profileId), reasonCode: "MODEL_FAILURE", reason, now });
  }
};

export const ensureProfileVerificationJob = async (
  request: ProfileVerificationRequestDocument,
  session?: ClientSession,
): Promise<{ job: ProfileVerificationJobDocument; created: boolean }> => {
  const existing = await profileVerificationJobRepository.findByRequestId(request._id, session);
  if (existing) return { job: existing, created: false };
  try {
    const job = await profileVerificationJobRepository.create({
      jobReference: processingJobReference(),
      verificationRequestId: request._id,
      profileId: request.profileId,
      userId: request.userId,
      profileSubmissionVersion: request.profileSubmissionVersion,
      nextAttemptAt: new Date(),
    }, session);
    return { job, created: true };
  } catch (error) {
    if (!(typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === 11000)) throw error;
    const concurrent = await profileVerificationJobRepository.findByRequestId(request._id, session);
    if (!concurrent) throw error;
    return { job: concurrent, created: false };
  }
};

export const claimProfileVerificationJob = async (input: { workerId: string; now?: Date }) => {
  const now = input.now ?? new Date();
  const creatorUpgradeIds = await eligibleCreatorUpgradeIds();
  const job = await profileVerificationJobRepository.claimNext(input.workerId, now, new Date(now.getTime() + LEASE_MS), creatorUpgradeIds);
  if (!job) return null;

  const request = await profileVerificationRequestRepository.findById(job.verificationRequestId);
  if (job.targetType === "CREATOR_APPLICATION" && request && (request.targetType !== job.targetType || !job.targetId || !request.targetId || !job.ownerUserId || !request.ownerUserId || !job.targetId.equals(request.targetId) || !job.ownerUserId.equals(request.ownerUserId) || job.verificationRevision !== request.verificationRevision)) {
    await profileVerificationJobRepository.fail({ jobId: job._id, workerId: input.workerId, now, errorCode: "STALE_SUBMISSION", errorMessage: "Creator job target does not match its request." });
    if (request.targetType === "CREATOR_APPLICATION" && job.targetId && request.targetId && job.targetId.equals(request.targetId) && job.ownerUserId && request.ownerUserId && job.ownerUserId.equals(request.ownerUserId)) await escalateStaleSubmission(request, now);
    return { job, request, actionable: false };
  }
  if (isTerminalRequest(request) || request!.profileSubmissionVersion !== job.profileSubmissionVersion
    || request!.submittedAt.getTime() + FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS <= now.getTime()) {
    if (job.targetType === "CREATOR_APPLICATION") {
      await profileVerificationJobRepository.failInactiveCreatorRequest(job._id, now);
      if (request?.targetType === "CREATOR_APPLICATION" && request.isActive && request.profileSubmissionVersion !== job.profileSubmissionVersion) await escalateStaleSubmission(request, now);
    }
    else await profileVerificationJobRepository.completeIfNotTerminal({ jobId: job._id, now });
    return { job, request, actionable: false };
  }

  if (request!.status === "PENDING") {
    const processing = await profileVerificationRequestRepository.transitionPendingToProcessing(request!._id, now);
    if (!processing) {
      const current = await profileVerificationRequestRepository.findById(request!._id);
      if (isTerminalRequest(current) || current?.profileSubmissionVersion !== job.profileSubmissionVersion) {
        if (job.targetType === "CREATOR_APPLICATION") {
          await profileVerificationJobRepository.failInactiveCreatorRequest(job._id, now);
          if (current?.targetType === "CREATOR_APPLICATION" && current.isActive && current.profileSubmissionVersion !== job.profileSubmissionVersion) await escalateStaleSubmission(current, now);
        }
        else await profileVerificationJobRepository.completeIfNotTerminal({ jobId: job._id, now });
        return { job, request: current, actionable: false };
      }
    }
  }

  return { job, request, actionable: true };
};

export const recordProfileVerificationJobFailure = async (input: {
  jobId: string;
  workerId: string;
  errorCode: string;
  errorMessage?: string;
  now?: Date;
}) => {
  const now = input.now ?? new Date();
  if (!Types.ObjectId.isValid(input.jobId)) return null;
  const job = await profileVerificationJobRepository.findById(new Types.ObjectId(input.jobId));
  if (!job || job.status !== "RUNNING" || job.workerId !== input.workerId) return null;
  const errorCode = boundedError(input.errorCode, 80);
  if (!errorCode) throw new Error("Profile verification job error code is required");
  const errorMessage = boundedError(input.errorMessage, 500);

  if (job.attemptCount >= job.maxRetryCount) {
    const failed = await profileVerificationJobRepository.fail({ jobId: job._id, workerId: input.workerId, now, errorCode, errorMessage });
    if (!failed) return null;
    await escalateFailedProfileVerificationJob(failed, "Verification processing could not be completed after bounded retries.", now);
    return failed;
  }

  const delayIndex = Math.min(job.attemptCount - 1, RETRY_DELAYS_MS.length - 1);
  return profileVerificationJobRepository.scheduleRetry({
    jobId: job._id,
    workerId: input.workerId,
    nextAttemptAt: new Date(now.getTime() + RETRY_DELAYS_MS[delayIndex]),
    errorCode,
    errorMessage,
  });
};

/** Executes the already-claimed PROFILE_VERIFICATION_PROCESSING job; no parallel SFace job exists. */
export const processNextProfileVerificationJob = async (input: { workerId: string; now?: Date; adapterFactory?: () => ProfileVerificationInferenceAdapter }) => {
  const now = input.now ?? new Date();
  const claim = await claimProfileVerificationJob({ workerId: input.workerId, now });
  if (!claim) return null;
  if (!claim.actionable) return { ...claim, result: null, completed: claim.job.targetType !== "CREATOR_APPLICATION" };
  reportProfileVerificationMemory("WORKER_CLAIMED");
  try {
    const outcome = await withYuNetRunnerAuditContext({ verificationReference: claim.request!.verificationReference, jobReference: claim.job.jobReference, submissionVersion: claim.job.profileSubmissionVersion, attemptCount: claim.job.attemptCount }, () => finalizeProfileVerificationInference({
      verificationRequestId: String(claim.job.verificationRequestId), adapter: input.adapterFactory?.() ?? createSFaceProfileVerificationAdapter(),
    }));
    reportProfileVerificationMemory("INFERENCE_FINALIZED");
    if (outcome.noOp === "STALE_SUBMISSION") {
      // This is not a successful completed inference. Preserve the immutable
      // stale evidence, stop retrying it, and make the applicant/Admin state
      // explicit rather than leaving an active request in PROCESSING.
      const failure = await profileVerificationJobRepository.fail({
        jobId: claim.job._id,
        workerId: input.workerId,
        now: new Date(),
        errorCode: "STALE_SUBMISSION",
        errorMessage: "Submitted face evidence does not match the authoritative verification revision.",
      });
      await escalateStaleSubmission(claim.request!, new Date());
      return { ...claim, result: null, replayed: false, completed: false, failure };
    }
    if (claim.request!.targetType === "CREATOR_APPLICATION" && !outcome.result) {
      const failure = await profileVerificationJobRepository.fail({ jobId: claim.job._id, workerId: input.workerId, now: new Date(), errorCode: "NO_INFERENCE_RESULT", errorMessage: "Creator verification did not produce an inference result." });
      await escalateStaleSubmission(claim.request!, new Date());
      return { ...claim, result: null, replayed: false, completed: false, failure };
    }
    if (outcome.result && claim.request!.targetType !== "CREATOR_APPLICATION") {
      const decision = await applyProfileVerificationAiDecision({ request: claim.request!, result: outcome.result });
      reportProfileVerificationMemory("DECISION_APPLIED", { decisionType: decision.request.status as "APPROVED" | "REJECTED" | "ADMIN_REVIEW_REQUIRED" });
    }
    if (outcome.result && claim.request!.targetType === "CREATOR_APPLICATION") {
      const decision = await applyCreatorV3AutomaticDecision({ request: claim.request!, result: outcome.result });
      if (decision.approval) {
        emitIdentityChanged(decision.approval.creatorProfile.userId.toString());
        if (decision.approval.delivery?.created) notificationDeliveryService.deliverPersisted(decision.approval.delivery.notification, { postCommit: true });
      }
      if (decision.evaluation.finalAction === "ADMIN_REVIEW" || decision.evaluation.finalAction === "DISABLED") {
        await profileVerificationRequestRepository.transitionToAdminReview({ requestId: claim.request!._id, reasonCode: "OTHER", reason: decision.evaluation.finalAction === "DISABLED" ? "Creator V3 automatic verification is disabled; Admin review is required." : decision.evaluation.reason, requiredAt: new Date(), now: new Date() });
      }
    }
    const completed = await profileVerificationJobRepository.completeIfNotTerminal({ jobId: claim.job._id, now: new Date() });
    reportProfileVerificationMemory("WORKER_COMPLETED");
    return { ...claim, result: outcome.result, replayed: outcome.replayed, completed: Boolean(completed) };
  } catch (error) {
    const inferenceError = error instanceof ProfileVerificationInferenceError ? error : null;
    const failure = await recordProfileVerificationJobFailure({
      jobId: String(claim.job._id), workerId: input.workerId,
      errorCode: inferenceError?.code ?? "TECHNICAL_FAILURE",
      errorMessage: inferenceError?.message,
      now: new Date(),
    });
    return { ...claim, result: null, replayed: false, completed: false, failure };
  }
};

export const reconcileProfileVerificationJobs = async (now = new Date()) => {
  const report = { jobsCreated: 0, expiredLeasesRecovered: 0, expiredLeasesFailed: 0, terminalJobsCompleted: 0, timeoutEscalated: 0, skipped: 0 };
  const { expireProfileVerificationRequests } = await import("./profileVerificationRequest.service");
  await expireProfileVerificationRequests(now);
  const creatorUpgradeIds = await eligibleCreatorUpgradeIds();
  for (;;) {
    const failed = await profileVerificationJobRepository.failOneExpiredLeaseAtAttemptLimit(now, creatorUpgradeIds);
    if (!failed) break;
    report.expiredLeasesFailed += 1;
    await escalateFailedProfileVerificationJob(failed, "Verification processing stopped before completion after bounded attempts.", now);
  }
  const recovered = await profileVerificationJobRepository.recoverExpiredLeasesBelowAttemptLimit(now, creatorUpgradeIds);
  report.expiredLeasesRecovered = recovered.modifiedCount;

  const activeRequests = await profileVerificationRequestRepository.listActive();
  for (const request of activeRequests) {
    if (request.targetType === "CREATOR_APPLICATION") {
      const valid = await (await import("../creator/creatorUpgradeVerificationAuthority")).isCurrentCreatorUpgradeVerification(request);
      if (!valid || !request.targetId || !request.ownerUserId || !request.verificationRevision) { report.skipped += 1; continue; }
      let job = await profileVerificationJobRepository.findByRequestId(request._id);
      if (!job) {
        try { job = await profileVerificationJobRepository.createForTarget({ targetType: "CREATOR_APPLICATION", targetId: request.targetId, ownerUserId: request.ownerUserId, verificationRevision: request.verificationRevision, verificationRequestId: request._id, jobReference: processingJobReference(), nextAttemptAt: now }); report.jobsCreated += 1; }
        catch (error) { job = await profileVerificationJobRepository.findByRequestId(request._id); if (!job) throw error; }
      }
      if (job.status !== "COMPLETED" && request.submittedAt.getTime() + PROCESSING_TIMEOUT_MS <= now.getTime() && request.submittedAt.getTime() + FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS > now.getTime()) {
        const escalated = await profileVerificationRequestRepository.transitionToAdminReview({ requestId: request._id, reasonCode: "PROCESSING_TIMEOUT", reason: "Verification processing remained unresolved at the submission deadline.", requiredAt: now, now });
        if (escalated) report.timeoutEscalated += 1;
      }
      continue;
    }
    if (!(await isReconciliationApplicableProfile(request.profileId, request.profileSubmissionVersion))) {
      report.skipped += 1;
      continue;
    }
    const ensured = await ensureProfileVerificationJob(request);
    if (ensured.created) report.jobsCreated += 1;
    const timeoutReached = request.submittedAt.getTime() + PROCESSING_TIMEOUT_MS <= now.getTime();
    const retentionValid = request.submittedAt.getTime() + FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS > now.getTime();
    // A completed job with a persisted inference result is awaiting an Admin
    // decision, not still processing.  Keep its active request in the AI
    // queue and never re-label it as a processing timeout.
    const hasCompletedInference = ensured.job.status === "COMPLETED"
      && Boolean(await profileVerificationInferenceResultRepository.findAnyByRequestId(request._id));
    if (timeoutReached && retentionValid && !hasCompletedInference && (request.status === "PENDING" || request.status === "PROCESSING")) {
      const { escalateProfileVerificationRequest } = await import("./profileVerificationRequest.service");
      let escalation;
      try {
        escalation = await escalateProfileVerificationRequest({
          profileId: String(request.profileId),
          reasonCode: "PROCESSING_TIMEOUT",
          reason: "Verification processing remained unresolved at the submission deadline.",
          now,
        });
      } catch (error) {
        // A decision can win after candidate selection. Revalidate only that
        // resolved/stale collision; all other 409s and unexpected failures surface.
        if (!(error instanceof AppError) || error.statusCode !== 409
          || await isReconciliationApplicableProfile(request.profileId, request.profileSubmissionVersion)) throw error;
        report.skipped += 1;
        continue;
      }
      if (!escalation.replayed) report.timeoutEscalated += 1;
    }
  }

  const nonTerminalJobs = await profileVerificationJobRepository.listNonTerminal();
  for (const job of nonTerminalJobs) {
    if (job.targetType === "CREATOR_APPLICATION") {
      if (!job.targetId || !creatorUpgradeIds.some((id) => id.equals(job.targetId))) { report.skipped += 1; continue; }
      const creatorRequest = await profileVerificationRequestRepository.findById(job.verificationRequestId);
      if (isTerminalRequest(creatorRequest)) await profileVerificationJobRepository.failInactiveCreatorRequest(job._id, now);
      continue;
    }
    const request = await profileVerificationRequestRepository.findById(job.verificationRequestId);
    if (isTerminalRequest(request) || request!.profileSubmissionVersion !== job.profileSubmissionVersion
      || !(await isReconciliationApplicableProfile(job.profileId, job.profileSubmissionVersion))) {
      const completed = await profileVerificationJobRepository.completeIfNotTerminal({ jobId: job._id, now });
      if (completed) report.terminalJobsCompleted += 1;
    }
  }
  return report;
};
