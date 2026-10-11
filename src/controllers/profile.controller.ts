// backend/src/controllers/profile.controller.ts

import { Request, Response } from "express";
import { UserProfile, UserProfileDocument } from "../models/userProfile.model";
import User from "../models/User";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";
import { calculateAge } from "../utils/calculateAge";
import { migrateLegacyProfileMobileContact } from "../services/profile/legacyMobileContactMigration.service";
import { ensureActiveProfileVerificationRequest } from "../services/profile/profileVerificationRequest.service";
import { selectNewProfileVerificationPolicy } from "../services/profile/profileVerificationPolicy.service";
import { requireProfilePhotoCountForVerificationPolicy } from "../services/profile/profileVerificationSubmittedMedia.service";
import { ensureProfileVerificationJob } from "../services/profile/profileVerificationJob.service";
import { bindCompletedFaceSessionToVerificationRequest, invalidateFaceSessionsForAvatar, requireCompletedFaceSessionForInitialSubmission, requireCompletedFaceSessionForRejectedResubmission, resolveRejectedResubmissionAvatarCandidate } from "../services/profile/faceVerificationSession.service";
import type { FaceVerificationAvatarCandidate } from "../models/faceVerificationSession.model";
import { profileVerificationRequestRepository } from "../repositories/profileVerificationRequest.repository";
import { profileVerificationJobRepository } from "../repositories/profileVerificationJob.repository";
import { profileVerificationInferenceResultRepository } from "../repositories/profileVerificationInferenceResult.repository";
import { deriveProfileVerificationLifecycleStage } from "../services/profile/profileVerificationLifecycle.service";
import { fingerprintTextModerationPayload, normalizeUserProfileModerationPayload } from "../services/textModeration/textModerationNormalization.service";
import { requireTextModerationAdmission } from "../services/textModeration/textModerationAdmission.service";
import { Types } from "mongoose";
import { parseProfileMediaAdmissionRequest } from "../services/profile/profileImageAdmissionContract";
import { ProfileMediaAdmissionPersistenceError, profileMediaAdmissionPersistenceService } from "../services/profile/profileMediaAdmissionPersistence.service";
import { imageAdmissionService } from "../services/imageModeration/imageAdmission.service";
import { ProfileSubmissionAccountAction, ProfileSubmissionAccountPersistenceError, profileSubmissionAccountPersistenceService } from "../services/profile/profileSubmissionAccountPersistence.service";
import { faceVerificationEvidenceRepository } from "../repositories/faceVerificationEvidence.repository";

const requireText = (value: unknown, field: string, maxLength: number): string => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new AppError(`Invalid ${field}`, 400);
  }
  return value.trim();
};

const optionalText = (value: unknown, field: string, maxLength: number): string | undefined => {
  if (value === undefined) return undefined;
  return requireText(value, field, maxLength);
};

const normalizeStringArray = (value: unknown, field: string, maxItems: number): string[] => {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new AppError(`Invalid ${field}`, 400);
  }
  const normalized = value.map((item) => requireText(item, field, 80));
  return [...new Set(normalized)];
};

const parseDateOfBirth = (value: unknown): Date => {
  if (typeof value !== "string" || !value.trim()) throw new AppError("Invalid date of birth", 400);
  const dateOfBirth = new Date(value);
  if (Number.isNaN(dateOfBirth.getTime()) || calculateAge(dateOfBirth) < 18) {
    throw new AppError("Minimum age is 18", 403);
  }
  return dateOfBirth;
};

const normalizeMobileCountryCode = (value: unknown): string => {
  const countryCode = requireText(value, "mobile country code", 5);
  if (!/^\+[1-9]\d{0,3}$/.test(countryCode)) throw new AppError("Invalid mobile country code", 400);
  return countryCode;
};

const normalizeMobileNumber = (value: unknown): string => {
  const mobileNumber = requireText(value, "mobile number", 15).replace(/[\s-]/g, "");
  if (!/^\d{6,15}$/.test(mobileNumber)) throw new AppError("Invalid mobile number", 400);
  return mobileNumber;
};

const normalizeOnboardingDraft = (body: Record<string, unknown>) => ({
  username: requireText(body.username, "username", 40).toLowerCase(),
  realName: requireText(body.realName, "real name", 120),
  dateOfBirth: parseDateOfBirth(body.dateOfBirth),
  mobileCountryCode: normalizeMobileCountryCode(body.mobileCountryCode),
  mobileNumber: normalizeMobileNumber(body.mobileNumber),
  country: requireText(body.country, "country", 100),
  city: requireText(body.city, "city", 100),
  languages: normalizeStringArray(body.languages, "languages", 12),
  interests: normalizeStringArray(body.interests ?? [], "interests", 20),
  bio: requireText(body.bio, "bio", 2000),
});

const persistProfileVerificationTransaction = async (input: {
  session: import("mongoose").ClientSession;
  actorId: Types.ObjectId;
  profile: UserProfileDocument;
  previousProfile?: Readonly<Record<string, unknown>>;
  action: ProfileSubmissionAccountAction;
  createsVerificationAuthority: boolean;
  avatarCandidate?: FaceVerificationAvatarCandidate;
}) => {
  if (input.createsVerificationAuthority) {
    const expectedVersion = ((input.previousProfile?.verificationSubmissionVersion as number | undefined) ?? 0) + 1;
    if (input.profile.profileStatus !== "pending_verification" || input.profile.verificationSubmissionVersion !== expectedVersion) {
      throw new AppError("Profile submission lifecycle is stale", 409);
    }
    const verificationRequest = await ensureActiveProfileVerificationRequest(input.profile, input.session);
    await ensureProfileVerificationJob(verificationRequest.request, input.session);
    const bound = await bindCompletedFaceSessionToVerificationRequest({ profile: input.profile, requestId: verificationRequest.request._id, session: input.session, actorId: input.actorId, avatarCandidate: input.avatarCandidate, previousAvatar: input.previousProfile?.avatar as string | undefined });
    if (!bound) throw new AppError("Completed face verification session is no longer eligible", 409);
    const boundEvidence = await faceVerificationEvidenceRepository.countStoredBoundToRequest(bound._id, verificationRequest.request._id, input.session);
    if (boundEvidence !== 5) throw new AppError("Completed face verification evidence is no longer eligible", 409);
  }
  await invalidateFaceSessionsForAvatar(input.profile, input.session);
  await profileSubmissionAccountPersistenceService.persist({ session: input.session, actorId: input.actorId, action: input.action });
};

/**
 * Persists a complete ordinary-media onboarding draft before pre-capture
 * verification. It intentionally creates no verification authority.
 */
export const saveMyOnboardingDraft = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const draft = normalizeOnboardingDraft(req.body);
  let media;
  try {
    media = parseProfileMediaAdmissionRequest(req.body);
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : "Invalid image admission request", 400);
  }
  if (!media.avatar || !media.cover || !media.profilePhotos) {
    throw new AppError("Onboarding draft requires avatar, cover, and profilePhotos admission claims", 400);
  }
  if (!Types.ObjectId.isValid(userId)) throw new AppError("Invalid authenticated user", 401);
  const actorId = new Types.ObjectId(userId);
  let profile = await UserProfile.findOne({ userId });
  if (profile && profile.profileStatus !== "incomplete") {
    throw new AppError("Profile is not eligible for onboarding draft save", 409);
  }
  const existingUsername = await UserProfile.findOne({
    username: draft.username,
    ...(profile ? { _id: { $ne: profile._id } } : {}),
  });
  if (existingUsername) throw new AppError("Username already taken", 409);

  const profileFields = {
    username: draft.username,
    realName: draft.realName,
    dateOfBirth: draft.dateOfBirth,
    country: draft.country,
    city: draft.city,
    languages: draft.languages,
    interests: draft.interests,
    bio: draft.bio,
  };
  try {
    const persisted = await profileMediaAdmissionPersistenceService.persist({
      actorId,
      media,
      createProfile: profile ? undefined : profileFields,
      profileFields: profile ? profileFields : undefined,
      mobileContact: { mobileCountryCode: draft.mobileCountryCode, mobileNumber: draft.mobileNumber },
      allowedExistingProfileStatuses: ["incomplete"],
    });
    profile = await UserProfile.findById(persisted.profileId);
  } catch (error) {
    if (error instanceof ProfileMediaAdmissionPersistenceError) {
      const statusCode = error.code === "PROFILE_MEDIA_PROFILE_NOT_ELIGIBLE" || error.code === "PROFILE_MEDIA_VERSION_CONFLICT" ? 409 : error.code === "PROFILE_MEDIA_ACCOUNT_NOT_FOUND" ? 404 : 400;
      throw new AppError(error.message, statusCode, error.code);
    }
    throw error;
  }
  if (!profile) throw new AppError("Profile persistence failed", 500);
  // The migration only clears legacy duplicate fields. Contact values above were committed atomically.
  await migrateLegacyProfileMobileContact(userId);
  res.status(200).json({ message: "Onboarding draft saved", profileStatus: profile.profileStatus, profile });
});

/* ================= CREATE / UPDATE PROFILE ================= */

export const upsertProfile = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const {
    username,
    realName,
    dateOfBirth,
    mobileCountryCode,
    mobileNumber,
    country,
    city,
    languages,
    interests,
    bio,
    profilePhotos,
    avatar,
    cover,
  } = req.body;

  if (!Types.ObjectId.isValid(userId)) throw new AppError("Invalid authenticated user", 401);
  const actorId = new Types.ObjectId(userId);
  let profile = await UserProfile.findOne({ userId: actorId });
  const isFirstSubmission = !profile || profile.profileStatus === "incomplete";

  if (profile?.profileStatus === "pending_verification") {
    throw new AppError("Profile is pending verification and cannot be edited", 409);
  }

  const moderatedText = normalizeUserProfileModerationPayload({ bio, interests });
  requireTextModerationAdmission({
    token: req.body.textModerationAdmission,
    domain: moderatedText.domain,
    userId,
    fingerprint: fingerprintTextModerationPayload(moderatedText),
  });

  let media;
  try {
    media = parseProfileMediaAdmissionRequest(req.body);
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : "Invalid image admission request", 400);
  }
  if (!media.avatar || !media.cover || !media.profilePhotos) {
    throw new AppError("Profile submission requires avatar, cover, and profilePhotos admission claims", 400);
  }
  requireProfilePhotoCountForVerificationPolicy(media.profilePhotos.map(() => "media-claim"), selectNewProfileVerificationPolicy());

  const resolveProposedAvatar = async () => {
    if (media.avatar!.kind === "UNCHANGED") {
      if (!profile || !(await imageAdmissionService.isGrandfatheredUnchangedReference({
        currentStoredReference: profile.avatar,
        submittedReference: media.avatar!.reference,
      }))) throw new AppError("Avatar unchanged reference is not valid for this profile", 400);
      return media.avatar!.reference;
    }
    try {
      return (await imageAdmissionService.resolveAdmissionReferenceForPreflight({
        admissionReference: media.avatar!.admissionReference,
        actorId,
        expectedSurface: "USER_PROFILE_AVATAR",
      })).trustedMediaReference;
    } catch {
      throw new AppError("Avatar image admission is not eligible", 400);
    }
  };
  const rejectedAvatarAuthority = profile?.profileStatus === "rejected"
    ? await resolveRejectedResubmissionAvatarCandidate({ actorId, profile, claim: media.avatar })
    : undefined;
  const proposedAvatar = rejectedAvatarAuthority?.avatar ?? await resolveProposedAvatar();
  const submittedAt = new Date();
  const lifecycle = isFirstSubmission
    ? { kind: "SUBMIT_INITIAL_OR_INCOMPLETE" as const, submittedAt }
    : profile?.profileStatus === "rejected"
      ? { kind: "RESUBMIT_REJECTED" as const, submittedAt }
      : undefined;

  if (isFirstSubmission) await requireCompletedFaceSessionForInitialSubmission({ userId, avatar: proposedAvatar });
  if (profile?.profileStatus === "rejected") await requireCompletedFaceSessionForRejectedResubmission({ userId, avatar: proposedAvatar, avatarCandidate: rejectedAvatarAuthority?.avatarCandidate });

  let createProfile;
  let profileFields: Record<string, unknown> = {};
  let mobileContact: { mobileCountryCode: string; mobileNumber: string } | undefined;
  if (isFirstSubmission) {
    const normalizedUsername = requireText(username, "username", 40).toLowerCase();
    const normalizedRealName = requireText(realName, "real name", 120);
    const dob = parseDateOfBirth(dateOfBirth);
    const normalizedCountryCode = normalizeMobileCountryCode(mobileCountryCode);
    const normalizedMobileNumber = normalizeMobileNumber(mobileNumber);
    const normalizedCountry = requireText(country, "country", 100);
    const normalizedCity = requireText(city, "city", 100);
    const normalizedLanguages = normalizeStringArray(languages, "languages", 12);
    const normalizedBio = requireText(bio, "bio", 2000);

    const existingUsername = await UserProfile.findOne({
      username: normalizedUsername,
      ...(profile ? { _id: { $ne: profile._id } } : {}),
    });

    if (existingUsername) {
      throw new AppError("Username already taken", 409);
    }

    const firstSubmission = {
      username: normalizedUsername,
      realName: normalizedRealName,
      dateOfBirth: dob,
      country: normalizedCountry,
      city: normalizedCity,
      languages: normalizedLanguages,
      interests: moderatedText.interests,
      bio: normalizedBio,
    };
    createProfile = profile ? undefined : firstSubmission;
    profileFields = profile ? firstSubmission : {};
    mobileContact = { mobileCountryCode: normalizedCountryCode, mobileNumber: normalizedMobileNumber };
  } else {
    if (!profile) throw new AppError("Profile not found", 404);
    if (username && username !== profile.username) {
      throw new AppError("Username cannot be changed", 400);
    }

    if (dateOfBirth !== undefined) {
      profileFields.dateOfBirth = parseDateOfBirth(dateOfBirth);
    }

    if (bio !== undefined) {
      profileFields.bio = moderatedText.bio;
    }

    if (interests !== undefined) {
      profileFields.interests = moderatedText.interests;
    }

    const normalizedRealName = optionalText(realName, "real name", 120);
    if (normalizedRealName !== undefined) profileFields.realName = normalizedRealName;
    const normalizedCountry = optionalText(country, "country", 100);
    if (normalizedCountry !== undefined) profileFields.country = normalizedCountry;
    const normalizedCity = optionalText(city, "city", 100);
    if (normalizedCity !== undefined) profileFields.city = normalizedCity;
    if (languages !== undefined) profileFields.languages = normalizeStringArray(languages, "languages", 12);
  }

  let committedProfileId: Types.ObjectId | undefined;
  try {
    const persisted = await profileMediaAdmissionPersistenceService.persist({
      actorId,
      media,
      createProfile,
      profileFields,
      lifecycle,
      mobileContact: undefined,
      allowedExistingProfileStatuses: isFirstSubmission ? ["incomplete"] : profile?.profileStatus === "rejected" ? ["rejected"] : ["verified"],
      withinTransaction: async ({ session, profile: current, previousProfile }) => {
        await persistProfileVerificationTransaction({
          session,
          actorId,
          profile: current,
          previousProfile,
          action: isFirstSubmission
            ? { kind: "FIRST_SUBMISSION", mobileContact: mobileContact! }
            : lifecycle
              ? { kind: "REJECTED_RESUBMISSION" }
              : { kind: "VERIFIED_EDIT" },
          createsVerificationAuthority: Boolean(lifecycle),
          avatarCandidate: rejectedAvatarAuthority?.avatarCandidate,
        });
        committedProfileId = current._id;
      },
    });
    committedProfileId = persisted.profileId;
  } catch (error) {
    if (error instanceof ProfileMediaAdmissionPersistenceError) {
      const statusCode = error.code === "PROFILE_MEDIA_PROFILE_NOT_ELIGIBLE" || error.code === "PROFILE_MEDIA_VERSION_CONFLICT" || error.code === "PROFILE_MEDIA_INVALID_LIFECYCLE" ? 409 : error.code === "PROFILE_MEDIA_ACCOUNT_NOT_FOUND" ? 404 : 400;
      throw new AppError(error.message, statusCode, error.code);
    }
    if (error instanceof ProfileSubmissionAccountPersistenceError) {
      throw new AppError(error.message, error.code === "ACCOUNT_NOT_FOUND" ? 404 : error.code === "INVALID_CONTACT" ? 400 : 409, error.code);
    }
    throw error;
  }
  profile = committedProfileId ? await UserProfile.findById(committedProfileId) : null;
  if (!profile) throw new AppError("Profile persistence failed", 500);

  res.status(200).json({
    message: "Profile saved successfully",
    profileStatus: profile.profileStatus,
    profile,
  });
});

/* ================= GET PROFILE ================= */

export const getMyProfile = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  await migrateLegacyProfileMobileContact(userId);

  const profile = await UserProfile.findOne({ userId });

  if (!profile) {
    const account = await User.findById(userId).select("mobileCountryCode mobileNumber").lean();
    res.json({
      username: "",
      realName: null,
      dateOfBirth: null,
      country: null,
      city: null,
      languages: [],
      interests: [],
      bio: "",
      avatar: "",
      cover: "",
      profilePhotos: [],
      profileStatus: "incomplete",
      rejectionReason: "",
      verificationSubmissionVersion: 0,
      age: null,
      mobileCountryCode: account?.mobileCountryCode ?? null,
      mobileNumber: account?.mobileNumber ?? null,
      verification: { stage: "NOT_SUBMITTED", submittedAt: null },
    });
    return;
  }

  const age = profile.dateOfBirth
    ? calculateAge(new Date(profile.dateOfBirth))
    : null;
  const account = await User.findById(userId).select("mobileCountryCode mobileNumber").lean();
  const request = await profileVerificationRequestRepository.findActiveByProfileId(profile._id);
  const job = request ? await profileVerificationJobRepository.findByRequestId(request._id) : null;
  const inference = request && job?.status === "COMPLETED"
    ? await profileVerificationInferenceResultRepository.findAnyByRequestId(request._id)
    : null;
  const verification = {
    stage: deriveProfileVerificationLifecycleStage({
      profileStatus: profile.profileStatus,
      requestStatus: request?.status,
      jobStatus: job?.status,
      hasCompletedInference: Boolean(inference),
    }),
    submittedAt: request?.submittedAt ?? profile.verificationSubmittedAt ?? null,
  };

  res.json({
    ...profile.toObject(),
    age,
    mobileCountryCode: account?.mobileCountryCode ?? null,
    mobileNumber: account?.mobileNumber ?? null,
    verification,
  });
});

/* ================= EDIT PROFILE ================= */

export const updateMyProfile = catchAsync(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const {
      realName,
      bio,
      interests,
      dateOfBirth,
      country,
      city,
      languages,
      profilePhotos,
      avatar,
      cover,
    } = req.body;

    const profile = await UserProfile.findOne({ userId });

    if (!profile) {
      throw new AppError("Profile not found", 404);
    }

    const usesAdmissionBackedPersistence = profile.profileStatus === "incomplete" || profile.profileStatus === "verified";
    const usesTransactionalRejectedResubmission = profile.profileStatus === "rejected";
    if (!usesAdmissionBackedPersistence && !usesTransactionalRejectedResubmission) await migrateLegacyProfileMobileContact(userId);

    if (profile.profileStatus === "pending_verification") {
      throw new AppError("Profile is pending verification and cannot be edited", 409);
    }

    const moderatedText = bio !== undefined || interests !== undefined
      ? normalizeUserProfileModerationPayload({
        bio: bio === undefined ? profile.bio : bio,
        interests: interests === undefined ? profile.interests : interests,
      })
      : null;
    if (moderatedText) {
      requireTextModerationAdmission({
        token: req.body.textModerationAdmission,
        domain: moderatedText.domain,
        userId,
        fingerprint: fingerprintTextModerationPayload(moderatedText),
      });
    }

    if (usesAdmissionBackedPersistence) {
      let media;
      try {
        media = parseProfileMediaAdmissionRequest(req.body);
      } catch (error) {
        throw new AppError(error instanceof Error ? error.message : "Invalid image admission request", 400);
      }

      const profileFields: Record<string, unknown> = {};
      if (bio !== undefined) profileFields.bio = moderatedText!.bio;
      if (interests !== undefined) profileFields.interests = moderatedText!.interests;
      if (dateOfBirth !== undefined) profileFields.dateOfBirth = parseDateOfBirth(dateOfBirth);
      const normalizedRealName = optionalText(realName, "real name", 120);
      if (normalizedRealName !== undefined) profileFields.realName = normalizedRealName;
      const normalizedCountry = optionalText(country, "country", 100);
      if (normalizedCountry !== undefined) profileFields.country = normalizedCountry;
      const normalizedCity = optionalText(city, "city", 100);
      if (normalizedCity !== undefined) profileFields.city = normalizedCity;
      if (languages !== undefined) profileFields.languages = normalizeStringArray(languages, "languages", 12);

      try {
        const persisted = await profileMediaAdmissionPersistenceService.persist({
          actorId: profile.userId,
          expectedProfileVersion: profile.__v ?? 0,
          media,
          profileFields,
          allowedExistingProfileStatuses: [profile.profileStatus],
          withinTransaction: async ({ session, profile: current }) => {
            await persistProfileVerificationTransaction({
              session,
              actorId: profile.userId,
              profile: current,
              action: { kind: profile.profileStatus === "incomplete" ? "INCOMPLETE_EDIT" : "VERIFIED_EDIT" },
              createsVerificationAuthority: false,
            });
          },
        });
        const updated = await UserProfile.findById(persisted.profileId);
        if (!updated) throw new AppError("Profile persistence failed", 500);
        res.status(200).json({
          message: "Profile updated successfully",
          profile: updated,
        });
        return;
      } catch (error) {
        if (error instanceof ProfileMediaAdmissionPersistenceError) {
          const statusCode = error.code === "PROFILE_MEDIA_PROFILE_NOT_ELIGIBLE" || error.code === "PROFILE_MEDIA_VERSION_CONFLICT" ? 409 : error.code === "PROFILE_MEDIA_ACCOUNT_NOT_FOUND" ? 404 : 400;
          throw new AppError(error.message, statusCode, error.code);
        }
        if (error instanceof ProfileSubmissionAccountPersistenceError) {
          throw new AppError(error.message, error.code === "ACCOUNT_NOT_FOUND" ? 404 : error.code === "INVALID_CONTACT" ? 400 : 409, error.code);
        }
        throw error;
      }
    }

    if (profile.profileStatus === "rejected") {
      let media;
      try {
        media = parseProfileMediaAdmissionRequest(req.body);
      } catch (error) {
        throw new AppError(error instanceof Error ? error.message : "Invalid image admission request", 400);
      }
      const avatarClaim = media.avatar ?? { kind: "UNCHANGED" as const, reference: profile.avatar };
      const rejectedAvatarAuthority = await resolveRejectedResubmissionAvatarCandidate({ actorId: profile.userId, profile, claim: avatarClaim });
      await requireCompletedFaceSessionForRejectedResubmission({ userId, avatar: rejectedAvatarAuthority.avatar, avatarCandidate: rejectedAvatarAuthority.avatarCandidate });
      const nextProfilePhotos = media.profilePhotos ?? profile.profilePhotos.map((reference) => ({ kind: "UNCHANGED" as const, reference }));
      requireProfilePhotoCountForVerificationPolicy(nextProfilePhotos.map(() => "media-claim"), selectNewProfileVerificationPolicy());

      const profileFields: Record<string, unknown> = {};
      if (bio !== undefined) profileFields.bio = moderatedText!.bio;
      if (interests !== undefined) profileFields.interests = moderatedText!.interests;
      if (dateOfBirth !== undefined) profileFields.dateOfBirth = parseDateOfBirth(dateOfBirth);
      const normalizedRealName = optionalText(realName, "real name", 120);
      if (normalizedRealName !== undefined) profileFields.realName = normalizedRealName;
      const normalizedCountry = optionalText(country, "country", 100);
      if (normalizedCountry !== undefined) profileFields.country = normalizedCountry;
      const normalizedCity = optionalText(city, "city", 100);
      if (normalizedCity !== undefined) profileFields.city = normalizedCity;
      if (languages !== undefined) profileFields.languages = normalizeStringArray(languages, "languages", 12);

      try {
        const persisted = await profileMediaAdmissionPersistenceService.persist({
          actorId: profile.userId,
          expectedProfileVersion: profile.__v ?? 0,
          media,
          profileFields,
          lifecycle: { kind: "RESUBMIT_REJECTED", submittedAt: new Date() },
          allowedExistingProfileStatuses: ["rejected"],
          withinTransaction: async ({ session, profile: current, previousProfile }) => {
            await persistProfileVerificationTransaction({
              session,
              actorId: profile.userId,
              profile: current,
              previousProfile,
              action: { kind: "REJECTED_RESUBMISSION" },
              createsVerificationAuthority: true,
              avatarCandidate: rejectedAvatarAuthority.avatarCandidate,
            });
          },
        });
        const updated = await UserProfile.findById(persisted.profileId);
        if (!updated) throw new AppError("Profile persistence failed", 500);
        res.status(200).json({ message: "Profile updated successfully", profile: updated });
        return;
      } catch (error) {
        if (error instanceof ProfileMediaAdmissionPersistenceError) {
          const statusCode = error.code === "PROFILE_MEDIA_PROFILE_NOT_ELIGIBLE" || error.code === "PROFILE_MEDIA_VERSION_CONFLICT" || error.code === "PROFILE_MEDIA_INVALID_LIFECYCLE" ? 409 : error.code === "PROFILE_MEDIA_ACCOUNT_NOT_FOUND" ? 404 : 400;
          throw new AppError(error.message, statusCode, error.code);
        }
        if (error instanceof ProfileSubmissionAccountPersistenceError) {
          throw new AppError(error.message, error.code === "ACCOUNT_NOT_FOUND" ? 404 : error.code === "INVALID_CONTACT" ? 400 : 409, error.code);
        }
        throw error;
      }
    }
    throw new AppError("Profile is not eligible for editing", 409);
  },
);
