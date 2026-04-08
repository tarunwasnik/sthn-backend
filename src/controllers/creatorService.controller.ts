// backend/src/controllers/creatorService.controller.ts

import { Request, Response } from "express";
import mongoose from "mongoose";
import { CreatorService } from "../models/creatorService.model";
import { CreatorProfile } from "../models/creatorProfile.model";
import { AppError } from "../utils/AppError";

/**
 * POST /api/v1/creator/services
 * Create new service
 */
export const createCreatorService = async (req: Request, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError("Unauthorized", 401);
  }

  const creatorObjectId = new mongoose.Types.ObjectId(userId);

  const creatorProfile = await CreatorProfile.findOne({
    userId: creatorObjectId,
    status: "active",
  }).lean();

  if (!creatorProfile) {
    throw new AppError("Active creator profile not found", 403);
  }

  const { title, description, durationMinutes, price, media } = req.body;

  if (!title || !description || durationMinutes == null || price == null) {
    throw new AppError("Missing required fields", 400);
  }

  if (typeof durationMinutes !== "number" || durationMinutes < 15 || durationMinutes > 480) {
    throw new AppError("Invalid durationMinutes", 400);
  }

  if (typeof price !== "number" || price < 0) {
    throw new AppError("Invalid price", 400);
  }

  const normalizedMedia = Array.isArray(media) ? media : [];

  const service = await CreatorService.create({
    creatorId: creatorObjectId,
    title,
    description,
    durationMinutes,
    price,
    media: normalizedMedia,
  });

  res.status(201).json({
    message: "Service created successfully",
    service,
  });
};

/**
 * GET /api/v1/creator/services
 * List my services
 */
export const getMyServices = async (req: Request, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError("Unauthorized", 401);
  }

  const creatorObjectId = new mongoose.Types.ObjectId(userId);

  const services = await CreatorService.find({
    creatorId: creatorObjectId,
  })
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({ services });
};

/**
 * PATCH /api/v1/creator/services/:serviceId
 * Update service
 */
export const updateCreatorService = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const { serviceId } = req.params;

  if (!userId) {
    throw new AppError("Unauthorized", 401);
  }

  if (!mongoose.Types.ObjectId.isValid(serviceId)) {
    throw new AppError("Invalid service ID", 400);
  }

  const creatorObjectId = new mongoose.Types.ObjectId(userId);

  const service = await CreatorService.findOne({
    _id: serviceId,
    creatorId: creatorObjectId,
  });

  if (!service) {
    throw new AppError("Service not found", 404);
  }

  const { title, description, durationMinutes, price, media, isActive } = req.body;

  if (title !== undefined) service.title = title;
  if (description !== undefined) service.description = description;

  if (durationMinutes !== undefined) {
    if (typeof durationMinutes !== "number" || durationMinutes < 15 || durationMinutes > 480) {
      throw new AppError("Invalid durationMinutes", 400);
    }
    service.durationMinutes = durationMinutes;
  }

  if (price !== undefined) {
    if (typeof price !== "number" || price < 0) {
      throw new AppError("Invalid price", 400);
    }
    service.price = price;
  }

  if (media !== undefined) {
    if (!Array.isArray(media)) {
      throw new AppError("Media must be an array", 400);
    }
    service.media = media;
  }

  if (isActive !== undefined) {
    service.isActive = isActive;
  }

  await service.save();

  res.status(200).json({
    message: "Service updated successfully",
    service,
  });
};

/**
 * DELETE /api/v1/creator/services/:serviceId
 * Soft delete
 */
export const deleteCreatorService = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const { serviceId } = req.params;

  if (!userId) {
    throw new AppError("Unauthorized", 401);
  }

  if (!mongoose.Types.ObjectId.isValid(serviceId)) {
    throw new AppError("Invalid service ID", 400);
  }

  const creatorObjectId = new mongoose.Types.ObjectId(userId);

  const service = await CreatorService.findOne({
    _id: serviceId,
    creatorId: creatorObjectId,
  });

  if (!service) {
    throw new AppError("Service not found", 404);
  }

  service.isActive = false;
  await service.save();

  res.status(200).json({
    message: "Service disabled successfully",
  });
};