// backend/src/controllers/creatorService.controller.ts

import { Request, Response } from "express";
import mongoose from "mongoose";
import { CreatorService } from "../models/creatorService.model";
import { CreatorProfile } from "../models/creatorProfile.model";
import { AppError } from "../utils/AppError";
import cloudinary, { extractPublicId } from "../config/cloudinary";

/**
 * CREATE SERVICE
 */
export const createCreatorService = async (req: Request, res: Response) => {
  const userId = req.user?.id;

  if (!userId) throw new AppError("Unauthorized", 401);

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

  if (
    typeof durationMinutes !== "number" ||
    durationMinutes < 15 ||
    durationMinutes > 480
  ) {
    throw new AppError("Invalid durationMinutes", 400);
  }

  if (typeof price !== "number" || price < 0) {
    throw new AppError("Invalid price", 400);
  }

  const service = await CreatorService.create({
    creatorId: creatorObjectId,
    title,
    description,
    durationMinutes,
    price,
    media: Array.isArray(media) ? media : [],
  });

  res.status(201).json({
    message: "Service created successfully",
    service,
  });
};

/**
 * GET SERVICES
 */
export const getMyServices = async (req: Request, res: Response) => {
  const userId = req.user?.id;

  if (!userId) throw new AppError("Unauthorized", 401);

  const creatorObjectId = new mongoose.Types.ObjectId(userId);

  const services = await CreatorService.find({
    creatorId: creatorObjectId,
  })
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({ services });
};

/**
 * UPDATE SERVICE (WITH MEDIA CLEANUP)
 */
export const updateCreatorService = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const { serviceId } = req.params;

  if (!userId) throw new AppError("Unauthorized", 401);

  if (!mongoose.Types.ObjectId.isValid(serviceId)) {
    throw new AppError("Invalid service ID", 400);
  }

  const creatorObjectId = new mongoose.Types.ObjectId(userId);

  const service = await CreatorService.findOne({
    _id: serviceId,
    creatorId: creatorObjectId,
  });

  if (!service) throw new AppError("Service not found", 404);

  const {
    title,
    description,
    durationMinutes,
    price,
    media,
    isActive,
  } = req.body;

  /* ================= MEDIA CLEANUP ================= */

  if (media !== undefined) {
    if (!Array.isArray(media)) {
      throw new AppError("Media must be an array", 400);
    }

    const oldMedia = service.media || [];
    const removedMedia = oldMedia.filter(
      (url) => !media.includes(url)
    );

    for (const url of removedMedia) {
      const publicId = extractPublicId(url);

      if (publicId) {
        try {
          await cloudinary.uploader.destroy(publicId);
        } catch (err) {
          console.error("Cloudinary delete failed:", publicId);
        }
      }
    }

    service.media = media;
  }

  /* ================= OTHER FIELDS ================= */

  if (title !== undefined) service.title = title;
  if (description !== undefined) service.description = description;

  if (durationMinutes !== undefined) {
    if (
      typeof durationMinutes !== "number" ||
      durationMinutes < 15 ||
      durationMinutes > 480
    ) {
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
 * DELETE SERVICE + MEDIA CLEANUP (HARD DELETE)
 */
export const deleteCreatorService = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const { serviceId } = req.params;

  if (!userId) throw new AppError("Unauthorized", 401);

  if (!mongoose.Types.ObjectId.isValid(serviceId)) {
    throw new AppError("Invalid service ID", 400);
  }

  const creatorObjectId = new mongoose.Types.ObjectId(userId);

  const service = await CreatorService.findOne({
    _id: serviceId,
    creatorId: creatorObjectId,
  });

  if (!service) throw new AppError("Service not found", 404);

  /* ================= DELETE ALL MEDIA ================= */

  if (service.media?.length) {
    for (const url of service.media) {
      const publicId = extractPublicId(url);

      if (publicId) {
        try {
          await cloudinary.uploader.destroy(publicId);
        } catch (err) {
          console.error("Cloudinary delete failed:", publicId);
        }
      }
    }
  }

  /* ================= HARD DELETE ================= */

  await CreatorService.findByIdAndDelete(serviceId);

  res.status(200).json({
    message: "Service and media deleted successfully",
  });
};