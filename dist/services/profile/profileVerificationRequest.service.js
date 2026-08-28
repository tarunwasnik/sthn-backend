"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.expireProfileVerificationRequests = exports.decideProfileVerificationRequest = exports.escalateProfileVerificationRequest = exports.listProfileVerificationQueue = exports.ensureLegacyPendingProfileVerificationRequest = exports.ensureActiveProfileVerificationRequest = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const ulid_1 = require("ulid");
const userProfile_model_1 = require("../../models/userProfile.model");
const profileVerificationRequest_repository_1 = require("../../repositories/profileVerificationRequest.repository");
const auditLog_service_1 = require("../auditLog.service");
const AppError_1 = require("../../utils/AppError");
const profileVerificationQueue_dto_1 = require("../../dtos/admin/profileVerificationQueue.dto");
const faceVerificationEvidenceCleanup_service_1 = require("./faceVerificationEvidenceCleanup.service");
const faceVerification_constants_1 = require("./faceVerification.constants");
const faceVerificationSession_repository_1 = require("../../repositories/faceVerificationSession.repository");
const faceVerificationEvidence_repository_1 = require("../../repositories/faceVerificationEvidence.repository");
const adminReviewReasonCodes = new Set([
    "FACE_MATCH_UNCERTAIN", "LIVENESS_UNCERTAIN", "TEXT_MODERATION_UNCERTAIN",
    "IMAGE_MODERATION_UNCERTAIN", "CONFLICTING_CHECKS", "PROCESSING_TIMEOUT", "MODEL_FAILURE", "OTHER",
]);
const verificationReference = () => `PROFILE_VERIFICATION_${(0, ulid_1.ulid)()}`;
const duplicateKey = (error) => (typeof error === "object" && error !== null && "code" in error && error.code === 11000);
const requestRetentionDeadline = (request) => new Date(request.submittedAt.getTime() + faceVerification_constants_1.FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS);
const ensureActiveProfileVerificationRequest = async (profile, session) => {
    const existing = await profileVerificationRequest_repository_1.profileVerificationRequestRepository.findActiveByProfileId(profile._id, session);
    if (existing)
        return { request: existing, created: false };
    const attemptNumber = (await profileVerificationRequest_repository_1.profileVerificationRequestRepository.countByProfileId(profile._id, session)) + 1;
    if (profile.verificationSubmissionVersion < 1) {
        profile.verificationSubmissionVersion = 1;
        await profile.save(session ? { session } : undefined);
    }
    const submissionVersion = profile.verificationSubmissionVersion;
    try {
        const request = await profileVerificationRequest_repository_1.profileVerificationRequestRepository.create({
            verificationReference: verificationReference(),
            profileId: profile._id,
            userId: profile.userId,
            attemptNumber,
            profileSubmissionVersion: submissionVersion,
            submittedAt: profile.verificationSubmittedAt ?? new Date(),
        }, session);
        return { request, created: true };
    }
    catch (error) {
        if (!duplicateKey(error))
            throw error;
        const concurrent = await profileVerificationRequest_repository_1.profileVerificationRequestRepository.findActiveByProfileId(profile._id, session);
        if (!concurrent)
            throw error;
        return { request: concurrent, created: false };
    }
};
exports.ensureActiveProfileVerificationRequest = ensureActiveProfileVerificationRequest;
const ensureLegacyPendingProfileVerificationRequest = async (profile, session) => {
    if (profile.profileStatus !== "pending_verification")
        return null;
    return (0, exports.ensureActiveProfileVerificationRequest)(profile, session);
};
exports.ensureLegacyPendingProfileVerificationRequest = ensureLegacyPendingProfileVerificationRequest;
const listProfileVerificationQueue = async (queue) => {
    const legacyPendingProfiles = await userProfile_model_1.UserProfile.find({ profileStatus: "pending_verification" });
    await Promise.all(legacyPendingProfiles.map((profile) => (0, exports.ensureLegacyPendingProfileVerificationRequest)(profile)));
    const statuses = queue === "AI" ? ["PENDING", "PROCESSING"] : ["ADMIN_REVIEW_REQUIRED"];
    const requests = await profileVerificationRequest_repository_1.profileVerificationRequestRepository.listActiveByStatuses([...statuses]);
    if (requests.length === 0)
        return [];
    const profileIds = requests.map((request) => request.profileId);
    const profiles = await userProfile_model_1.UserProfile.find({ _id: { $in: profileIds }, profileStatus: "pending_verification" })
        .populate("userId", "email")
        .exec();
    const profilesById = new Map(profiles.map((profile) => [String(profile._id), profile]));
    return requests.flatMap((request) => {
        const profile = profilesById.get(String(request.profileId));
        if (!profile)
            return [];
        return [(0, profileVerificationQueue_dto_1.toAdminProfileVerificationQueueDto)(request, profile.toObject())];
    });
};
exports.listProfileVerificationQueue = listProfileVerificationQueue;
const escalateProfileVerificationRequest = async (input) => {
    if (!mongoose_1.default.Types.ObjectId.isValid(input.profileId))
        throw new AppError_1.AppError("Invalid profileId", 400);
    if (!adminReviewReasonCodes.has(input.reasonCode))
        throw new AppError_1.AppError("Invalid admin review reason code", 400);
    if (input.reason !== undefined && (typeof input.reason !== "string" || !input.reason.trim() || input.reason.trim().length > 500)) {
        throw new AppError_1.AppError("Invalid admin review reason", 400);
    }
    const session = await mongoose_1.default.startSession();
    try {
        let outcome = null;
        await session.withTransaction(async () => {
            const profile = await userProfile_model_1.UserProfile.findById(input.profileId).session(session);
            if (!profile)
                throw new AppError_1.AppError("Profile not found", 404);
            if (profile.profileStatus !== "pending_verification")
                throw new AppError_1.AppError("Profile is not pending verification", 409);
            const active = await (0, exports.ensureLegacyPendingProfileVerificationRequest)(profile, session);
            const request = active?.request ?? await profileVerificationRequest_repository_1.profileVerificationRequestRepository.findActiveByProfileId(profile._id, session);
            if (!request)
                throw new AppError_1.AppError("Profile verification request not found", 409);
            if (request.status === "ADMIN_REVIEW_REQUIRED") {
                if (request.adminReviewReasonCode === input.reasonCode && (request.adminReviewReason ?? undefined) === input.reason?.trim()) {
                    outcome = { request, replayed: true };
                    return;
                }
                throw new AppError_1.AppError("Profile verification request is already in admin review", 409);
            }
            const updated = await profileVerificationRequest_repository_1.profileVerificationRequestRepository.transitionToAdminReview({
                requestId: request._id,
                reasonCode: input.reasonCode,
                reason: input.reason?.trim(),
                requiredAt: new Date(),
                session,
            });
            if (!updated) {
                const latest = await profileVerificationRequest_repository_1.profileVerificationRequestRepository.findLatestByProfileId(profile._id, session);
                if (latest?.status === "ADMIN_REVIEW_REQUIRED" && latest.adminReviewReasonCode === input.reasonCode && (latest.adminReviewReason ?? undefined) === input.reason?.trim()) {
                    outcome = { request: latest, replayed: true };
                    return;
                }
                throw new AppError_1.AppError("Profile verification request is no longer eligible for admin review", 409);
            }
            await (0, auditLog_service_1.createAuditLog)({
                actorType: "SYSTEM",
                actorReference: "PROFILE_VERIFICATION_ESCALATION",
                action: "PROFILE_VERIFICATION_ADMIN_REVIEW_REQUIRED",
                entityType: "PROFILE_VERIFICATION_REQUEST",
                entityId: updated._id,
                before: { status: request.status, profileStatus: profile.profileStatus },
                after: {
                    verificationReference: updated.verificationReference,
                    status: updated.status,
                    reasonCode: updated.adminReviewReasonCode,
                    ...(updated.adminReviewReason ? { reason: updated.adminReviewReason } : {}),
                    profileStatus: profile.profileStatus,
                },
                session,
            });
            outcome = { request: updated, replayed: false };
        });
        if (!outcome)
            throw new AppError_1.AppError("Profile verification escalation did not complete", 500);
        return outcome;
    }
    finally {
        await session.endSession();
    }
};
exports.escalateProfileVerificationRequest = escalateProfileVerificationRequest;
const decideProfileVerificationRequest = async (input) => {
    if (!mongoose_1.default.Types.ObjectId.isValid(input.profileId))
        throw new AppError_1.AppError("Invalid profileId", 400);
    if (input.authority === "ADMIN" && (!input.decidedBy || !mongoose_1.default.Types.ObjectId.isValid(input.decidedBy))) {
        throw new AppError_1.AppError("Admin identity is required", 400);
    }
    if (input.authority === "AI" && input.decidedBy)
        throw new AppError_1.AppError("AI decisions cannot have an admin identity", 400);
    if (input.decision === "REJECT" && (!input.reason || !input.reason.trim())) {
        throw new AppError_1.AppError("Rejection reason is required", 400);
    }
    const profileObjectId = new mongoose_1.default.Types.ObjectId(input.profileId);
    const session = await mongoose_1.default.startSession();
    try {
        let outcome = null;
        await session.withTransaction(async () => {
            const profile = await userProfile_model_1.UserProfile.findById(profileObjectId).session(session);
            if (!profile)
                throw new AppError_1.AppError("Profile not found", 404);
            const active = await (0, exports.ensureLegacyPendingProfileVerificationRequest)(profile, session);
            const request = active?.request ?? await profileVerificationRequest_repository_1.profileVerificationRequestRepository.findActiveByProfileId(profile._id, session);
            if (!request) {
                const latest = await profileVerificationRequest_repository_1.profileVerificationRequestRepository.findLatestByProfileId(profile._id, session);
                if (!latest)
                    throw new AppError_1.AppError("Profile verification request not found", 409);
                if (latest.decision === input.decision) {
                    outcome = { request: latest, replayed: true };
                    return;
                }
                throw new AppError_1.AppError(latest.status === "EXPIRED" ? "Verification attempt expired; fresh submission required" : "Profile verification decision is already final", 409);
            }
            const now = new Date();
            const updated = await profileVerificationRequest_repository_1.profileVerificationRequestRepository.transitionToTerminal({
                requestId: request._id,
                decision: input.decision,
                authority: input.authority,
                reason: input.decision === "REJECT" ? input.reason?.trim() : undefined,
                decidedBy: input.decidedBy ? new mongoose_1.default.Types.ObjectId(input.decidedBy) : undefined,
                decidedAt: now,
                retentionDeadline: requestRetentionDeadline(request),
                session,
            });
            if (!updated) {
                const latest = await profileVerificationRequest_repository_1.profileVerificationRequestRepository.findLatestByProfileId(profile._id, session);
                if (latest?.decision === input.decision) {
                    outcome = { request: latest, replayed: true };
                    return;
                }
                throw new AppError_1.AppError(latest?.status === "EXPIRED" ? "Verification attempt expired; fresh submission required" : "Profile verification decision is already final", 409);
            }
            profile.profileStatus = input.decision === "APPROVE" ? "verified" : "rejected";
            profile.rejectionReason = input.decision === "REJECT" ? input.reason.trim() : "";
            await profile.save({ session });
            await (0, auditLog_service_1.createAuditLog)({
                actorType: input.authority === "ADMIN" ? "ADMIN" : "SYSTEM",
                actorId: input.decidedBy ? new mongoose_1.default.Types.ObjectId(input.decidedBy) : undefined,
                actorReference: input.authority === "AI" ? "PROFILE_VERIFICATION_AI" : undefined,
                action: input.decision === "APPROVE" ? "PROFILE_VERIFICATION_APPROVED" : "PROFILE_VERIFICATION_REJECTED",
                entityType: "PROFILE_VERIFICATION_REQUEST",
                entityId: updated._id,
                before: { status: request.status, profileStatus: "pending_verification" },
                after: {
                    verificationReference: updated.verificationReference,
                    status: updated.status,
                    decisionAuthority: updated.decisionAuthority,
                    profileStatus: profile.profileStatus,
                    ...(input.decision === "REJECT" ? { reason: profile.rejectionReason } : {}),
                },
                session,
            });
            outcome = { request: updated, replayed: false };
        });
        if (!outcome)
            throw new AppError_1.AppError("Profile verification decision did not complete", 500);
        const resolvedOutcome = outcome;
        if (!resolvedOutcome.replayed)
            await (0, faceVerificationEvidenceCleanup_service_1.scheduleFaceEvidenceRetentionForDecision)(resolvedOutcome.request._id, input.decision, resolvedOutcome.request.decidedAt ?? new Date());
        return resolvedOutcome;
    }
    finally {
        await session.endSession();
    }
};
exports.decideProfileVerificationRequest = decideProfileVerificationRequest;
/** Reconciles the non-punitive maximum biometric-retention lifecycle. */
const expireProfileVerificationRequests = async (now = new Date()) => {
    const active = await profileVerificationRequest_repository_1.profileVerificationRequestRepository.listActive();
    let expired = 0;
    for (const request of active) {
        const deadline = requestRetentionDeadline(request);
        if (deadline.getTime() > now.getTime())
            continue;
        const updated = await profileVerificationRequest_repository_1.profileVerificationRequestRepository.transitionToExpired({ requestId: request._id, now, retentionDeadline: deadline });
        if (!updated)
            continue;
        const profile = await userProfile_model_1.UserProfile.findById(updated.profileId);
        if (profile) {
            profile.profileStatus = "incomplete";
            profile.rejectionReason = "";
            await profile.save();
        }
        const cleanupAfter = new Date(Math.min(deadline.getTime(), now.getTime() + faceVerification_constants_1.FACE_VERIFICATION_SHORT_CLEANUP_MS));
        const invalidated = await faceVerificationSession_repository_1.faceVerificationSessionRepository.invalidateForRequestRetentionExpiry({ requestId: updated._id, now, cleanupAfter });
        if (invalidated)
            await faceVerificationEvidence_repository_1.faceVerificationEvidenceRepository.setCleanupForSession(invalidated._id, cleanupAfter);
        await (0, auditLog_service_1.createAuditLog)({
            actorType: "SYSTEM", actorReference: "BIOMETRIC_RETENTION_EXPIRED", action: "PROFILE_VERIFICATION_EXPIRED",
            entityType: "PROFILE_VERIFICATION_REQUEST", entityId: updated._id,
            before: { status: request.status, profileStatus: "pending_verification" },
            after: { verificationReference: updated.verificationReference, status: updated.status, expiredAt: updated.expiredAt, submissionVersion: updated.profileSubmissionVersion },
        });
        expired += 1;
    }
    return { expired };
};
exports.expireProfileVerificationRequests = expireProfileVerificationRequests;
