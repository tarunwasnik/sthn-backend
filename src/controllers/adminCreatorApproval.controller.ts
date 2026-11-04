// backend/src/controllers/adminCreatorApproval.controller.ts

import { Request, Response } from "express";
import mongoose from "mongoose";
import { CreatorApplication } from "../models/creatorApplication.model";
import { CreatorProfile } from "../models/creatorProfile.model";
import { UserProfile } from "../models/userProfile.model";
import User from "../models/User";
import { ROLES } from "../constants/roles";
import { AppError } from "../utils/AppError";
import { generateUniqueCreatorSlug } from "../utils/generateCreatorSlug";
import { emitIdentityChanged } from "../sockets/chat.socket";
import { notificationService } from "../services/notification/notification.service";
import { notificationDeliveryService } from "../services/notification/notificationDelivery.service";
import { createAuditLog } from "../services/auditLog.service";

/* =====================================================
   LIST CREATOR APPLICATIONS
===================================================== */

export const listCreatorApplications = async (req: Request, res: Response) => {
  const { status } = req.query;

  const filter: any = {};

  if (status) {
    filter.status = status;
  }

  const applications = await CreatorApplication.find(filter)
    .populate("userId", "email")
    .sort({
      submittedForReviewAt: -1,
      createdAt: -1,
    });

  res.status(200).json({
    applications,
  });
};

/* =====================================================
   APPROVE CREATOR APPLICATION
===================================================== */

export const approveCreatorApplication = async (
  req: Request,
  res: Response,
) => {
  const { applicationId } = req.params;

  const session = await mongoose.startSession();
  let approvalNotification: Awaited<ReturnType<typeof notificationService.createWithOutcome>> | null = null;

  try {
    session.startTransaction();

    /* 1️⃣ FIND APPLICATION */

    const application =
      await CreatorApplication.findById(applicationId).session(session);

    if (!application) {
      throw new AppError("Application not found", 404);
    }

    if (application.status !== "submitted") {
      throw new AppError("Application not eligible for approval", 400);
    }

    /* 2️⃣ GET USER */

    const user = await User.findById(application.userId).session(session);

    if (!user) {
      throw new AppError("User not found", 404);
    }

    /* 3️⃣ CHECK EXISTING CREATOR PROFILE */

    const existingProfile = await CreatorProfile.findOne({
      userId: application.userId,
    }).session(session);

    if (existingProfile) {
      throw new AppError("Creator profile already exists", 400);
    }

    /* 4️⃣ GET USER PROFILE */

    const userProfile = await UserProfile.findOne({
      userId: application.userId,
    }).session(session);

    if (!userProfile) {
      throw new AppError("User profile required before approval", 400);
    }

    /* 5️⃣ GENERATE UNIQUE SLUG */

    const slug = await generateUniqueCreatorSlug(application.displayName);

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
    application.rejectionReason = "";

    await application.save({ session });

    await createAuditLog({
      actorType: "ADMIN",
      actorId: new mongoose.Types.ObjectId(req.user!.id),
      action: "CREATOR_APPLICATION_APPROVED",
      entityType: "CREATOR_APPLICATION",
      entityId: application._id,
      before: {
        status: "submitted",
        creatorStatus: "pending",
      },
      after: {
        status: application.status,
        creatorStatus: user.creatorStatus,
        creatorProfileId: String(creatorProfile._id),
      },
      session,
    });

    approvalNotification = await notificationService.createWithOutcome({
      recipientId: String(application.userId),
      category: "CREATOR_APPLICATION",
      type: "CREATOR_APPLICATION_UPDATE",
      title: "Creator Application Approved",
      body: "Your Creator Application has been approved. You can now access your Creator Dashboard.",
      navigationPath: "/dashboard/creator",
      metadata: { entityType: "CREATOR_APPLICATION", entityId: String(application._id) },
      idempotencyKey: `creator-application:${application._id}:approved:${application.userId}`,
      session,
    });

    /* ✅ COMMIT TRANSACTION */

    await session.commitTransaction();

    session.endSession();

    /* 🔔 NOTIFY CONNECTED USER */

    emitIdentityChanged(user._id.toString());
    if (approvalNotification?.created) notificationDeliveryService.deliverPersisted(approvalNotification.notification, { postCommit: true });

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

export const rejectCreatorApplication = async (req: Request, res: Response) => {
  const { applicationId } = req.params;

  const { reason } = req.body;

  const session = await mongoose.startSession();
  let rejectionNotification: Awaited<ReturnType<typeof notificationService.createWithOutcome>> | null = null;

  try {
    session.startTransaction();

    const application =
      await CreatorApplication.findById(applicationId).session(session);

    if (!application) {
      throw new AppError("Application not found", 404);
    }

    if (application.status !== "submitted") {
      throw new AppError("Application not eligible for rejection", 400);
    }

    if (!reason?.trim()) {
      throw new AppError("Rejection reason is required", 400);
    }

    const user = await User.findById(application.userId).session(session);

    if (!user) {
      throw new AppError("User not found", 404);
    }

    application.status = "rejected";
    application.rejectionReason = reason.trim();

    await application.save({ session });

    user.creatorStatus = "rejected";

    await user.save({ session });

    await createAuditLog({
      actorType: "ADMIN",
      actorId: new mongoose.Types.ObjectId(req.user!.id),
      action: "CREATOR_APPLICATION_REJECTED",
      entityType: "CREATOR_APPLICATION",
      entityId: application._id,
      before: {
        status: "submitted",
        creatorStatus: "pending",
      },
      after: {
        status: application.status,
        creatorStatus: user.creatorStatus,
        rejectionReason: application.rejectionReason,
      },
      session,
    });

    rejectionNotification = await notificationService.createWithOutcome({
      recipientId: String(application.userId),
      category: "CREATOR_APPLICATION",
      type: "CREATOR_APPLICATION_UPDATE",
      title: "Creator Application Needs Updates",
      body: "Your Creator Application was not approved. Review the feedback and resubmit when you are ready.",
      navigationPath: "/creator-application",
      metadata: { entityType: "CREATOR_APPLICATION", entityId: String(application._id) },
      idempotencyKey: `creator-application:${application._id}:rejected:${application.userId}`,
      session,
    });

    await session.commitTransaction();

    session.endSession();

    if (rejectionNotification?.created) notificationDeliveryService.deliverPersisted(rejectionNotification.notification, { postCommit: true });

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

export const deleteCreatorApplication = async (req: Request, res: Response) => {
  const { applicationId } = req.params;

  const application = await CreatorApplication.findById(applicationId);

  if (!application) {
    throw new AppError("Application not found", 404);
  }

  if (application.status !== "draft") {
    throw new AppError("Only unsubmitted creator application drafts can be deleted", 409);
  }

  await CreatorApplication.findByIdAndDelete(applicationId);

  res.status(200).json({
    message: "Application deleted successfully",
  });
};
