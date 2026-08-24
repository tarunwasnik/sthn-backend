import { Request, Response } from "express";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";
import { assertFaceVerificationImageBytes } from "../middlewares/upload.middleware";
import { acceptFaceVerificationCapture, cancelFaceVerificationSession, getOwnedFaceVerificationSession, startFaceVerificationSession, toFaceVerificationSessionDto } from "../services/profile/faceVerificationSession.service";

export const beginFaceVerificationSession = catchAsync(async (req: Request, res: Response) => {
  const session = await startFaceVerificationSession({ userId: req.user!.id, avatar: req.body.avatar });
  res.status(201).json({ session: toFaceVerificationSessionDto(session) });
});
export const getFaceVerificationSessionStatus = catchAsync(async (req: Request, res: Response) => {
  const session = await getOwnedFaceVerificationSession({ userId: req.user!.id, sessionReference: req.params.sessionReference });
  res.json({ session: toFaceVerificationSessionDto(session) });
});
export const cancelCurrentFaceVerificationSession = catchAsync(async (req: Request, res: Response) => {
  const session = await cancelFaceVerificationSession({ userId: req.user!.id, sessionReference: req.params.sessionReference });
  res.json({ session: toFaceVerificationSessionDto(session) });
});
export const uploadFaceVerificationCapture = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) throw new AppError("A face verification image is required", 400);
  try { assertFaceVerificationImageBytes(req.file); } catch { throw new AppError("Invalid face verification image content", 400); }
  const result = await acceptFaceVerificationCapture({ userId: req.user!.id, sessionReference: req.params.sessionReference, challengeIndex: req.params.challengeIndex, file: req.file });
  res.status(result.replayed ? 200 : 201).json({ session: toFaceVerificationSessionDto(result.session), capture: { challengeIndex: result.evidence.challengeIndex, challenge: result.evidence.challenge, receivedAt: result.evidence.captureReceivedAt ?? null }, replayed: result.replayed });
});
