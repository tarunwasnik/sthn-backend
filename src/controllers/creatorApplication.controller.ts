// backend/src/controllers/creatorApplication.controller.ts

import { Request, Response } from "express";
import { Types } from "mongoose";
import { CreatorApplication } from "../models/creatorApplication.model";
import { UserProfile } from "../models/userProfile.model";
import { Booking } from "../models/booking.model";
import User from "../models/User";
import { ROLES } from "../constants/roles";
import { AppError } from "../utils/AppError";
import { normalizeCreatorApplicationModerationPayload } from "../services/textModeration/textModerationNormalization.service";
import { parseCreatorMediaClaims } from "../services/creator/creatorMediaAdmissionContract";
import { creatorMediaAdmissionPersistenceService } from "../services/creator/creatorMediaAdmissionPersistence.service";
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from "../constants/financial/supportedCurrencies";

export const applyForCreator = async (req: Request, res: Response) => {
  const authUser = req.user;

  if (!authUser) {
    throw new AppError("Unauthorized", 401);
  }

  if (authUser.role !== ROLES.USER) throw new AppError("Only users can apply to become creators", 403);
  const fullUser = await User.findById(authUser.id);
  if (!fullUser) throw new AppError("User not found", 404);
  if (fullUser.creatorStatus === "pending" || fullUser.creatorStatus === "approved") throw new AppError("Creator application already in progress or approved", 400);
  const profile = await UserProfile.findOne({ userId: authUser.id });
  if (!profile) throw new AppError("You must complete your profile before applying", 403);
  if (profile.profileStatus !== "verified") throw new AppError("Profile verification required.", 403);
  const blockingBooking = await Booking.findOne({ userId: authUser.id, status: { $in: ["REQUESTED", "CONFIRMED"] } }).select("_id").lean();
  if (blockingBooking) throw new AppError("You can't submit a creator application while you have active or upcoming bookings. Please complete or resolve your current bookings before applying as a creator.", 403);
  const existingApplication = await CreatorApplication.findOne({ userId: authUser.id });
  if (existingApplication && (existingApplication.status !== "rejected" || existingApplication.applicationJourney === "direct_creator")) throw new AppError("Creator application already exists", 400);
  const { displayName, primaryCategory, services, interests, publicBio, currency, country, city, languages } = req.body;
  if (![displayName, publicBio, currency, country, city].every((value) => typeof value === "string" && value.trim()) || !Array.isArray(languages) || languages.length === 0 || !languages.every((value: unknown) => typeof value === "string" && value.trim())) throw new AppError("Missing required creator application fields", 400);
  if (interests !== undefined && (!Array.isArray(interests) || interests.length > 20 || !interests.every((value: unknown) => typeof value === "string" && value.trim() && value.trim().length <= 80))) throw new AppError("Invalid interests", 400);
  if (primaryCategory !== undefined && (typeof primaryCategory !== "string" || !primaryCategory.trim())) throw new AppError("Invalid primary category", 400);
  if (!SUPPORTED_CURRENCIES.includes(currency.trim().toUpperCase() as SupportedCurrency)) throw new AppError("Invalid or unsupported operating currency", 400);
  const moderatedText = normalizeCreatorApplicationModerationPayload({ publicBio, services: services ?? [] });
  if (req.body.avatarUrl !== undefined || req.body.coverUrl !== undefined) throw new AppError("Creator application media must use image admission claims", 400);
  let claims;
  try { claims = parseCreatorMediaClaims({ avatar: req.body.avatar, cover: req.body.cover, media: req.body.media }); }
  catch (error) { throw new AppError(error instanceof Error ? error.message : "Invalid creator application media claims", 400); }
  const existingApplicationId = existingApplication?._id;
  let applicationId: Types.ObjectId | undefined;
  try {
    const persisted = await creatorMediaAdmissionPersistenceService.persist<{ applicationId: string; applicantUserId: string; submitted: true }>({
      actorId: fullUser._id, kind: "CREATOR_APPLICATION", claims,
      loadOwnedResource: async (session) => {
        let application = existingApplicationId ? await CreatorApplication.findOne({ _id: existingApplicationId, userId: fullUser._id, status: "rejected" }).session(session).exec() : null;
        if (existingApplicationId && !application) return null;
        if (!application) [application] = await CreatorApplication.create([{ userId: fullUser._id, displayName, primaryCategory, interests: interests?.map((value: string) => value.trim()) ?? [], country, city, currency: currency.toUpperCase(), services: moderatedText.services, publicBio: moderatedText.publicBio, languages, avatarUrl: null, coverUrl: null, media: [], status: "draft", rejectionReason: "" }], { session });
        applicationId = application._id;
        return { id: application._id, actorId: application.userId, media: { avatar: application.avatarUrl, cover: application.coverUrl, media: application.media ?? [] } };
      },
      persistMedia: async ({ session, resource, media }) => {
        const application = await CreatorApplication.findOne({ _id: resource.id, userId: fullUser._id }).session(session).exec();
        const account = await User.findById(fullUser._id).session(session).exec();
        if (!application || !account) throw new Error("Creator application account is unavailable");
        if (account.creatorStatus === "pending" || account.creatorStatus === "approved") throw new Error("Creator application already in progress or approved");
        if (!media.avatar || !media.cover || media.media.length < 2 || media.media.length > 6) throw new Error("Avatar, cover, and two to six gallery images are required");
        application.displayName = displayName; if (primaryCategory !== undefined) application.primaryCategory = primaryCategory; if (interests !== undefined) application.interests = interests.map((value: string) => value.trim()); application.country = country; application.city = city; application.currency = currency.toUpperCase(); if (services !== undefined) application.services = moderatedText.services; application.publicBio = moderatedText.publicBio; application.languages = languages;
        application.avatarUrl = media.avatar; application.coverUrl = media.cover; application.media = [...media.media]; application.status = "submitted"; application.rejectionReason = ""; application.submittedForReviewAt = new Date(); account.creatorStatus = "pending";
        await application.save({ session }); await account.save({ session }); applicationId = application._id;
        return { applicationId: String(application._id), applicantUserId: String(application.userId), submitted: true };
      },
    });
    applicationId = persisted.committedOutcome ? new Types.ObjectId(persisted.committedOutcome.applicationId) : applicationId;
    const application = applicationId ? await CreatorApplication.findById(applicationId) : null;
    return res.status(201).json({ message: "Creator application submitted", application });
  } catch (error) { throw new AppError(error instanceof Error ? error.message : "Application submission failed", 400); }
};

export const getMyCreatorApplication = async (req: Request, res: Response) => {
  const authUser = req.user;

  if (!authUser) {
    throw new AppError("Unauthorized", 401);
  }

  const application = await CreatorApplication.findOne({
    userId: authUser.id,
  });

  if (!application) {
    return res.status(200).json({
      application: null,
    });
  }

  return res.status(200).json({
    application,
  });
};
