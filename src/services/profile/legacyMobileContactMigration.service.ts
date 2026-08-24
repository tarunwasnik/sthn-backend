import mongoose from "mongoose";

import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";

type LegacyMobileProfile = {
  mobileCountryCode?: unknown;
  mobileNumber?: unknown;
};

/** Moves only the just-introduced legacy profile fields to their account owner. */
export const migrateLegacyProfileMobileContact = async (userId: string): Promise<void> => {
  if (!mongoose.Types.ObjectId.isValid(userId)) return;

  const legacy = await UserProfile.collection.findOne<LegacyMobileProfile>(
    { userId: new mongoose.Types.ObjectId(userId) },
    { projection: { mobileCountryCode: 1, mobileNumber: 1 } },
  );

  if (!legacy || (typeof legacy.mobileCountryCode !== "string" && typeof legacy.mobileNumber !== "string")) {
    return;
  }

  const user = await User.findById(userId).select("mobileCountryCode mobileNumber");
  if (!user) return;

  if (!user.mobileCountryCode && typeof legacy.mobileCountryCode === "string") {
    user.mobileCountryCode = legacy.mobileCountryCode;
  }
  if (!user.mobileNumber && typeof legacy.mobileNumber === "string") {
    user.mobileNumber = legacy.mobileNumber;
  }
  await user.save();

  await UserProfile.collection.updateOne(
    { userId: new mongoose.Types.ObjectId(userId) },
    { $unset: { mobileCountryCode: "", mobileNumber: "" } },
  );
};
