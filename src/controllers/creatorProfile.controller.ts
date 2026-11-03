//backend/src/controllers/creatorProfile.controller.ts

import { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import { CreatorProfile } from "../models/creatorProfile.model";
import { creatorMediaAdmissionPersistenceService } from "../services/creator/creatorMediaAdmissionPersistence.service";
import { parseCreatorMediaClaims } from "../services/creator/creatorMediaAdmissionContract";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/AppError";

/* ================= GET CREATOR PROFILE ================= */

export const getMyCreatorProfile = catchAsync(
  async (req: Request, res: Response) => {
    const userId = new mongoose.Types.ObjectId(req.user!.id);

    const profile = await CreatorProfile.findOne({ userId });

    if (!profile) {
      throw new AppError("Creator profile not found", 404);
    }

    res.status(200).json(profile);
  }
);

/* ================= UPDATE CREATOR PROFILE ================= */

export const updateMyCreatorProfile = catchAsync(
  async (req: Request, res: Response) => {
    const actorId = new Types.ObjectId(req.user!.id);
    if (req.body.avatarUrl !== undefined || req.body.coverUrl !== undefined) {
      throw new AppError("Creator profile media must use image admission claims", 400);
    }
    let claims;
    try {
      claims = parseCreatorMediaClaims({ avatar: req.body.avatar, cover: req.body.cover, media: req.body.media });
    } catch (error) {
      throw new AppError(error instanceof Error ? error.message : "Invalid creator profile media claims", 400);
    }
    const profileId = (await CreatorProfile.findOne({ userId: actorId }).select("_id").lean())?._id;
    if (!profileId) throw new AppError("Creator profile not found", 404);
    try {
      await creatorMediaAdmissionPersistenceService.persist({
        actorId, kind: "CREATOR_PROFILE", claims,
        loadOwnedResource: async (session) => {
          const profile = await CreatorProfile.findOne({ _id: profileId, userId: actorId }).session(session).exec();
          return profile ? { id: profile._id, actorId: profile.userId, media: { avatar: profile.avatarUrl, cover: profile.coverUrl, media: profile.media ?? [] } } : null;
        },
        persistMedia: async ({ session, resource, media }) => {
          const profile = await CreatorProfile.findOne({ _id: resource.id, userId: actorId }).session(session).exec();
          if (!profile) throw new Error("Creator profile not found");
          const { displayName, bio, languages, categories, city, country } = req.body;
          if (displayName !== undefined) profile.displayName = displayName;
          if (bio !== undefined) profile.bio = bio;
          if (languages !== undefined) profile.languages = languages;
          if (categories !== undefined) profile.categories = categories;
          if (city !== undefined) profile.city = city;
          if (country !== undefined) profile.country = country;
          profile.avatarUrl = media.avatar ?? null; profile.coverUrl = media.cover ?? null; profile.media = [...media.media];
          await profile.save({ session });
        },
      });
    } catch (error) {
      throw new AppError(error instanceof Error ? error.message : "Creator profile update failed", 400);
    }
    const profile = await CreatorProfile.findOne({ _id: profileId, userId: actorId });

    res.status(200).json({
      message: "Creator profile updated",
      profile,
    });
  }
);
