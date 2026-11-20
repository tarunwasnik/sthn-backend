// backend/src/controllers/adminCreatorApproval.controller.ts

import { Request, Response } from "express";
import { CreatorApplication } from "../models/creatorApplication.model";
import { AppError } from "../utils/AppError";
import { emitIdentityChanged } from "../sockets/chat.socket";
import { notificationDeliveryService } from "../services/notification/notificationDelivery.service";
import { approveCreatorApplicationDecision, rejectCreatorApplicationDecision } from "../services/creator/creatorApplicationDecision.service";

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
  try {
    const result = await approveCreatorApplicationDecision({ applicationId: req.params.applicationId, adminId: (req as Request & { user: { id: string } }).user.id });
    emitIdentityChanged(result.creatorProfile.userId.toString());
    if (result.delivery?.created) notificationDeliveryService.deliverPersisted(result.delivery.notification, { postCommit: true });

    res.status(200).json({
      message: "Creator approved successfully",
      creatorProfile: result.creatorProfile,
    });
  } catch (err: any) {
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
  try {
    await rejectCreatorApplicationDecision({ applicationId: req.params.applicationId, adminId: (req as Request & { user: { id: string } }).user.id, reason: req.body.reason });
    res.status(200).json({ message: "Creator application rejected" });
    return;
  } catch (err: any) {
    res.status(400).json({ message: err.message || "Rejection failed" });
    return;
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
