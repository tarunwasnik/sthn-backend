// backend/src/controllers/creatorApplication.controller.ts

import { Request, Response } from "express";
import mongoose from "mongoose";
import { CreatorApplication } from "../models/creatorApplication.model";
import { UserProfile } from "../models/userProfile.model";
import { Booking } from "../models/booking.model";
import User from "../models/User";
import { ROLES } from "../constants/roles";
import { AppError } from "../utils/AppError";

export const applyForCreator = async (req: Request, res: Response) => {
  const authUser = req.user;

  if (!authUser) {
    throw new AppError("Unauthorized", 401);
  }

  if (authUser.role !== ROLES.USER) {
    throw new AppError("Only users can apply to become creators", 403);
  }

  const fullUser = await User.findById(authUser.id);

  if (!fullUser) {
    throw new AppError("User not found", 404);
  }

  if (
    fullUser.creatorStatus === "pending" ||
    fullUser.creatorStatus === "approved"
  ) {
    throw new AppError(
      "Creator application already in progress or approved",
      400,
    );
  }

  const profile = await UserProfile.findOne({
    userId: authUser.id,
  });

  if (!profile) {
    throw new AppError("You must complete your profile before applying", 403);
  }

  if (profile.profileStatus !== "verified") {
    let message = "Profile verification required.";

    if (profile.profileStatus === "pending_verification") {
      message = "Your profile is under verification.";
    }

    if (profile.profileStatus === "rejected") {
      message = "Your profile was rejected. Please update and resubmit.";
    }

    throw new AppError(message, 403);
  }

  /* ================= ACTIVE BOOKING CHECK ================= */

  const blockingBooking = await Booking.findOne({
    userId: authUser.id,
    status: {
      $in: ["REQUESTED", "CONFIRMED"],
    },
  })
    .select("_id status")
    .lean();

  if (blockingBooking) {
    throw new AppError(
      "You can't submit a creator application while you have active or upcoming bookings. Please complete or resolve your current bookings before applying as a creator.",
      403,
    );
  }

  const existingApplication = await CreatorApplication.findOne({
    userId: authUser.id,
  });

  if (existingApplication && existingApplication.status !== "rejected") {
    throw new AppError("Creator application already exists", 400);
  }

  /* ================= MEDIA INPUT ================= */

  const {
    displayName,
    primaryCategory,
    services,
    publicBio,
    currency,
    country,
    city,
    languages,
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
    throw new AppError("Missing required creator application fields", 400);
  }

  const normalizedServices = Array.isArray(services) ? services : [];

  const normalizedLanguages = Array.isArray(languages) ? languages : [];

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    let application;

    /* ================= FIRST SUBMISSION ================= */

    if (!existingApplication) {
      application = await CreatorApplication.create(
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

            avatarUrl: avatarUrl || null,
            coverUrl: coverUrl || null,
            media: Array.isArray(media) ? media : [],

            status: "submitted",

            submittedForReviewAt: new Date(),
          },
        ],
        { session },
      );
    } else {
      /* ================= REJECTED RESUBMISSION ================= */

      existingApplication.displayName = displayName;
      existingApplication.primaryCategory = primaryCategory;

      existingApplication.country = country;
      existingApplication.city = city;

      existingApplication.currency = currency.toUpperCase();

      existingApplication.services = normalizedServices;
      existingApplication.publicBio = publicBio;

      existingApplication.languages = normalizedLanguages;

      existingApplication.avatarUrl = avatarUrl || null;
      existingApplication.coverUrl = coverUrl || null;
      existingApplication.media = Array.isArray(media) ? media : [];

      existingApplication.status = "submitted";
      existingApplication.rejectionReason = "";

      existingApplication.submittedForReviewAt = new Date();

      await existingApplication.save({ session });

      application = [existingApplication];
    }

    fullUser.creatorStatus = "pending";

    await fullUser.save({ session });

    await session.commitTransaction();

    session.endSession();

    return res.status(201).json({
      message: "Creator application submitted",
      application: Array.isArray(application) ? application[0] : application,
    });
  } catch (error: any) {
    console.error("🔥 CREATOR APPLY ERROR:", error);
    console.error("🔥 ERROR MESSAGE:", error?.message);
    console.error("🔥 ERROR STACK:", error?.stack);

    await session.abortTransaction();

    session.endSession();

    throw new AppError(error?.message || "Application submission failed", 400);
  }
};

export const getMyCreatorApplication = async (req: Request, res: Response) => {
  const authUser = req.user;

  if (!authUser) {
    throw new AppError("Unauthorized", 401);
  }

  const application = await CreatorApplication.findOne({
    userId: authUser.id,
  });

  if (!application) {
    return res.status(200).json({
      application: null,
    });
  }

  return res.status(200).json({
    application,
  });
};
