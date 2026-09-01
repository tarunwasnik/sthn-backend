import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";
import { AppError } from "../../utils/AppError";
import { AdminProfileVerificationDetailDto } from "../../dtos/admin/profileVerificationDetail.dto";
import { profileVerificationRequestRepository } from "../../repositories/profileVerificationRequest.repository";
import { readProfileVerificationEvidenceBytes, resolveProfileVerificationEvidenceAuthority } from "./faceVerificationEvidenceRead.service";
import { FaceVerificationEvidenceStorageReader } from "./faceVerificationEvidenceStorage.service";
import { profileVerificationInferenceResultRepository } from "../../repositories/profileVerificationInferenceResult.repository";
import { profileVerificationJobRepository } from "../../repositories/profileVerificationJob.repository";

const unavailable = () => new AppError("Verification evidence is not available", 409);

const resolveRequest = async (verificationReference: string) => {
  if (!verificationReference || verificationReference.length > 80) throw new AppError("Invalid verification reference", 400);
  const request = await profileVerificationRequestRepository.findByVerificationReference(verificationReference);
  if (!request) throw new AppError("Verification request not found", 404);
  return request;
};

export const getAdminProfileVerificationDetail = async (verificationReference: string): Promise<AdminProfileVerificationDetailDto> => {
  const request = await resolveRequest(verificationReference);
  const authority = await resolveProfileVerificationEvidenceAuthority({ verificationRequestId: String(request._id) });
  if (authority.noOp || !authority.session || !authority.records) throw unavailable();
  const [profile, user, inference, job] = await Promise.all([
    UserProfile.findOne({ _id: request.profileId, userId: request.userId }).lean(),
    User.findById(request.userId).select("email status role mobileCountryCode mobileNumber").lean(),
    profileVerificationInferenceResultRepository.findForAttempt({ requestId: request._id, profileSubmissionVersion: request.profileSubmissionVersion, sessionId: authority.session._id }),
    profileVerificationJobRepository.findByRequestId(request._id),
  ]);
  if (!profile || !user || profile.verificationSubmissionVersion !== request.profileSubmissionVersion) throw unavailable();
  return {
    account: { userReference: String(user._id), email: user.email, status: user.status, role: user.role },
    profile: { profileReference: String(profile._id), username: profile.username, realName: profile.realName ?? null, dateOfBirth: profile.dateOfBirth, mobileCountryCode: user.mobileCountryCode ?? null, mobileNumber: user.mobileNumber ?? null, country: profile.country ?? null, city: profile.city ?? null, languages: profile.languages, bio: profile.bio, interests: profile.interests, profileStatus: profile.profileStatus, verificationSubmissionVersion: profile.verificationSubmissionVersion, verificationSubmittedAt: profile.verificationSubmittedAt ?? null, rejectionReason: profile.rejectionReason || null, avatar: profile.avatar, cover: profile.cover, profilePhotos: profile.profilePhotos },
    verificationRequest: { verificationReference: request.verificationReference, status: request.status, attemptNumber: request.attemptNumber, profileSubmissionVersion: request.profileSubmissionVersion, submittedAt: request.submittedAt, processingStartedAt: request.processingStartedAt ?? null, adminReviewRequiredAt: request.adminReviewRequiredAt ?? null, adminReviewReasonCode: request.adminReviewReasonCode ?? null, adminReviewReason: request.adminReviewReason ?? null, decisionAuthority: request.decisionAuthority ?? null, decidedAt: request.decidedAt ?? null, decision: request.decision ?? null, decisionReason: request.decisionReason ?? null, expiredAt: request.expiredAt ?? null, aiDecisionSnapshot: request.aiDecisionSnapshot ? { source: request.aiDecisionSnapshot.source, model: request.aiDecisionSnapshot.model, similarity: request.aiDecisionSnapshot.similarity, threshold: request.aiDecisionSnapshot.threshold, decidedAt: request.aiDecisionSnapshot.decidedAt } : null },
    job: job ? { status: job.status, attemptCount: job.attemptCount, maxRetryCount: job.maxRetryCount, completedAt: job.completedAt ?? null, failedAt: job.failedAt ?? null, lastErrorCode: job.lastErrorCode ?? null } : null,
    faceSession: { sessionReference: authority.session.sessionReference, profileSubmissionVersion: authority.session.profileSubmissionVersion, status: authority.session.status, isCurrent: authority.session.isCurrent, requiredCaptureCount: authority.session.requiredCaptureCount, acceptedCaptureCount: authority.session.acceptedCaptureCount, challenges: authority.session.challenges, startedAt: authority.session.startedAt, captureCompletedAt: authority.session.captureCompletedAt ?? null, invalidatedAt: authority.session.invalidatedAt ?? null },
    captures: authority.records.map((record) => ({ challengeIndex: record.challengeIndex, challengeType: record.challenge, viewPath: `/api/v1/admin/profile-verification/${encodeURIComponent(request.verificationReference)}/captures/${record.challengeIndex}` })),
    shadowIdentityAnalysis: inference?.shadowIdentityAnalysis ? { status: inference.shadowIdentityAnalysis.status, conclusion: inference.shadowIdentityAnalysis.conclusion ?? null, similarity: inference.shadowIdentityAnalysis.similarity ?? null, threshold: inference.shadowIdentityAnalysis.threshold ?? null, model: inference.shadowIdentityAnalysis.model?.identifier && inference.shadowIdentityAnalysis.model?.version ? { identifier: inference.shadowIdentityAnalysis.model.identifier, version: inference.shadowIdentityAnalysis.model.version } : null, processedAt: inference.shadowIdentityAnalysis.processedAt ?? null, usableCaptureCount: inference.findings.crossCapture.usableCaptureCount ?? null, reasonCode: inference.shadowIdentityAnalysis.reasonCode ?? null, reason: inference.shadowIdentityAnalysis.reason ?? null } : { status: "NOT_CONFIGURED", conclusion: null, similarity: null, threshold: null, model: null, processedAt: null, usableCaptureCount: null, reasonCode: null, reason: null },
  };
};

export const readAdminProfileVerificationCapture = async (input: { verificationReference: string; challengeIndex: number; storageReader?: FaceVerificationEvidenceStorageReader }) => {
  if (!Number.isInteger(input.challengeIndex) || input.challengeIndex < 0 || input.challengeIndex > 4) throw new AppError("Invalid challenge index", 400);
  const request = await resolveRequest(input.verificationReference);
  const result = await readProfileVerificationEvidenceBytes({ verificationRequestId: String(request._id), storageReader: input.storageReader });
  const capture = result.evidence?.find((item) => item.challengeIndex === input.challengeIndex);
  if (result.noOp || !capture) throw unavailable();
  return capture;
};
