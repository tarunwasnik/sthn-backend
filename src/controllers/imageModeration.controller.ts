import { Request, Response } from "express";
import { Types } from "mongoose";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";
import { ImageTemporaryUploadError, imageTemporaryUploadService } from "../services/imageModeration/imageTemporaryUpload.service";
export const submitImageModeration = catchAsync(async (req: Request, res: Response) => { if (!req.user || !req.file) throw new AppError("An image file is required.", 400); try { const result = await imageTemporaryUploadService.submit({ actorId: new Types.ObjectId(req.user.id), role: req.user.role, surface: req.body.surface, bytes: req.file.buffer }); res.status(201).json(result); } catch (error) { if (error instanceof ImageTemporaryUploadError) throw new AppError(error.message, error.code === "FORBIDDEN_SURFACE" ? 403 : error.code === "INVALID_SURFACE" || error.code === "INVALID_IMAGE" ? 400 : 503); throw error; } });
