import { Request, Response } from "express";

import User from "../models/User";
import { UserProfile } from "../models/userProfile.model";
import { CreatorApplication } from "../models/creatorApplication.model";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";
import { calculateAge } from "../utils/calculateAge";
import { parseCreatorMediaClaims } from "../services/creator/creatorMediaAdmissionContract";
import { CreatorMediaAdmissionPersistenceError, creatorMediaAdmissionPersistenceService } from "../services/creator/creatorMediaAdmissionPersistence.service";
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from "../constants/financial/supportedCurrencies";
import { Booking } from "../models/booking.model";

const optionalText = (value: unknown, field: string, max: number) => {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new AppError(`Invalid ${field}`, 400);
  return value.trim();
};
const optionalDateOfBirth = (value: unknown) => {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new AppError("Invalid date of birth", 400);
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || calculateAge(date) < 18) throw new AppError("Minimum age is 18", 403);
  return date;
};
const optionalCountryCode = (value: unknown) => {
  const normalized = optionalText(value, "mobile country code", 5);
  if (normalized !== undefined && !/^\+[1-9]\d{0,3}$/.test(normalized)) throw new AppError("Invalid mobile country code", 400);
  return normalized;
};
const optionalMobile = (value: unknown) => {
  const text = optionalText(value, "mobile number", 15);
  if (text === undefined) return undefined;
  const normalized = text.replace(/[\s-]/g, "");
  if (!/^\d{6,15}$/.test(normalized)) throw new AppError("Invalid mobile number", 400);
  return normalized;
};
const optionalArray = (value: unknown, field: string, max: number) => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > max) throw new AppError(`Invalid ${field}`, 400);
  const normalized = [...new Set(value.map((entry) => {
    if (typeof entry !== "string" || !entry.trim() || entry.trim().length > 80) throw new AppError(`Invalid ${field}`, 400);
    return entry.trim();
  }))];
  return normalized;
};
const expectedVersion = (value: unknown) => {
  if (!Number.isInteger(value) || Number(value) < 0) throw new AppError("A valid draftVersion is required", 400);
  return Number(value);
};

type CreatorDraftJourney = "direct_creator" | "user_upgrade";

const assertCreatorDraftEligibility = async (userId: string): Promise<{ account: InstanceType<typeof User>; journey: CreatorDraftJourney }> => {
  const [account, profile] = await Promise.all([
    User.findById(userId),
    UserProfile.findOne({ userId }).select("_id profileStatus").lean(),
  ]);
  if (!account) throw new AppError("User not found", 404);
  if (account.role !== "user" || account.status !== "active" || account.governanceState !== "ACTIVE" || !["none", "rejected"].includes(account.creatorStatus)) {
    throw new AppError("Account is not eligible for Creator onboarding", 403);
  }
  if (profile?.profileStatus === "verified") {
    if (await Booking.exists({ userId, status: { $in: ["REQUESTED", "CONFIRMED"] } })) throw new AppError("Resolve active bookings before applying to become a Creator", 403);
    return { account, journey: "user_upgrade" };
  }
  throw new AppError("Complete and verify your User profile before applying to become a Creator", 403);
};

export const getMyDirectCreatorDraft = catchAsync(async (req: Request, res: Response) => {
  // Submitted applicants may read their application, but draft mutations still
  // use the stricter eligibility check in saveMyDirectCreatorDraft.
  const submitted = await CreatorApplication.findOne({ userId: req.user!.id, status: "submitted", applicationJourney: "user_upgrade" }).lean();
  const journey = submitted ? submitted.applicationJourney : (await assertCreatorDraftEligibility(req.user!.id)).journey;
  if (submitted && (req.user!.role !== "user" || !["none", "pending"].includes((await User.findById(req.user!.id).select("creatorStatus").lean())?.creatorStatus ?? ""))) {
    throw new AppError("Account is not eligible for Creator onboarding", 403);
  }
  if (submitted && !(await UserProfile.exists({ userId: req.user!.id, profileStatus: "verified" }))) throw new AppError("Verified User profile required", 403);
  const application = await CreatorApplication.findOne({ userId: req.user!.id, applicationJourney: journey }).lean();
  const account = await User.findById(req.user!.id).select("realName dateOfBirth mobileCountryCode mobileNumber creatorOnboardingIntent").lean();
  res.json({ applicationJourney: journey, draft: application ?? null, identity: journey === "direct_creator" && account ? { realName: account.realName ?? null, dateOfBirth: account.dateOfBirth ?? null, mobileCountryCode: account.mobileCountryCode ?? null, mobileNumber: account.mobileNumber ?? null } : null });
});

export const saveMyDirectCreatorDraft = catchAsync(async (req: Request, res: Response) => {
  const { account, journey } = await assertCreatorDraftEligibility(req.user!.id);
  if (req.body?.avatarUrl !== undefined || req.body?.coverUrl !== undefined) throw new AppError("Creator application media must use image admission claims", 400);
  const draftVersion = expectedVersion(req.body?.draftVersion);
  const realName = optionalText(req.body?.realName, "real name", 120);
  const dateOfBirth = optionalDateOfBirth(req.body?.dateOfBirth);
  const mobileCountryCode = optionalCountryCode(req.body?.mobileCountryCode);
  const mobileNumber = optionalMobile(req.body?.mobileNumber);
  const displayName = optionalText(req.body?.displayName, "display name", 120);
  const primaryCategory = optionalText(req.body?.primaryCategory, "primary category", 120);
  const country = optionalText(req.body?.country, "country", 100);
  const city = optionalText(req.body?.city, "city", 100);
  const publicBio = optionalText(req.body?.publicBio, "public bio", 2000);
  const languages = optionalArray(req.body?.languages, "languages", 12);
  const interests = optionalArray(req.body?.interests, "interests", 20);
  let currency: string | undefined;
  if (req.body?.currency !== undefined) {
    if (typeof req.body.currency !== "string" || !SUPPORTED_CURRENCIES.includes(req.body.currency.trim().toUpperCase() as SupportedCurrency)) throw new AppError("Invalid or unsupported operating currency", 400);
    currency = req.body.currency.trim().toUpperCase();
  }
  let claims;
  try { claims = parseCreatorMediaClaims({ avatar: req.body?.avatar, cover: req.body?.cover, media: req.body?.media }); }
  catch (error) { throw new AppError(error instanceof Error ? error.message : "Invalid Creator draft media claims", 400); }

  const existing = await CreatorApplication.findOne({ userId: account._id }).select("_id applicationJourney status draftVersion").lean();
  if (existing && ((existing.applicationJourney ?? "user_upgrade") !== journey || !["draft", "rejected"].includes(existing.status))) throw new AppError("Creator application is not eligible for draft editing", 409);
  if (existing && (existing.draftVersion ?? 0) !== draftVersion) throw new AppError("Creator draft is stale; reload before saving", 409);
  if (!existing && draftVersion !== 0) throw new AppError("Creator draft is stale; reload before saving", 409);

  let persisted;
  try {
    persisted = await creatorMediaAdmissionPersistenceService.persist<{ draftVersion: number; verificationRevision: number }>({
    actorId: account._id,
    kind: "CREATOR_APPLICATION",
    claims,
    loadOwnedResource: async (session) => {
      let application = await CreatorApplication.findOne({ userId: account._id }).session(session).exec();
      if (application) {
        if (application.applicationJourney !== journey || !["draft", "rejected"].includes(application.status) || application.draftVersion !== draftVersion) return null;
        if (application.status === "rejected") { application.status = "draft"; application.rejectionReason = ""; await application.save({ session }); }
      } else {
        [application] = await CreatorApplication.create([{ userId: account._id, applicationJourney: journey, draftVersion: 0, verificationRevision: 0, displayName: "", country: "", city: "", currency: "", services: [], publicBio: "", languages: [], avatarUrl: null, coverUrl: null, media: [], status: "draft", rejectionReason: "" }], { session });
      }
      return { id: application._id, actorId: application.userId, media: { avatar: application.avatarUrl, cover: application.coverUrl, media: application.media ?? [] } };
    },
    persistMedia: async ({ session, resource, media }) => {
      const application = await CreatorApplication.findOne({ _id: resource.id, userId: account._id, status: "draft", $and: [{ $or: [{ applicationJourney: journey }, { applicationJourney: { $exists: false } }] }, ...(draftVersion === 0 ? [{ $or: [{ draftVersion: 0 }, { draftVersion: { $exists: false } }] }] : [{ draftVersion }])] }).session(session).exec();
      if (!application) throw new Error("Creator draft is stale; reload before saving");
      application.applicationJourney = "user_upgrade";
      const identityChanged = journey === "direct_creator" && ((realName !== undefined && realName !== account.realName)
        || (dateOfBirth !== undefined && (!account.dateOfBirth || dateOfBirth.getTime() !== account.dateOfBirth.getTime()))
        || (mobileCountryCode !== undefined && mobileCountryCode !== account.mobileCountryCode)
        || (mobileNumber !== undefined && mobileNumber !== account.mobileNumber));
      const mediaChanged = application.avatarUrl !== (media.avatar ?? null) || application.coverUrl !== (media.cover ?? null)
        || JSON.stringify(application.media ?? []) !== JSON.stringify(media.media);
      const profileChanged = (displayName !== undefined && displayName !== application.displayName)
        || (primaryCategory !== undefined && primaryCategory !== application.primaryCategory)
        || (country !== undefined && country !== application.country)
        || (city !== undefined && city !== application.city)
        || (currency !== undefined && currency !== application.currency)
        || (publicBio !== undefined && publicBio !== application.publicBio)
        || (languages !== undefined && JSON.stringify(languages) !== JSON.stringify(application.languages ?? []))
        || (interests !== undefined && JSON.stringify(interests) !== JSON.stringify(application.interests ?? []));
      if (journey === "direct_creator") {
        if (realName !== undefined) account.realName = realName;
        if (dateOfBirth !== undefined) account.dateOfBirth = dateOfBirth;
        if (mobileCountryCode !== undefined) account.mobileCountryCode = mobileCountryCode;
        if (mobileNumber !== undefined) account.mobileNumber = mobileNumber;
        account.creatorOnboardingIntent = "direct_creator";
      }
      if (journey === "direct_creator") await account.save({ session });
      if (displayName !== undefined) application.displayName = displayName;
      if (primaryCategory !== undefined) application.primaryCategory = primaryCategory;
      if (country !== undefined) application.country = country;
      if (city !== undefined) application.city = city;
      if (currency !== undefined) application.currency = currency;
      if (publicBio !== undefined) application.publicBio = publicBio;
      if (languages !== undefined) application.languages = languages;
      if (interests !== undefined) application.interests = interests;
      application.avatarUrl = media.avatar ?? null;
      application.coverUrl = media.cover ?? null;
      application.media = [...media.media];
      application.draftVersion += 1;
      if (identityChanged || mediaChanged || profileChanged || application.verificationRevision === 0) application.verificationRevision += 1;
      await application.save({ session });
      return { draftVersion: application.draftVersion, verificationRevision: application.verificationRevision };
    },
    });
  } catch (error) {
    if (
      (error instanceof CreatorMediaAdmissionPersistenceError && error.code === "RESOURCE_NOT_FOUND")
      || (error instanceof Error && error.message === "Creator draft is stale; reload before saving")
      || (typeof error === "object" && error !== null && "code" in error && error.code === 11000)
    ) {
      throw new AppError("Creator draft is stale; reload before saving", 409);
    }
    if (error instanceof CreatorMediaAdmissionPersistenceError || (error instanceof Error && error.message === "Image admission reference is not valid for this actor and surface")) throw new AppError("Creator application image admission is invalid", 400);
    throw error;
  }
  const draft = await CreatorApplication.findOne({ userId: account._id, applicationJourney: journey });
  res.status(existing ? 200 : 201).json({ applicationJourney: journey, draft, identity: journey === "direct_creator" ? { realName: account.realName ?? null, dateOfBirth: account.dateOfBirth ?? null, mobileCountryCode: account.mobileCountryCode ?? null, mobileNumber: account.mobileNumber ?? null } : null, revision: persisted.committedOutcome });
});
