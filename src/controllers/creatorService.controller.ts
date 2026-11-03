// backend/src/controllers/creatorService.controller.ts

import { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import { CreatorService } from "../models/creatorService.model";
import { CreatorProfile } from "../models/creatorProfile.model";
import { AppError } from "../utils/AppError";
import { CreatorServiceMediaPolicyError, parseCreatorMediaClaims, requireCreatorServiceCreateMedia, validateCreatorServiceUpdateMedia } from "../services/creator/creatorMediaAdmissionContract";
import { creatorMediaAdmissionPersistenceService } from "../services/creator/creatorMediaAdmissionPersistence.service";
import { providerAssetReferenceRepository } from "../repositories/providerAssetReference.repository";
import { providerAssetReferenceTransactionService } from "../services/profile/providerAssetReferenceTransaction.service";
import { creatorServiceMajorToMinor } from "../utils/financial/creatorServicePrice.util";

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

  const { title, description, durationMinutes, price } = req.body;

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

  if (typeof price !== "number") {
    throw new AppError("Invalid price", 400);
  }
  try { creatorServiceMajorToMinor(price, creatorProfile.currency as never); }
  catch { throw new AppError("Invalid price", 400); }

  let claims;
  try {
    claims = parseCreatorMediaClaims({ media: req.body.media });
    requireCreatorServiceCreateMedia(claims);
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : "Invalid service media claims", 400);
  }
  let serviceId: Types.ObjectId | undefined;
  try {
    await creatorMediaAdmissionPersistenceService.persist({ actorId: creatorObjectId, kind: "CREATOR_SERVICE", claims,
      loadOwnedResource: async (session) => { const [service] = await CreatorService.create([{ creatorId: creatorObjectId, title, description, durationMinutes, price, currency: creatorProfile.currency, media: [] }], { session }); serviceId = service._id; return { id: service._id, actorId: service.creatorId, media: { media: [] } }; },
      persistMedia: async ({ session, resource, media }) => { await CreatorService.updateOne({ _id: resource.id, creatorId: creatorObjectId }, { $set: { media: media.media } }, { session }); },
    });
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : "Creator service creation failed", 400);
  }
  const service = serviceId ? await CreatorService.findById(serviceId) : null;

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
    isActive,
  } = req.body;

  let claims;
  try {
    claims = parseCreatorMediaClaims({ media: req.body.media });
    validateCreatorServiceUpdateMedia(claims, service.media ?? []);
  } catch (error) {
    const statusCode = error instanceof CreatorServiceMediaPolicyError && error.code === "LEGACY_MIGRATION_REQUIRED" ? 409 : 400;
    throw new AppError(error instanceof Error ? error.message : "Invalid service media claims", statusCode);
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
    if (typeof price !== "number") {
      throw new AppError("Invalid price", 400);
    }
    try { creatorServiceMajorToMinor(price, service.currency as never); }
    catch { throw new AppError("Invalid price", 400); }
    service.price = price;
  }

  if (isActive !== undefined) {
    service.isActive = isActive;
  }

  try {
    await creatorMediaAdmissionPersistenceService.persist({ actorId: creatorObjectId, kind: "CREATOR_SERVICE", claims,
      loadOwnedResource: async (session) => { const current = await CreatorService.findOne({ _id: serviceId, creatorId: creatorObjectId }).session(session).exec(); return current ? { id: current._id, actorId: current.creatorId, media: { media: current.media ?? [] } } : null; },
      persistMedia: async ({ session, resource, media: next }) => { const current = await CreatorService.findOne({ _id: resource.id, creatorId: creatorObjectId }).session(session).exec(); if (!current) throw new Error("Service not found"); current.title = service.title; current.description = service.description; current.durationMinutes = service.durationMinutes; current.price = service.price; current.isActive = service.isActive; current.media = [...next.media]; await current.save({ session }); },
    });
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : "Creator service update failed", 400);
  }

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

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const service = await CreatorService.findOne({ _id: serviceId, creatorId: creatorObjectId }).session(session).exec();
      if (!service) throw new AppError("Service not found", 404);
      const references = await providerAssetReferenceRepository.findCurrentByEntity("CREATOR_SERVICE", service._id, session);
      for (const former of references) {
        await providerAssetReferenceTransactionService.releaseFormer({ session, entity: { entityType: "CREATOR_SERVICE", entityId: service._id, slot: former.slot }, former });
      }
      // Bookings retain immutable service snapshots, including media URLs. The
      // guard does not model those historic references, so deletion never
      // creates cleanup intents or triggers provider destruction.
      await CreatorService.deleteOne({ _id: service._id, creatorId: creatorObjectId }, { session });
    });
  } finally { await session.endSession(); }

  res.status(200).json({
    message: "Service and media deleted successfully",
  });
};
