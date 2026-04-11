// backend/src/controllers/profile.controller.ts

import { Request, Response } from "express";
import { UserProfile } from "../models/userProfile.model";
import User from "../models/User";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";

/* ================= UTIL ================= */

const calculateAge = (dob: Date) => {
  const diff = Date.now() - dob.getTime();
  const ageDate = new Date(diff);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
};

/* ================= CREATE / UPDATE PROFILE ================= */

export const upsertProfile = catchAsync(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const {
      username,
      dateOfBirth,
      interests,
      bio,
      profilePhotos,
      avatar,
      cover,
    } = req.body;

    let profile = await UserProfile.findOne({ userId });
    const isFirstSubmission = !profile;

    /* ================= VALIDATION ================= */

    if (!profilePhotos || profilePhotos.length < 2 || profilePhotos.length > 6) {
      throw new AppError("Profile must have between 2 and 6 photos", 400);
    }

    if (!avatar) {
      throw new AppError("Avatar is required", 400);
    }

    if (!cover) {
      throw new AppError("Cover is required", 400);
    }

    /* ================= CREATE ================= */

    if (!profile) {
      if (!username || !dateOfBirth || !bio) {
        throw new AppError("Required fields missing", 400);
      }

      const dob = new Date(dateOfBirth);
      const age = calculateAge(dob);

      if (age < 18) {
        throw new AppError("Minimum age is 18", 403);
      }

      const existingUsername = await UserProfile.findOne({ username });
      if (existingUsername) {
        throw new AppError("Username already taken", 409);
      }

      profile = await UserProfile.create({
        userId,
        username,
        dateOfBirth: dob,
        interests: Array.isArray(interests)
          ? interests
          : interests
          ? [interests]
          : [],
        bio,
        avatar,
        cover,
        profilePhotos,
        profileStatus: "pending_verification",
      });
    }

    /* ================= UPDATE ================= */

    else {
      if (username && username !== profile.username) {
        throw new AppError("Username cannot be changed", 400);
      }

      if (dateOfBirth) {
        const dob = new Date(dateOfBirth);
        const age = calculateAge(dob);

        if (age < 18) {
          throw new AppError("Minimum age is 18", 403);
        }

        profile.dateOfBirth = dob;
      }

      if (bio !== undefined) profile.bio = bio;

      if (interests !== undefined) {
        profile.interests = Array.isArray(interests)
          ? interests
          : [interests];
      }

      if (profilePhotos && Array.isArray(profilePhotos)) {
        if (profilePhotos.length < 2 || profilePhotos.length > 6) {
          throw new AppError("Profile must have 2–6 photos", 400);
        }

        profile.profilePhotos = profilePhotos;
      }

      if (avatar !== undefined) {
        profile.avatar = avatar;
      }

      if (cover !== undefined) {
        profile.cover = cover;
      }

      if (profile.profileStatus === "rejected") {
        profile.profileStatus = "pending_verification";
      }

      await profile.save();
    }

    /* ================= ACTIVATE USER ================= */

    if (isFirstSubmission) {
      const user = await User.findById(userId);

      if (!user) {
        throw new AppError("User not found", 404);
      }

      if (user.status === "pending_profile") {
        user.status = "active";
        await user.save();
      }
    }

    res.status(200).json({
      message: "Profile saved successfully",
      profileStatus: profile.profileStatus,
      profile,
    });
  }
);

/* ================= GET PROFILE ================= */

export const getMyProfile = catchAsync(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;

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
  }
);

/* ================= EDIT PROFILE ================= */

export const updateMyProfile = catchAsync(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const {
      bio,
      interests,
      dateOfBirth,
      profilePhotos,
      avatar,
      cover,
    } = req.body;

    const profile = await UserProfile.findOne({ userId });

    if (!profile) {
      throw new AppError("Profile not found", 404);
    }

    /* ================= UPDATE ================= */

    if (bio !== undefined) profile.bio = bio;

    if (interests !== undefined) {
      profile.interests = Array.isArray(interests)
        ? interests
        : [interests];
    }

    if (dateOfBirth) {
      const dob = new Date(dateOfBirth);
      const age = calculateAge(dob);

      if (age < 18) {
        throw new AppError("Minimum age is 18", 403);
      }

      profile.dateOfBirth = dob;
    }

    if (profilePhotos && Array.isArray(profilePhotos)) {
      if (profilePhotos.length < 2 || profilePhotos.length > 6) {
        throw new AppError("Profile must have 2–6 photos", 400);
      }

      profile.profilePhotos = profilePhotos;
    }

    if (avatar !== undefined) {
      profile.avatar = avatar;
    }

    if (cover !== undefined) {
      profile.cover = cover;
    }

    if (profile.profileStatus === "rejected") {
      profile.profileStatus = "pending_verification";
    }

    await profile.save();

    res.status(200).json({
      message: "Profile updated successfully",
      profile,
    });
  }
);