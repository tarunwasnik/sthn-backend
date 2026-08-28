"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toAdminProfileVerificationQueueDto = void 0;
const toAdminProfileVerificationQueueDto = (request, profile) => ({
    _id: String(profile._id),
    username: profile.username,
    dateOfBirth: profile.dateOfBirth,
    bio: profile.bio,
    avatar: profile.avatar,
    cover: profile.cover,
    interests: profile.interests,
    profilePhotos: profile.profilePhotos,
    profileStatus: profile.profileStatus,
    verificationSubmittedAt: profile.verificationSubmittedAt ?? null,
    createdAt: profile.createdAt,
    userId: { _id: String(profile.userId._id), email: profile.userId.email ?? "" },
    verificationRequest: {
        verificationReference: request.verificationReference,
        status: request.status,
        attemptNumber: request.attemptNumber,
        profileSubmissionVersion: request.profileSubmissionVersion,
        submittedAt: request.submittedAt,
        adminReviewRequiredAt: request.adminReviewRequiredAt ?? null,
        adminReviewReasonCode: request.adminReviewReasonCode ?? null,
        adminReviewReason: request.adminReviewReason ?? null,
    },
});
exports.toAdminProfileVerificationQueueDto = toAdminProfileVerificationQueueDto;
