// backend/src/controllers/profileVerification.controller.ts

import { Request, Response } from "express";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";
import {
  decideProfileVerificationRequest,
  listProfileVerificationQueue,
} from "../services/profile/profileVerificationRequest.service";
import { getAdminProfileVerificationDetail, readAdminProfileVerificationCapture } from "../services/profile/profileVerificationAdminRead.service";

/* ================= LIST PENDING PROFILES ================= */

export const listPendingProfiles = catchAsync(async (_req: Request, res: Response) => {
  const profiles = await listProfileVerificationQueue("AI");
  res.json({ profiles });
});

export const listAdminReviewProfiles = catchAsync(async (_req: Request, res: Response) => {
  const profiles = await listProfileVerificationQueue("ADMIN_REVIEW");
  res.json({ profiles });
});

export const getAdminProfileVerificationDetailController = catchAsync(async (req: Request, res: Response) => {
  res.json({ verification: await getAdminProfileVerificationDetail(req.params.verificationReference) });
});

export const getAdminProfileVerificationCaptureController = catchAsync(async (req: Request, res: Response) => {
  const challengeIndex = Number(req.params.challengeIndex);
  const capture = await readAdminProfileVerificationCapture({ verificationReference: req.params.verificationReference, challengeIndex });
  res.set({ "Cache-Control": "no-store", "Pragma": "no-cache", "X-Content-Type-Options": "nosniff" });
  res.type(capture.mimeType).send(capture.bytes);
});

/* ================= APPROVE PROFILE ================= */

export const approveProfile = catchAsync(async (req: Request, res: Response) => {
  const { profileId } = req.params;
  const result = await decideProfileVerificationRequest({
    profileId,
    decision: "APPROVE",
    authority: "ADMIN",
    decidedBy: req.user!.id,
  });

  res.json({
    message: "Profile verified successfully",
    replayed: result.replayed,
  });
});

/* ================= REJECT PROFILE ================= */

export const rejectProfile = catchAsync(async (req: Request, res: Response) => {
  const { profileId } = req.params;
  const { reason } = req.body;
  if (typeof reason !== "string") throw new AppError("Rejection reason is required", 400);
  const result = await decideProfileVerificationRequest({
    profileId,
    decision: "REJECT",
    authority: "ADMIN",
    decidedBy: req.user!.id,
    reason,
  });

  res.json({
    message: "Profile rejected",
    replayed: result.replayed,
  });
});
