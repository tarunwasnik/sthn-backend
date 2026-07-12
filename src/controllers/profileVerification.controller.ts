// backend/src/controllers/profileVerification.controller.ts

import { Request, Response } from "express";
import { UserProfile } from "../models/userProfile.model";
import { AppError } from "../utils/AppError";

/* ================= LIST PENDING PROFILES ================= */

export const listPendingProfiles = async (_req: Request, res: Response) => {
  const profiles = await UserProfile.find({
    profileStatus: "pending_verification",
  })
    .populate("userId", "name email")
    .sort({
      verificationSubmittedAt: -1,
      createdAt: -1,
    })
    .lean();

  res.json({ profiles });
};

/* ================= APPROVE PROFILE ================= */

export const approveProfile = async (req: Request, res: Response) => {
  const { profileId } = req.params;

  const profile = await UserProfile.findById(profileId);

  if (!profile) {
    throw new AppError("Profile not found", 404);
  }

  if (profile.profileStatus !== "pending_verification") {
    throw new AppError("Profile not eligible for approval", 400);
  }

  profile.profileStatus = "verified";
  profile.rejectionReason = "";

  await profile.save();

  res.json({
    message: "Profile verified successfully",
  });
};

/* ================= REJECT PROFILE ================= */

export const rejectProfile = async (req: Request, res: Response) => {
  const { profileId } = req.params;

  const { reason } = req.body;

  const profile = await UserProfile.findById(profileId);

  if (!profile) {
    throw new AppError("Profile not found", 404);
  }

  if (profile.profileStatus !== "pending_verification") {
    throw new AppError("Profile not eligible for rejection", 400);
  }

  if (!reason || !reason.trim()) {
    throw new AppError("Rejection reason is required", 400);
  }

  profile.profileStatus = "rejected";
  profile.rejectionReason = reason.trim();

  await profile.save();

  res.json({
    message: "Profile rejected",
  });
};
