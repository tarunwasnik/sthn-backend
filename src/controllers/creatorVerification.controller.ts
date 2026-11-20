import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/AppError";
import { assertFaceVerificationImageBytes } from "../middlewares/upload.middleware";
import { acceptCreatorVerificationCapture, creatorVerificationStatus, getOwnedCreatorVerificationSession, startCreatorVerificationSession, submitCreatorVerificationRequest } from "../services/creator/creatorVerification.service";
import { toFaceVerificationSessionDto } from "../services/profile/faceVerificationSession.service";

// Only verified User-upgrade routes are mounted; the service checks ownership
// and rejects direct-Creator applications for every operation.
export const beginCreatorVerificationSession = catchAsync(async (req: Request, res: Response) => {
  const session = await startCreatorVerificationSession(req.user!.id);
  res.status(201).json({ session: toFaceVerificationSessionDto(session) });
});
export const getCreatorVerificationSession = catchAsync(async (req: Request, res: Response) => {
  const session = await getOwnedCreatorVerificationSession({ userId: req.user!.id, sessionReference: req.params.sessionReference });
  res.json({ session: toFaceVerificationSessionDto(session) });
});
export const uploadCreatorVerificationCapture = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) throw new AppError("A face verification image is required", 400);
  try { assertFaceVerificationImageBytes(req.file); } catch { throw new AppError("Invalid face verification image content", 400); }
  const result = await acceptCreatorVerificationCapture({ userId: req.user!.id, sessionReference: req.params.sessionReference, challengeIndex: req.params.challengeIndex, file: req.file });
  res.status(result.replayed ? 200 : 201).json({ session: toFaceVerificationSessionDto(result.session), capture: { challengeIndex: result.evidence.challengeIndex, challenge: result.evidence.challenge, receivedAt: result.evidence.captureReceivedAt ?? null }, replayed: result.replayed });
});
export const submitCreatorVerification = catchAsync(async (req: Request, res: Response) => {
  const request = await submitCreatorVerificationRequest(req.user!.id);
  res.status(201).json({ verification: request ? { reference: request.verificationReference, status: request.status } : null });
});
export const getCreatorVerificationStatus = catchAsync(async (req: Request, res: Response) => {
  res.json({ status: await creatorVerificationStatus(req.user!.id) });
});
