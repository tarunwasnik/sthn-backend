// backend/src/controllers/profile.controller.ts

import { Request, Response } from "express";
import { UserProfile } from "../models/userProfile.model";
import User from "../models/User";
import { AppError } from "../utils/AppError";
import { uploadToCloudinary } from "../utils/uploadToCloudinary";
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
    console.log("🔥 BODY:", req.body);
    console.log("🔥 FILES:", req.files);

    const userId = req.user!.id;

    const { username, dateOfBirth, interests, bio } = req.body;
    const files = req.files as Express.Multer.File[];

    let profile = await UserProfile.findOne({ userId });
    const isFirstSubmission = !profile;

    /* ================= FILE VALIDATION ================= */

    if (!files || files.length < 2 || files.length > 6) {
      throw new AppError("Profile must have between 2 and 6 photos", 400);
    }

    /* ================= UPLOAD TO CLOUDINARY ================= */

    const uploadedPhotos: string[] = [];

    for (const file of files) {
      const result = await uploadToCloudinary(file.buffer);
      uploadedPhotos.push(result.secure_url);
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
        profilePhotos: uploadedPhotos,
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

      if (files && files.length > 0) {
        profile.profilePhotos = uploadedPhotos;
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