import { Request, Response } from "express";
import { Types } from "mongoose";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";
import { ImageTemporaryUploadError, imageTemporaryUploadService } from "../services/imageModeration/imageTemporaryUpload.service";
import { temporaryImageAssetCleanupService, TemporaryImageAssetReleaseError } from "../services/imageModeration/temporaryImageAssetCleanup.service";
import { IMAGE_MODERATION_SURFACES, ImageModerationSurface } from "../enums/imageModeration.enums";
export const submitImageModeration = catchAsync(async (req: Request, res: Response) => { if (!req.user || !req.file) throw new AppError("An image file is required.", 400); try { const result = await imageTemporaryUploadService.submit({ actorId: new Types.ObjectId(req.user.id), role: req.user.role, surface: req.body.surface, bytes: req.file.buffer }); res.status(201).json(result); } catch (error) { if (error instanceof ImageTemporaryUploadError) throw new AppError(error.message, error.code === "FORBIDDEN_SURFACE" ? 403 : error.code === "INVALID_SURFACE" || error.code === "INVALID_IMAGE" ? 400 : 503); throw error; } });

export const releaseTemporaryImageModerationAsset = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError("Authentication is required.", 401);
  const assetReference = typeof req.params.assetReference === "string" ? req.params.assetReference : "";
  const surface = req.body?.surface;
  if (!assetReference || assetReference.length > 80 || typeof surface !== "string" || !IMAGE_MODERATION_SURFACES.includes(surface as ImageModerationSurface)) throw new AppError("A valid temporary image asset and surface are required.", 400);
  try {
    const { result } = await temporaryImageAssetCleanupService.requestRelease({ actorId: new Types.ObjectId(req.user.id), assetReference, surface: surface as ImageModerationSurface });
    const outcome = result.kind === "RETRY_SCHEDULED" ? "PENDING_RETRY" : result.kind === "AMBIGUOUS" ? "PENDING_RECONCILIATION" : result.kind === "NOT_DUE" ? "PENDING" : result.kind;
    res.status(200).json({ outcome, message: outcome === "DELETED" || outcome === "ALREADY_MISSING" ? "Temporary image release completed." : outcome === "PROTECTED" ? "Temporary image release is pending while the asset remains protected." : "Temporary image release is pending safe cleanup." });
  } catch (error) {
    if (error instanceof TemporaryImageAssetReleaseError) throw new AppError(error.code === "COMMITTED" ? "Committed media cannot be released as temporary media." : "Temporary image asset is not available for release.", error.code === "COMMITTED" ? 409 : 404);
    throw error;
  }
});
