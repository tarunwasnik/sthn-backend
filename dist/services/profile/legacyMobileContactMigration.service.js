"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateLegacyProfileMobileContact = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = __importDefault(require("../../models/User"));
const userProfile_model_1 = require("../../models/userProfile.model");
/** Moves only the just-introduced legacy profile fields to their account owner. */
const migrateLegacyProfileMobileContact = async (userId) => {
    if (!mongoose_1.default.Types.ObjectId.isValid(userId))
        return;
    const legacy = await userProfile_model_1.UserProfile.collection.findOne({ userId: new mongoose_1.default.Types.ObjectId(userId) }, { projection: { mobileCountryCode: 1, mobileNumber: 1 } });
    if (!legacy || (typeof legacy.mobileCountryCode !== "string" && typeof legacy.mobileNumber !== "string")) {
        return;
    }
    const user = await User_1.default.findById(userId).select("mobileCountryCode mobileNumber");
    if (!user)
        return;
    if (!user.mobileCountryCode && typeof legacy.mobileCountryCode === "string") {
        user.mobileCountryCode = legacy.mobileCountryCode;
    }
    if (!user.mobileNumber && typeof legacy.mobileNumber === "string") {
        user.mobileNumber = legacy.mobileNumber;
    }
    await user.save();
    await userProfile_model_1.UserProfile.collection.updateOne({ userId: new mongoose_1.default.Types.ObjectId(userId) }, { $unset: { mobileCountryCode: "", mobileNumber: "" } });
};
exports.migrateLegacyProfileMobileContact = migrateLegacyProfileMobileContact;
