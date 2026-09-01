import { Types } from "mongoose";

import { ProfileVerificationRequestDocument } from "../../models/profileVerificationRequest.model";
import { ProfileVerificationLifecycleStage } from "../../services/profile/profileVerificationLifecycle.service";
import { ProfileVerificationJobDocument } from "../../models/profileVerificationJob.model";

export interface AdminProfileVerificationQueueDto {
  _id: string;
  username: string;
  dateOfBirth: Date;
  bio: string;
  avatar: string;
  cover: string;
  interests: string[];
  profilePhotos: string[];
  profileStatus: "pending_verification";
  verificationSubmittedAt: Date | null;
  createdAt: Date;
  userId: { _id: string; email: string };
  verificationRequest: {
    verificationReference: string;
    status: ProfileVerificationRequestDocument["status"];
    attemptNumber: number;
    profileSubmissionVersion: number;
    submittedAt: Date;
    adminReviewRequiredAt: Date | null;
    adminReviewReasonCode: string | null;
    adminReviewReason: string | null;
    lifecycleStage: ProfileVerificationLifecycleStage;
    job: { status: ProfileVerificationJobDocument["status"]; attemptCount: number; maxRetryCount: number } | null;
  };
}

export interface ProfileVerificationQueueProfileSource {
  _id: Types.ObjectId;
  username: string;
  dateOfBirth: Date;
  bio: string;
  avatar: string;
  cover: string;
  interests: string[];
  profilePhotos: string[];
  profileStatus: "pending_verification";
  verificationSubmittedAt?: Date | null;
  createdAt: Date;
  userId: { _id: Types.ObjectId; email?: string };
}

export const toAdminProfileVerificationQueueDto = (
  request: ProfileVerificationRequestDocument,
  profile: ProfileVerificationQueueProfileSource,
  lifecycleStage: ProfileVerificationLifecycleStage,
  job: ProfileVerificationJobDocument | undefined,
): AdminProfileVerificationQueueDto => ({
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
    lifecycleStage,
    job: job ? { status: job.status, attemptCount: job.attemptCount, maxRetryCount: job.maxRetryCount } : null,
  },
});
