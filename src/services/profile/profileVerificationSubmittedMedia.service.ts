import crypto from "node:crypto";

import { ProfileVerificationInferenceError } from "../../errors/profile/ProfileVerificationInferenceError";
import { AppError } from "../../utils/AppError";
import {
  ProfileVerificationRequestDocument,
  ProfileVerificationPolicy,
  ProfileVerificationSubmittedMediaItem,
  ProfileVerificationSubmittedMediaSnapshot,
} from "../../models/profileVerificationRequest.model";

type SubmittedProfileMediaSource = {
  avatar: string;
  cover: string;
  profilePhotos: string[];
};

export const PROFILE_GALLERY_MIN_COUNT = 2;
export const PROFILE_GALLERY_MAX_COUNT = 6;

export const requireProfilePhotoCountForVerificationPolicy = (
  profilePhotos: readonly string[],
  policy: ProfileVerificationPolicy,
) => {
  // Avatar and cover are separate mandatory media. Every policy accepts the
  // same admitted gallery range, including V3; the former exact-six rule
  // incorrectly rejected otherwise valid 2–5 image submissions.
  if (profilePhotos.length < PROFILE_GALLERY_MIN_COUNT || profilePhotos.length > PROFILE_GALLERY_MAX_COUNT) {
    throw new AppError(
      `Profile gallery must contain between ${PROFILE_GALLERY_MIN_COUNT} and ${PROFILE_GALLERY_MAX_COUNT} images for verification`,
      400,
      "PROFILE_PHOTO_COUNT_INVALID",
    );
  }
};

export const fingerprintProfileMediaReference = (reference: string) => (
  crypto.createHash("sha256").update(reference).digest("hex")
);

const item = (
  role: ProfileVerificationSubmittedMediaItem["role"],
  sourceReference: string,
  profilePhotoIndex?: number,
): ProfileVerificationSubmittedMediaItem => ({
  role,
  ...(profilePhotoIndex === undefined ? {} : { profilePhotoIndex }),
  sourceReference,
  fingerprint: fingerprintProfileMediaReference(sourceReference),
});

/** Captures the submitted media references once, before verification work can begin. */
export const createProfileVerificationSubmittedMediaSnapshot = (
  profile: SubmittedProfileMediaSource,
  policy?: ProfileVerificationPolicy,
): ProfileVerificationSubmittedMediaSnapshot => {
  if (!profile.avatar?.trim() || !profile.cover?.trim()
    || !Array.isArray(profile.profilePhotos) || profile.profilePhotos.length < PROFILE_GALLERY_MIN_COUNT || profile.profilePhotos.length > PROFILE_GALLERY_MAX_COUNT
    || profile.profilePhotos.some((photo) => typeof photo !== "string" || !photo.trim())) {
    throw new ProfileVerificationInferenceError("Submitted profile media authority is invalid", "STALE_SUBMISSION", 409);
  }
  if (policy) requireProfilePhotoCountForVerificationPolicy(profile.profilePhotos, policy);
  return {
    avatar: item("AVATAR", profile.avatar),
    cover: item("COVER", profile.cover),
    profilePhotos: profile.profilePhotos.map((photo, index) => item("PROFILE_PHOTO", photo, index)),
  };
};

/**
 * Provides only request-bound media authority. A missing snapshot is a legacy
 * attempt and is intentionally unavailable rather than reconstructed from UserProfile.
 */
export const resolveProfileVerificationSubmittedMediaSnapshot = (input: {
  request: ProfileVerificationRequestDocument;
  userId: string;
  profileId: string;
  profileSubmissionVersion: number;
}) => {
  if (String(input.request.userId) !== input.userId
    || String(input.request.profileId) !== input.profileId
    || input.request.profileSubmissionVersion !== input.profileSubmissionVersion) {
    throw new ProfileVerificationInferenceError("Profile media submission authority is stale", "STALE_SUBMISSION", 409);
  }
  return input.request.submittedMedia
    ? { snapshot: input.request.submittedMedia, noOp: null }
    : { snapshot: null, noOp: "MEDIA_SNAPSHOT_UNAVAILABLE" as const };
};
