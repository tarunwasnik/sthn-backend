//backend/src/controllers/creatorProfile.controller.ts

import { Request, Response } from "express";
import mongoose from "mongoose";
import { CreatorProfile } from "../models/creatorProfile.model";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/AppError";
import { v2 as cloudinary } from "cloudinary";
import { extractPublicId } from "../utils/extractPublicId";

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
    const userId = new mongoose.Types.ObjectId(req.user!.id);

    const {
      displayName,
      avatarUrl,
      coverUrl,
      bio,
      languages,
      categories,
      city,
      country,
      media,
    } = req.body;

    const profile = await CreatorProfile.findOne({ userId });

    if (!profile) {
      throw new AppError("Creator profile not found", 404);
    }

    /* 🔥 CLOUDINARY CLEANUP */

    if (
      avatarUrl !== undefined &&
      profile.avatarUrl &&
      avatarUrl !== profile.avatarUrl
    ) {
      try {
        const publicId = extractPublicId(profile.avatarUrl);
        if (publicId) await cloudinary.uploader.destroy(publicId);
      } catch (e) {
        console.error("Avatar delete failed:", e);
      }
    }

    if (
      coverUrl !== undefined &&
      profile.coverUrl &&
      coverUrl !== profile.coverUrl
    ) {
      try {
        const publicId = extractPublicId(profile.coverUrl);
        if (publicId) await cloudinary.uploader.destroy(publicId);
      } catch (e) {
        console.error("Cover delete failed:", e);
      }
    }

     // 🔥 MEDIA (STRICT SAME AS SERVICES)
    if (media !== undefined) {
      const oldMedia = profile.media || [];
      const newMedia = Array.isArray(media) ? media : [];

      const removedMedia = oldMedia.filter(
        (oldUrl) => !newMedia.includes(oldUrl)
      );

      for (const url of removedMedia) {
        try {
          const publicId = extractPublicId(url);
          if (publicId) {
            await cloudinary.uploader.destroy(publicId);
          }
        } catch (err) {
          console.error("Media delete failed:", err);
        }
      }
    }


    /* ================= UPDATE ================= */

    if (displayName !== undefined) profile.displayName = displayName;
    if (avatarUrl !== undefined) profile.avatarUrl = avatarUrl;
    if (coverUrl !== undefined) profile.coverUrl = coverUrl;
    if (bio !== undefined) profile.bio = bio;
    if (languages !== undefined) profile.languages = languages;
    if (categories !== undefined) profile.categories = categories;
    if (city !== undefined) profile.city = city;
    if (country !== undefined) profile.country = country;
    if (media !== undefined) profile.media = media;

    await profile.save();

    res.status(200).json({
      message: "Creator profile updated",
      profile,
    });
  }
);