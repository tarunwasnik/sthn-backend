import { ulid } from "ulid";
import { Types } from "mongoose";

import { ProfileVerificationRequestDocument } from "../../models/profileVerificationRequest.model";
import { ProfileVerificationJobDocument } from "../../models/profileVerificationJob.model";
import { profileVerificationJobRepository } from "../../repositories/profileVerificationJob.repository";
import { profileVerificationRequestRepository } from "../../repositories/profileVerificationRequest.repository";
import { FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS } from "./faceVerification.constants";
import { finalizeProfileVerificationInference } from "./profileVerificationInference.service";
import { createSFaceProfileVerificationAdapter } from "./profileVerificationSFaceAdapter";
import { ProfileVerificationInferenceError } from "../../errors/profile/ProfileVerificationInferenceError";
import { profileVerificationInferenceResultRepository } from "../../repositories/profileVerificationInferenceResult.repository";
import { withYuNetRunnerAuditContext } from "./profileVerificationYuNetRuntimeAudit.service";

const LEASE_MS = 5 * 60 * 1000;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000];
const PROCESSING_TIMEOUT_MS = 30 * 60 * 1000;
const processingJobReference = () => `PROFILE_VERIFICATION_JOB_${ulid()}`;

const boundedError = (value: unknown, maximum: number) => (
  typeof value === "string" && value.trim() ? value.trim().slice(0, maximum) : undefined
);

const isTerminalRequest = (request: ProfileVerificationRequestDocument | null) => (
  !request || !request.isActive || request.status === "APPROVED" || request.status === "REJECTED" || request.status === "EXPIRED"
);

export const ensureProfileVerificationJob = async (
  request: ProfileVerificationRequestDocument,
): Promise<{ job: ProfileVerificationJobDocument; created: boolean }> => {
  const existing = await profileVerificationJobRepository.findByRequestId(request._id);
  if (existing) return { job: existing, created: false };
  try {
    const job = await profileVerificationJobRepository.create({
      jobReference: processingJobReference(),
      verificationRequestId: request._id,
      profileId: request.profileId,
      userId: request.userId,
      profileSubmissionVersion: request.profileSubmissionVersion,
      nextAttemptAt: new Date(),
    });
    return { job, created: true };
  } catch (error) {
    if (!(typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === 11000)) throw error;
    const concurrent = await profileVerificationJobRepository.findByRequestId(request._id);
    if (!concurrent) throw error;
    return { job: concurrent, created: false };
  }
};

export const claimProfileVerificationJob = async (input: { workerId: string; now?: Date }) => {
  const now = input.now ?? new Date();
  const job = await profileVerificationJobRepository.claimNext(input.workerId, now, new Date(now.getTime() + LEASE_MS));
  if (!job) return null;

  const request = await profileVerificationRequestRepository.findById(job.verificationRequestId);
  if (isTerminalRequest(request) || request!.profileSubmissionVersion !== job.profileSubmissionVersion
    || request!.submittedAt.getTime() + FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS <= now.getTime()) {
    await profileVerificationJobRepository.completeIfNotTerminal({ jobId: job._id, now });
    return { job, request, actionable: false };
  }

  if (request!.status === "PENDING") {
    const processing = await profileVerificationRequestRepository.transitionPendingToProcessing(request!._id, now);
    if (!processing) {
      const current = await profileVerificationRequestRepository.findById(request!._id);
      if (isTerminalRequest(current) || current?.profileSubmissionVersion !== job.profileSubmissionVersion) {
        await profileVerificationJobRepository.completeIfNotTerminal({ jobId: job._id, now });
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
    const request = await profileVerificationRequestRepository.findById(failed.verificationRequestId);
    if (request && request.isActive && (request.status === "PENDING" || request.status === "PROCESSING")) {
      const { escalateProfileVerificationRequest } = await import("./profileVerificationRequest.service");
      await escalateProfileVerificationRequest({ profileId: String(request.profileId), reasonCode: "MODEL_FAILURE", reason: "Verification processing could not be completed after bounded retries." });
    }
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
export const processNextProfileVerificationJob = async (input: { workerId: string; now?: Date }) => {
  const now = input.now ?? new Date();
  const claim = await claimProfileVerificationJob({ workerId: input.workerId, now });
  if (!claim) return null;
  if (!claim.actionable) return { ...claim, result: null, completed: true };
  try {
    const outcome = await withYuNetRunnerAuditContext({ verificationReference: claim.request!.verificationReference, jobReference: claim.job.jobReference, submissionVersion: claim.job.profileSubmissionVersion, attemptCount: claim.job.attemptCount }, () => finalizeProfileVerificationInference({
      verificationRequestId: String(claim.job.verificationRequestId), adapter: createSFaceProfileVerificationAdapter(),
    }));
    const completed = await profileVerificationJobRepository.completeIfNotTerminal({ jobId: claim.job._id, now: new Date() });
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
  const report = { jobsCreated: 0, expiredLeasesRecovered: 0, terminalJobsCompleted: 0, timeoutEscalated: 0, skipped: 0 };
  const { expireProfileVerificationRequests } = await import("./profileVerificationRequest.service");
  await expireProfileVerificationRequests(now);
  const recovered = await profileVerificationJobRepository.recoverExpiredLeases(now);
  report.expiredLeasesRecovered = recovered.modifiedCount;

  const activeRequests = await profileVerificationRequestRepository.listActive();
  for (const request of activeRequests) {
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
      const escalation = await escalateProfileVerificationRequest({
        profileId: String(request.profileId),
        reasonCode: "PROCESSING_TIMEOUT",
        reason: "Verification processing remained unresolved at the submission deadline.",
        now,
      });
      if (!escalation.replayed) report.timeoutEscalated += 1;
    }
  }

  const nonTerminalJobs = await profileVerificationJobRepository.listNonTerminal();
  for (const job of nonTerminalJobs) {
    const request = await profileVerificationRequestRepository.findById(job.verificationRequestId);
    if (isTerminalRequest(request) || request!.profileSubmissionVersion !== job.profileSubmissionVersion) {
      const completed = await profileVerificationJobRepository.completeIfNotTerminal({ jobId: job._id, now });
      if (completed) report.terminalJobsCompleted += 1;
    }
  }
  return report;
};
