// backend/src/controllers/profile.controller.ts

import { Request, Response } from "express";
import { UserProfile } from "../models/userProfile.model";
import User from "../models/User";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";
import { v2 as cloudinary } from "cloudinary";
import { extractPublicId } from "../utils/extractPublicId";
import { calculateAge } from "../utils/calculateAge";
import { migrateLegacyProfileMobileContact } from "../services/profile/legacyMobileContactMigration.service";
import { ensureActiveProfileVerificationRequest } from "../services/profile/profileVerificationRequest.service";
import { ensureProfileVerificationJob } from "../services/profile/profileVerificationJob.service";
import { bindCompletedFaceSessionToVerificationRequest, invalidateFaceSessionsForAvatar, requireCompletedFaceSessionForInitialSubmission } from "../services/profile/faceVerificationSession.service";

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

const validateProfilePhotos = (value: unknown): string[] => {
  if (!Array.isArray(value) || value.length < 2 || value.length > 6 || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new AppError("Profile must have between 2 and 6 photos", 400);
  }
  return value;
};

/* ================= CREATE / UPDATE PROFILE ================= */

export const upsertProfile = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  await migrateLegacyProfileMobileContact(userId);

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

  let profile = await UserProfile.findOne({ userId });
  const isFirstSubmission = !profile || profile.profileStatus === "incomplete";

  if (profile?.profileStatus === "pending_verification") {
    throw new AppError("Profile is pending verification and cannot be edited", 409);
  }

  /* ================= VALIDATION ================= */

  const validatedProfilePhotos = validateProfilePhotos(profilePhotos);

  const validatedAvatar = requireText(avatar, "avatar", 2048);

  const validatedCover = requireText(cover, "cover", 2048);

  if (isFirstSubmission) {
    await requireCompletedFaceSessionForInitialSubmission({ userId, avatar: validatedAvatar });
  }

  /* ================= CREATE ================= */

  if (!profile || profile.profileStatus === "incomplete") {
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
      userId,
      username: normalizedUsername,
      realName: normalizedRealName,
      dateOfBirth: dob,
      country: normalizedCountry,
      city: normalizedCity,
      languages: normalizedLanguages,
      interests: Array.isArray(interests)
        ? interests
        : interests
          ? [interests]
          : [],
      bio: normalizedBio,
      avatar: validatedAvatar,
      cover: validatedCover,
      profilePhotos: validatedProfilePhotos,
      profileStatus: "pending_verification",
      verificationSubmittedAt: new Date(),
      verificationSubmissionVersion: ((profile?.verificationSubmissionVersion ?? 0) + 1),
    };
    if (profile) {
      Object.assign(profile, firstSubmission);
      await profile.save();
    } else {
      profile = await UserProfile.create(firstSubmission);
    }
  } else {
    /* ================= UPDATE ================= */

    /* 🔥 CLOUDINARY CLEANUP */

    // Avatar
    if (avatar !== undefined && profile.avatar && avatar !== profile.avatar) {
      try {
        const publicId = extractPublicId(profile.avatar);

        if (publicId) {
          await cloudinary.uploader.destroy(publicId);
        }
      } catch (e) {
        console.error("Avatar delete failed:", e);
      }
    }

    // Cover
    if (cover !== undefined && profile.cover && cover !== profile.cover) {
      try {
        const publicId = extractPublicId(profile.cover);

        if (publicId) {
          await cloudinary.uploader.destroy(publicId);
        }
      } catch (e) {
        console.error("Cover delete failed:", e);
      }
    }

    // 🔥 GALLERY (STRICT SAME AS SERVICES)
    if (profilePhotos !== undefined) {
      const oldPhotos = profile.profilePhotos || [];
      const newPhotos = Array.isArray(profilePhotos) ? profilePhotos : [];

      const removedPhotos = oldPhotos.filter(
        (oldUrl) => !newPhotos.includes(oldUrl),
      );

      for (const url of removedPhotos) {
        try {
          const publicId = extractPublicId(url);

          if (publicId) {
            await cloudinary.uploader.destroy(publicId);
          }
        } catch (err) {
          console.error("Gallery delete failed:", err);
        }
      }
    }

    /* ================= ORIGINAL LOGIC ================= */

    if (username && username !== profile.username) {
      throw new AppError("Username cannot be changed", 400);
    }

    if (dateOfBirth !== undefined) {
      profile.dateOfBirth = parseDateOfBirth(dateOfBirth);
    }

    if (bio !== undefined) {
      profile.bio = requireText(bio, "bio", 2000);
    }

    if (interests !== undefined) {
      profile.interests = normalizeStringArray(interests, "interests", 20);
    }

    const normalizedRealName = optionalText(realName, "real name", 120);
    if (normalizedRealName !== undefined) profile.realName = normalizedRealName;
    const normalizedCountry = optionalText(country, "country", 100);
    if (normalizedCountry !== undefined) profile.country = normalizedCountry;
    const normalizedCity = optionalText(city, "city", 100);
    if (normalizedCity !== undefined) profile.city = normalizedCity;
    if (languages !== undefined) profile.languages = normalizeStringArray(languages, "languages", 12);

    if (profilePhotos !== undefined) {
      profile.profilePhotos = validateProfilePhotos(profilePhotos);
    }

    if (avatar !== undefined) {
      profile.avatar = validatedAvatar;
    }

    if (cover !== undefined) {
      profile.cover = validatedCover;
    }

    if (profile.profileStatus === "rejected") {
      profile.profileStatus = "pending_verification";
      profile.rejectionReason = "";
      profile.verificationSubmittedAt = new Date();
      profile.verificationSubmissionVersion = (profile.verificationSubmissionVersion || 0) + 1;
    }

    await profile.save();
  }

  await invalidateFaceSessionsForAvatar(profile);
  if (profile.profileStatus === "pending_verification") {
    const verificationRequest = await ensureActiveProfileVerificationRequest(profile);
    await ensureProfileVerificationJob(verificationRequest.request);
    await bindCompletedFaceSessionToVerificationRequest({ profile, requestId: verificationRequest.request._id });
  }

  /* ================= ACTIVATE USER ================= */

  if (isFirstSubmission) {
    const user = await User.findById(userId);

    if (!user) {
      throw new AppError("User not found", 404);
    }

    if (user.status === "pending_profile") {
      user.status = "active";
    }
    user.mobileCountryCode = normalizeMobileCountryCode(mobileCountryCode);
    user.mobileNumber = normalizeMobileNumber(mobileNumber);
    await user.save();
  }

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

  let profile = await UserProfile.findOne({ userId });

  if (!profile) {
    profile = await UserProfile.create({
      userId,
      username: "",
      bio: "",
      interests: [],
      avatar: "",
      cover: "",
      profilePhotos: [],
      profileStatus: "incomplete",
    });
  }

  const age = profile.dateOfBirth
    ? calculateAge(new Date(profile.dateOfBirth))
    : null;

  res.json({
    ...profile.toObject(),
    age,
  });
});

/* ================= EDIT PROFILE ================= */

export const updateMyProfile = catchAsync(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    await migrateLegacyProfileMobileContact(userId);

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

    if (profile.profileStatus === "pending_verification") {
      throw new AppError("Profile is pending verification and cannot be edited", 409);
    }

    /* 🔥 CLOUDINARY CLEANUP */

    if (avatar !== undefined && profile.avatar && avatar !== profile.avatar) {
      try {
        const publicId = extractPublicId(profile.avatar);

        if (publicId) {
          await cloudinary.uploader.destroy(publicId);
        }
      } catch (e) {
        console.error("Avatar delete failed:", e);
      }
    }

    if (cover !== undefined && profile.cover && cover !== profile.cover) {
      try {
        const publicId = extractPublicId(profile.cover);

        if (publicId) {
          await cloudinary.uploader.destroy(publicId);
        }
      } catch (e) {
        console.error("Cover delete failed:", e);
      }
    }

    if (profilePhotos && Array.isArray(profile.profilePhotos)) {
      const removed = profile.profilePhotos.filter(
        (img) => !profilePhotos.includes(img),
      );

      for (const img of removed) {
        try {
          const publicId = extractPublicId(img);

          if (publicId) {
            await cloudinary.uploader.destroy(publicId);
          }
        } catch (e) {
          console.error("Gallery delete failed:", e);
        }
      }
    }

    /* ================= ORIGINAL ================= */

    if (bio !== undefined) {
      profile.bio = requireText(bio, "bio", 2000);
    }

    if (interests !== undefined) {
      profile.interests = normalizeStringArray(interests, "interests", 20);
    }

    if (dateOfBirth !== undefined) {
      profile.dateOfBirth = parseDateOfBirth(dateOfBirth);
    }

    const normalizedRealName = optionalText(realName, "real name", 120);
    if (normalizedRealName !== undefined) profile.realName = normalizedRealName;
    const normalizedCountry = optionalText(country, "country", 100);
    if (normalizedCountry !== undefined) profile.country = normalizedCountry;
    const normalizedCity = optionalText(city, "city", 100);
    if (normalizedCity !== undefined) profile.city = normalizedCity;
    if (languages !== undefined) profile.languages = normalizeStringArray(languages, "languages", 12);

    if (profilePhotos !== undefined) {
      profile.profilePhotos = validateProfilePhotos(profilePhotos);
    }

    if (avatar !== undefined) {
      profile.avatar = requireText(avatar, "avatar", 2048);
    }

    if (cover !== undefined) {
      profile.cover = requireText(cover, "cover", 2048);
    }

    if (profile.profileStatus === "rejected") {
      profile.profileStatus = "pending_verification";
      profile.rejectionReason = "";
      profile.verificationSubmittedAt = new Date();
      profile.verificationSubmissionVersion = (profile.verificationSubmissionVersion || 0) + 1;
    }

    await profile.save();

    await invalidateFaceSessionsForAvatar(profile);
    if (profile.profileStatus === "pending_verification") {
      const verificationRequest = await ensureActiveProfileVerificationRequest(profile);
      await ensureProfileVerificationJob(verificationRequest.request);
      await bindCompletedFaceSessionToVerificationRequest({ profile, requestId: verificationRequest.request._id });
    }

    res.status(200).json({
      message: "Profile updated successfully",
      profile,
    });
  },
);
