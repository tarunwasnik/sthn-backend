"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.profileVerificationRequestRepository = exports.ProfileVerificationRequestRepository = void 0;
const profileVerificationRequest_model_1 = require("../models/profileVerificationRequest.model");
const faceVerification_constants_1 = require("../services/profile/faceVerification.constants");
const activeStatuses = ["PENDING", "PROCESSING", "ADMIN_REVIEW_REQUIRED"];
class ProfileVerificationRequestRepository {
    findActiveByProfileId(profileId, session) {
        return profileVerificationRequest_model_1.ProfileVerificationRequest.findOne({ profileId, isActive: true }).session(session ?? null).exec();
    }
    findLatestByProfileId(profileId, session) {
        return profileVerificationRequest_model_1.ProfileVerificationRequest.findOne({ profileId }).sort({ createdAt: -1, _id: -1 }).session(session ?? null).exec();
    }
    findById(requestId) {
        return profileVerificationRequest_model_1.ProfileVerificationRequest.findById(requestId).exec();
    }
    listActive() {
        return profileVerificationRequest_model_1.ProfileVerificationRequest.find({ isActive: true }).exec();
    }
    countByProfileId(profileId, session) {
        return profileVerificationRequest_model_1.ProfileVerificationRequest.countDocuments({ profileId }).session(session ?? null).exec();
    }
    listActiveByStatuses(statuses) {
        return profileVerificationRequest_model_1.ProfileVerificationRequest.find({ isActive: true, status: { $in: statuses } })
            .sort({ submittedAt: -1, _id: -1 })
            .exec();
    }
    async create(input, session) {
        const [request] = await profileVerificationRequest_model_1.ProfileVerificationRequest.create([{ ...input, status: "PENDING", isActive: true }], session ? { session } : undefined);
        return request;
    }
    transitionToTerminal(input) {
        const terminalStatus = input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
        return profileVerificationRequest_model_1.ProfileVerificationRequest.findOneAndUpdate({ _id: input.requestId, isActive: true, status: { $in: activeStatuses }, decision: { $exists: false }, submittedAt: { $gt: new Date(input.retentionDeadline.getTime() - faceVerification_constants_1.FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS) } }, {
            $set: {
                status: terminalStatus,
                isActive: false,
                decision: input.decision,
                decisionAuthority: input.authority,
                ...(input.reason ? { decisionReason: input.reason } : {}),
                ...(input.decidedBy ? { decidedBy: input.decidedBy } : {}),
                decidedAt: input.decidedAt,
            },
            ...(input.decision === "APPROVE" ? { $unset: { decisionReason: 1 } } : {}),
        }, { new: true, runValidators: true, session: input.session }).exec();
    }
    transitionToExpired(input) {
        return profileVerificationRequest_model_1.ProfileVerificationRequest.findOneAndUpdate({ _id: input.requestId, isActive: true, status: { $in: activeStatuses }, submittedAt: { $lte: input.retentionDeadline } }, { $set: { status: "EXPIRED", isActive: false, expiredAt: input.now } }, { new: true, runValidators: true, session: input.session }).exec();
    }
    transitionToAdminReview(input) {
        return profileVerificationRequest_model_1.ProfileVerificationRequest.findOneAndUpdate({ _id: input.requestId, isActive: true, status: { $in: ["PENDING", "PROCESSING"] }, decision: { $exists: false } }, {
            $set: {
                status: "ADMIN_REVIEW_REQUIRED",
                adminReviewRequiredAt: input.requiredAt,
                adminReviewReasonCode: input.reasonCode,
                ...(input.reason ? { adminReviewReason: input.reason } : {}),
            },
        }, { new: true, runValidators: true, session: input.session }).exec();
    }
    transitionPendingToProcessing(requestId, processingStartedAt) {
        return profileVerificationRequest_model_1.ProfileVerificationRequest.findOneAndUpdate({ _id: requestId, isActive: true, status: "PENDING", decision: { $exists: false } }, { $set: { status: "PROCESSING", processingStartedAt } }, { new: true, runValidators: true }).exec();
    }
}
exports.ProfileVerificationRequestRepository = ProfileVerificationRequestRepository;
exports.profileVerificationRequestRepository = new ProfileVerificationRequestRepository();
