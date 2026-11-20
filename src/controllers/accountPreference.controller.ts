import { Request, Response } from "express";
import mongoose from "mongoose";

import { AccountPreference } from "../models/accountPreference.model";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";

const allowedFields = new Set(["displayTimeZone"]);

export function validateDisplayTimeZone(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !value.trim() || value.trim().length > 64) throw new AppError("displayTimeZone must be a valid IANA time zone or null.", 400, "INVALID_ACCOUNT_PREFERENCE");
  const timeZone = value.trim();
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format();
  } catch {
    throw new AppError("displayTimeZone must be a valid IANA time zone or null.", 400, "INVALID_ACCOUNT_PREFERENCE");
  }
  return timeZone;
}

function preferenceDto(preference?: { displayTimeZone?: string | null } | null) {
  return { displayTimeZone: preference?.displayTimeZone ?? null };
}

export const getMyAccountPreferences = catchAsync(async (req: Request, res: Response) => {
  const preference = await AccountPreference.findOne({ userId: req.user!.id }).lean();
  res.json({ preferences: preferenceDto(preference) });
});

export const updateMyAccountPreferences = catchAsync(async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) throw new AppError("Invalid account preference update.", 400, "INVALID_ACCOUNT_PREFERENCE");
  const keys = Object.keys(req.body);
  if (!keys.length || keys.some((key) => !allowedFields.has(key))) throw new AppError("Unsupported account preference field.", 400, "INVALID_ACCOUNT_PREFERENCE_FIELD");

  const update: { displayTimeZone?: string | null } = {};
  if (Object.prototype.hasOwnProperty.call(req.body, "displayTimeZone")) update.displayTimeZone = validateDisplayTimeZone(req.body.displayTimeZone);
  const userId = new mongoose.Types.ObjectId(req.user!.id);
  try {
    const preference = await AccountPreference.findOneAndUpdate(
      { userId },
      { $set: update, $setOnInsert: { userId } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();
    res.json({ preferences: preferenceDto(preference) });
  } catch (error: unknown) {
    if (!(error instanceof Error) || !("code" in error) || (error as { code?: number }).code !== 11000) throw error;
    const preference = await AccountPreference.findOneAndUpdate({ userId }, { $set: update }, { new: true, runValidators: true }).lean();
    if (!preference) throw error;
    res.json({ preferences: preferenceDto(preference) });
  }
});
