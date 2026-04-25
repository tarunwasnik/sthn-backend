// backend/src/controllers/creatorApplication.controller.ts

import { Request, Response } from "express";
import mongoose from "mongoose";
import { CreatorApplication } from "../models/creatorApplication.model";
import { UserProfile } from "../models/userProfile.model";
import User from "../models/User";
import { ROLES } from "../constants/roles";
import { AppError } from "../utils/AppError";

export const applyForCreator = async (req: Request, res: Response) => {
  const authUser = req.user;

  if (!authUser) throw new AppError("Unauthorized", 401);

  if (authUser.role !== ROLES.USER) {
    throw new AppError("Only users can apply to become creators", 403);
  }

  const fullUser = await User.findById(authUser.id);
  if (!fullUser) throw new AppError("User not found", 404);

  if (
    fullUser.creatorStatus === "pending" ||
    fullUser.creatorStatus === "approved"
  ) {
    throw new AppError(
      "Creator application already in progress or approved",
      400
    );
  }

  const profile = await UserProfile.findOne({
    userId: authUser.id,
  });

  if (!profile) {
    throw new AppError(
      "You must complete your profile before applying",
      403
    );
  }

  if (profile.profileStatus !== "verified") {
    let message = "Profile verification required.";

    if (profile.profileStatus === "pending_verification") {
      message = "Your profile is under verification.";
    }

    if (profile.profileStatus === "rejected") {
      message =
        "Your profile was rejected. Please update and resubmit.";
    }

    throw new AppError(message, 403);
  }

  const existingApplication = await CreatorApplication.findOne({
    userId: authUser.id,
  });

  if (existingApplication) {
    throw new AppError("Creator application already exists", 400);
  }

  const {
    displayName,
    primaryCategory,
    services,
    publicBio,
    currency,
    country,
    city,
    languages,

    /* ✅ NEW MEDIA INPUT */
    avatarUrl,
    coverUrl,
    media,
  } = req.body;

  if (
    !displayName ||
    !primaryCategory ||
    !publicBio ||
    !currency ||
    !country ||
    !city
  ) {
    throw new AppError(
      "Missing required creator application fields",
      400
    );
  }

  const normalizedServices = Array.isArray(services) ? services : [];
  const normalizedLanguages = Array.isArray(languages)
    ? languages
    : [];

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const application = await CreatorApplication.create(
      [
        {
          userId: authUser.id,
          displayName,
          primaryCategory,
          country,
          city,
          currency: currency.toUpperCase(),
          services: normalizedServices,
          publicBio,
          languages: normalizedLanguages,

          /* ✅ SAVE MEDIA */
          avatarUrl: avatarUrl || null,
          coverUrl: coverUrl || null,
          media: Array.isArray(media) ? media : [],

          status: "submitted",
        },
      ],
      { session }
    );

    fullUser.creatorStatus = "pending";
    await fullUser.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      message: "Creator application submitted",
      application: application[0],
    });
  } catch (error: any) {
    console.error("🔥 CREATOR APPLY ERROR:", error);
    console.error("🔥 ERROR MESSAGE:", error?.message);
    console.error("🔥 ERROR STACK:", error?.stack);

    await session.abortTransaction();
    session.endSession();

    throw new AppError(
      error?.message || "Application submission failed",
      400
    );
  }
};