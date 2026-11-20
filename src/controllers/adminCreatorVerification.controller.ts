import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/AppError";
import { getAdminCreatorVerificationCase as readCase, listAdminCreatorVerificationCases as listCases, readAdminCreatorVerificationCapture as readCapture } from "../services/creator/creatorVerificationAdminRead.service";

export const listAdminCreatorVerificationCases = catchAsync(async (req: Request, res: Response) => {
  const status = req.query.status;
  if (status !== undefined && status !== "processing" && status !== "review" && status !== "all") throw new AppError("Invalid Creator verification status filter", 400);
  res.json({ cases: await listCases(status ?? "all") });
});
export const getAdminCreatorVerificationCase = catchAsync(async (req: Request, res: Response) => res.json({ verification: await readCase(req.params.verificationReference) }));
export const getAdminCreatorVerificationCapture = catchAsync(async (req: Request, res: Response) => {
  const capture = await readCapture(req.params.verificationReference, Number(req.params.challengeIndex));
  res.set({ "Cache-Control": "no-store", Pragma: "no-cache", "X-Content-Type-Options": "nosniff" }); res.type(capture.mimeType).send(capture.bytes);
});
