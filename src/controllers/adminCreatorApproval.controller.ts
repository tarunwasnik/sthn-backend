import { Request, Response } from "express";
import mongoose from "mongoose";
import { CreatorApplication } from "../models/creatorApplication.model";
import { CreatorProfile } from "../models/creatorProfile.model";
import { UserProfile } from "../models/userProfile.model";
import User from "../models/User";
import { ROLES } from "../constants/roles";
import { AppError } from "../utils/AppError";
import { generateUniqueCreatorSlug } from "../utils/generateCreatorSlug";

/* =====================================================
   LIST CREATOR APPLICATIONS
===================================================== */

export const listCreatorApplications = async (
  req: Request,
  res: Response
) => {
  const { status } = req.query;

  const filter: any = {};
  if (status) filter.status = status;

  const applications = await CreatorApplication.find(filter)
    .populate("userId", "email")
    .sort({ createdAt: -1 });

  res.status(200).json({
    applications,
  });
};

/* =====================================================
   APPROVE CREATOR APPLICATION
===================================================== */

export const approveCreatorApplication = async (
  req: Request,
  res: Response
) => {
  const { applicationId } = req.params;

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    /* 1️⃣ FIND APPLICATION */
    const application = await CreatorApplication.findById(
      applicationId
    ).session(session);

    if (!application) {
      throw new AppError("Application not found", 404);
    }

    if (application.status !== "submitted") {
      throw new AppError(
        "Application not eligible for approval",
        400
      );
    }

    /* 2️⃣ GET USER */
    const user = await User.findById(application.userId).session(
      session
    );

    if (!user) {
      throw new AppError("User not found", 404);
    }

    /* 3️⃣ CHECK EXISTING CREATOR PROFILE */
    const existingProfile = await CreatorProfile.findOne({
      userId: application.userId,
    }).session(session);

    if (existingProfile) {
      throw new AppError(
        "Creator profile already exists",
        400
      );
    }

    /* 4️⃣ GET USER PROFILE */
    const userProfile = await UserProfile.findOne({
      userId: application.userId,
    }).session(session);

    if (!userProfile) {
      throw new AppError(
        "User profile required before approval",
        400
      );
    }

    /* 5️⃣ GENERATE UNIQUE SLUG */
    const slug = await generateUniqueCreatorSlug(
      application.displayName
    );

    /* 6️⃣ CREATE CREATOR PROFILE */
    const creatorProfile = new CreatorProfile({
      userId: application.userId,
      slug,
      displayName: application.displayName,

      // 🔗 USER PROFILE LINK
      avatarUrl: userProfile.avatar,
      coverUrl: userProfile.cover,
      media: userProfile.profilePhotos,

      primaryCategory: application.primaryCategory,
      categories: [application.primaryCategory],

      bio: application.publicBio,
      languages: application.languages,

      country: application.country,
      city: application.city,

      currency: application.currency,

      rating: 0,
      reviewCount: 0,

      status: "active",
    });

    await creatorProfile.save({ session });

    /* 7️⃣ UPDATE USER */
    user.role = ROLES.CREATOR;
    user.creatorStatus = "approved";
    await user.save({ session });

    /* 8️⃣ UPDATE APPLICATION */
    application.status = "approved";
    await application.save({ session });

    /* ✅ COMMIT TRANSACTION */
    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      message: "Creator approved successfully",
      creatorProfile,
    });
  } catch (err: any) {
    await session.abortTransaction();
    session.endSession();

    console.error("Approve Creator Error:", err);

    res.status(400).json({
      message: err.message || "Approval failed",
    });
  }
};

/* =====================================================
   REJECT CREATOR APPLICATION
===================================================== */

export const rejectCreatorApplication = async (
  req: Request,
  res: Response
) => {
  const { applicationId } = req.params;

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const application = await CreatorApplication.findById(
      applicationId
    ).session(session);

    if (!application) {
      throw new AppError("Application not found", 404);
    }

    if (application.status !== "submitted") {
      throw new AppError(
        "Application not eligible for rejection",
        400
      );
    }

    const user = await User.findById(application.userId).session(
      session
    );

    if (!user) {
      throw new AppError("User not found", 404);
    }

    application.status = "rejected";
    await application.save({ session });

    user.creatorStatus = "none";
    await user.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      message: "Creator application rejected",
    });
  } catch (err: any) {
    await session.abortTransaction();
    session.endSession();

    res.status(400).json({
      message: err.message || "Rejection failed",
    });
  }
};

/* =====================================================
   DELETE CREATOR APPLICATION (Admin Cleanup)
===================================================== */

export const deleteCreatorApplication = async (
  req: Request,
  res: Response
) => {
  const { applicationId } = req.params;

  const application = await CreatorApplication.findById(
    applicationId
  );

  if (!application) {
    throw new AppError("Application not found", 404);
  }

  await CreatorApplication.findByIdAndDelete(applicationId);

  res.status(200).json({
    message: "Application deleted successfully",
  });
};