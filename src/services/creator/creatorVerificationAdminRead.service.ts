import User from "../../models/User";
import { toAdminInferenceAdvisory } from "../../dtos/admin/profileVerificationAdvisory.dto";
import { CreatorApplication } from "../../models/creatorApplication.model";
import { ProfileVerificationRequestDocument } from "../../models/profileVerificationRequest.model";
import { Types } from "mongoose";
import { AppError } from "../../utils/AppError";
import { profileVerificationRequestRepository } from "../../repositories/profileVerificationRequest.repository";
import { profileVerificationJobRepository } from "../../repositories/profileVerificationJob.repository";
import { profileVerificationInferenceResultRepository } from "../../repositories/profileVerificationInferenceResult.repository";
import { resolveProfileVerificationEvidenceAuthority } from "../profile/faceVerificationEvidenceRead.service";
import { readAdminProfileVerificationCapture, projectAdminAiVerificationLifecycle } from "../profile/profileVerificationAdminRead.service";
import { FaceVerificationEvidenceStorageReader } from "../profile/faceVerificationEvidenceStorage.service";

type CreatorTargetVerificationRequest = ProfileVerificationRequestDocument & {
  targetType: "CREATOR_APPLICATION";
  targetId: Types.ObjectId;
  ownerUserId: Types.ObjectId;
  verificationRevision: number;
};

const isCreatorTargetVerificationRequest = (request: ProfileVerificationRequestDocument): request is CreatorTargetVerificationRequest => (
  request.targetType === "CREATOR_APPLICATION"
  && request.targetId instanceof Types.ObjectId
  && request.ownerUserId instanceof Types.ObjectId
  && typeof request.verificationRevision === "number"
  && Number.isInteger(request.verificationRevision)
  && request.verificationRevision >= 1
);

const resolve = async (reference: string) => {
  const request = await profileVerificationRequestRepository.findByVerificationReference(reference);
  if (!request || !isCreatorTargetVerificationRequest(request)) throw new AppError("Creator verification request not found", 404);
  if (!(await CreatorApplication.exists({ _id: request.targetId, userId: request.ownerUserId, applicationJourney: "user_upgrade", verificationRevision: request.verificationRevision }))) throw new AppError("Creator verification request not found", 404);
  return request;
};

export const listAdminCreatorVerificationCases = async (status: "processing" | "review" | "all" = "all") => {
  const statuses = status === "processing" ? ["PENDING", "PROCESSING"] as const : status === "review" ? ["ADMIN_REVIEW_REQUIRED"] as const : ["PENDING", "PROCESSING", "ADMIN_REVIEW_REQUIRED", "APPROVED", "REJECTED", "EXPIRED"] as const;
  const requests = await profileVerificationRequestRepository.listCreatorByStatuses([...statuses]);
  const creatorRequests: CreatorTargetVerificationRequest[] = [];
  for (const request of requests) {
    if (isCreatorTargetVerificationRequest(request)) creatorRequests.push(request);
  }
  const applications = await CreatorApplication.find({ _id: { $in: creatorRequests.map((request) => request.targetId) }, applicationJourney: "user_upgrade" }).populate("userId", "email").lean();
  const byId = new Map(applications.map((application) => [String(application._id), application]));
  const jobs = await profileVerificationJobRepository.findByRequestIds(requests.map((request) => request._id));
  const jobByRequest = new Map(jobs.map((job) => [String(job.verificationRequestId), job]));
  return creatorRequests.flatMap((request) => {
    const application = byId.get(String(request.targetId)); if (!application || !application.userId || application.verificationRevision !== request.verificationRevision || String((application.userId as unknown as { _id: unknown })._id) !== String(request.ownerUserId)) return [];
    const job = jobByRequest.get(String(request._id));
    return [{ verificationReference: request.verificationReference, requestStatus: request.status, verificationRevision: request.verificationRevision, application: { id: String(application._id), status: application.status, displayName: application.displayName, primaryCategory: application.primaryCategory, avatarUrl: application.avatarUrl ?? null, email: (application.userId as unknown as { email?: string }).email ?? "" }, job: job ? { status: job.status, attemptCount: job.attemptCount, lastErrorCode: job.lastErrorCode ?? null } : null }];
  });
};

export const getAdminCreatorVerificationCase = async (reference: string) => {
  const request = await resolve(reference);
  const authority = await resolveProfileVerificationEvidenceAuthority({ verificationRequestId: String(request._id) });
  if (!authority.session || !authority.records) throw new AppError("Creator verification evidence is not available", 409);
  const [application, account, job, inference] = await Promise.all([
    CreatorApplication.findOne({ _id: request.targetId, userId: request.ownerUserId }).lean(),
    User.findById(request.ownerUserId).select("email status role realName dateOfBirth mobileCountryCode mobileNumber creatorStatus").lean(),
    profileVerificationJobRepository.findByRequestId(request._id),
    profileVerificationInferenceResultRepository.findForTargetAttempt({ targetType: "CREATOR_APPLICATION", targetId: request.targetId, ownerUserId: request.ownerUserId, verificationRevision: request.verificationRevision, requestId: request._id, sessionId: authority.session._id }),
  ]);
  if (!application || !account || application.verificationRevision !== request.verificationRevision) throw new AppError("Creator verification authority is stale", 409);
  return { inferenceAdvisory: toAdminInferenceAdvisory(inference), targetType: "CREATOR_APPLICATION" as const, account: { userId: String(account._id), email: account.email, status: account.status, role: account.role, creatorStatus: account.creatorStatus, realName: account.realName ?? null, dateOfBirth: account.dateOfBirth ?? null, mobileCountryCode: account.mobileCountryCode ?? null, mobileNumber: account.mobileNumber ?? null }, application: { id: String(application._id), status: application.status, displayName: application.displayName, primaryCategory: application.primaryCategory, country: application.country, city: application.city, currency: application.currency, publicBio: application.publicBio, languages: application.languages, avatarUrl: application.avatarUrl ?? null, coverUrl: application.coverUrl ?? null, media: application.media ?? [], verificationRevision: application.verificationRevision }, request: { reference: request.verificationReference, status: request.status, submittedAt: request.submittedAt, policy: request.verificationPolicy ?? null }, job: job ? { status: job.status, attemptCount: job.attemptCount, maxRetryCount: job.maxRetryCount, lastErrorCode: job.lastErrorCode ?? null, failedAt: job.failedAt ?? null } : null, lifecycle: projectAdminAiVerificationLifecycle({ request, job, inference }), inference: inference ? { reference: inference.inferenceReference, pipeline: inference.pipeline, findings: inference.findings, gatedPolicyAnalysis: inference.gatedPolicyAnalysis ?? null, shadowIdentityAnalysis: inference.shadowIdentityAnalysis ?? null } : null, session: { reference: authority.session.sessionReference, status: authority.session.status, challenges: authority.session.challenges, acceptedCaptureCount: authority.session.acceptedCaptureCount, requiredCaptureCount: authority.session.requiredCaptureCount }, captures: authority.records.map((record) => ({ challengeIndex: record.challengeIndex, challenge: record.challenge, viewPath: `/api/v1/admin/creator-verification/${encodeURIComponent(request.verificationReference)}/captures/${record.challengeIndex}` })) };
};

export const readAdminCreatorVerificationCapture = async (reference: string, challengeIndex: number, storageReader?: FaceVerificationEvidenceStorageReader) => {
  await resolve(reference);
  return readAdminProfileVerificationCapture({ verificationReference: reference, challengeIndex, storageReader });
};
