"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const mongoose_1 = require("mongoose");
const User_1 = __importDefault(require("../../models/User"));
const userProfile_model_1 = require("../../models/userProfile.model");
const user_controller_1 = require("../../controllers/user.controller");
const database_1 = require("../financial/phase7h/helpers/database");
process.env.NODE_ENV = "test";
const invokePublicProfile = (userId) => new Promise((resolve, reject) => {
    const result = {};
    const response = {
        status: (statusCode) => {
            result.statusCode = statusCode;
            return response;
        },
        json: (body) => {
            result.body = body;
            resolve(result);
            return response;
        },
    };
    const next = (error) => reject(error);
    (0, user_controller_1.getUserPublicProfile)({ params: { userId } }, response, next);
});
(0, node_test_1.before)(async () => (0, database_1.connectPhase7HDatabase)(), { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => (0, database_1.clearPhase7HDatabase)());
(0, node_test_1.after)(async () => (0, database_1.disconnectPhase7HDatabase)(), { timeout: 30000 });
(0, node_test_1.test)("public user profile returns only its allowlisted DTO and derives age", async () => {
    const suffix = new mongoose_1.Types.ObjectId().toString();
    const user = await User_1.default.create({
        email: `public-profile-${suffix}@test.local`,
        password: "test",
        status: "active",
        governanceState: "ACTIVE",
    });
    const profile = await userProfile_model_1.UserProfile.create({
        userId: user._id,
        username: `public-profile-${suffix}`,
        realName: "Private Real Name",
        dateOfBirth: new Date("1990-01-01T00:00:00.000Z"),
        country: "India",
        city: "Mumbai",
        languages: ["English", "Hindi"],
        interests: ["music", "travel"],
        bio: "Public biography",
        avatar: "https://example.test/avatar.jpg",
        cover: "https://example.test/private-cover.jpg",
        profilePhotos: ["https://example.test/photo-1.jpg", "https://example.test/photo-2.jpg"],
        profileStatus: "rejected",
        rejectionReason: "Private review feedback",
        verificationSubmittedAt: new Date("2024-01-01T00:00:00.000Z"),
    });
    await userProfile_model_1.UserProfile.collection.updateOne({ _id: profile._id }, { $set: { mobileCountryCode: "+91", mobileNumber: "9876543210" } });
    const result = await invokePublicProfile(String(user._id));
    strict_1.default.equal(result.statusCode, 200);
    const body = result.body;
    strict_1.default.deepEqual(Object.keys(body.profile).sort(), [
        "age", "avatar", "bio", "city", "country", "cover", "id", "interests",
        "languages", "profilePhotos", "username",
    ]);
    strict_1.default.equal(body.profile.id, String(profile._id));
    strict_1.default.equal(body.profile.username, profile.username);
    strict_1.default.equal(body.profile.avatar, profile.avatar);
    strict_1.default.equal(body.profile.cover, profile.cover);
    strict_1.default.equal(body.profile.country, profile.country);
    strict_1.default.equal(body.profile.city, profile.city);
    strict_1.default.deepEqual(body.profile.languages, profile.languages);
    strict_1.default.deepEqual(body.profile.interests, profile.interests);
    strict_1.default.deepEqual(body.profile.profilePhotos, profile.profilePhotos);
    strict_1.default.equal(body.profile.age, new Date().getUTCFullYear() - 1990);
    for (const privateField of [
        "_id", "__v", "userId", "realName", "dateOfBirth", "mobileCountryCode", "mobileNumber", "profileStatus",
        "rejectionReason", "verificationSubmittedAt", "createdAt", "updatedAt",
    ]) {
        strict_1.default.equal(privateField in body.profile, false, `${privateField} must not be public`);
    }
});
(0, node_test_1.test)("public user profile returns bounded errors for unknown and malformed identifiers", async () => {
    const unknown = await invokePublicProfile(String(new mongoose_1.Types.ObjectId()));
    strict_1.default.equal(unknown.statusCode, 404);
    strict_1.default.deepEqual(unknown.body, { message: "Profile not found" });
    const malformed = await invokePublicProfile("not-an-object-id");
    strict_1.default.equal(malformed.statusCode, 400);
    strict_1.default.deepEqual(malformed.body, { message: "Invalid userId" });
});
