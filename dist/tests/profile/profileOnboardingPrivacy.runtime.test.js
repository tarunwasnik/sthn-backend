"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const User_1 = __importDefault(require("../../models/User"));
const userProfile_model_1 = require("../../models/userProfile.model");
const faceVerificationSession_model_1 = require("../../models/faceVerificationSession.model");
const profile_controller_1 = require("../../controllers/profile.controller");
const legacyMobileContactMigration_service_1 = require("../../services/profile/legacyMobileContactMigration.service");
const faceVerificationSession_service_1 = require("../../services/profile/faceVerificationSession.service");
const database_1 = require("../financial/phase7h/helpers/database");
process.env.NODE_ENV = "test";
const invoke = (controller, request) => new Promise((resolve, reject) => {
    const response = {
        status: () => response,
        json: (body) => {
            resolve(body);
            return response;
        },
    };
    const next = (error) => reject(error);
    controller(request, response, next);
});
(0, node_test_1.before)(async () => (0, database_1.connectPhase7HDatabase)(), { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => (0, database_1.clearPhase7HDatabase)());
(0, node_test_1.after)(async () => (0, database_1.disconnectPhase7HDatabase)(), { timeout: 30000 });
(0, node_test_1.test)("private onboarding accepts intended fields and ignores verification mass assignment", async () => {
    const user = await User_1.default.create({
        email: "profile-onboarding@test.local",
        password: "test-password",
        status: "pending_profile",
        governanceState: "ACTIVE",
    });
    const faceSession = await (0, faceVerificationSession_service_1.startFaceVerificationSession)({ userId: String(user._id), avatar: "https://example.test/avatar.jpg" });
    await faceVerificationSession_model_1.FaceVerificationSession.updateOne({ _id: faceSession._id }, { $set: { status: "CAPTURE_COMPLETE", acceptedCaptureCount: 5, captureCompletedAt: new Date() } });
    await invoke(profile_controller_1.upsertProfile, {
        user: { id: String(user._id), role: "user", status: "pending_profile" },
        body: {
            username: "privacy-safe-user",
            realName: "Private Account Name",
            dateOfBirth: "1990-01-01",
            mobileCountryCode: "+91",
            mobileNumber: "98765 43210",
            country: "India",
            city: "Mumbai",
            languages: ["English", "Hindi"],
            interests: ["Music"],
            bio: "A complete private profile.",
            avatar: "https://example.test/avatar.jpg",
            cover: "https://example.test/cover.jpg",
            profilePhotos: ["https://example.test/one.jpg", "https://example.test/two.jpg"],
            profileStatus: "verified",
            rejectionReason: "client supplied",
            verificationSubmittedAt: "2000-01-01",
            userId: "client supplied",
        },
    });
    const profile = await userProfile_model_1.UserProfile.findOne({ userId: user._id }).lean();
    strict_1.default.ok(profile);
    strict_1.default.equal(profile.realName, "Private Account Name");
    strict_1.default.equal("mobileCountryCode" in profile, false);
    strict_1.default.equal("mobileNumber" in profile, false);
    strict_1.default.equal(profile.country, "India");
    strict_1.default.equal(profile.city, "Mumbai");
    strict_1.default.deepEqual(profile.languages, ["English", "Hindi"]);
    strict_1.default.equal(profile.profileStatus, "pending_verification");
    strict_1.default.equal(profile.rejectionReason, "");
    strict_1.default.notEqual(profile.verificationSubmittedAt?.toISOString(), "2000-01-01T00:00:00.000Z");
    const account = await User_1.default.findById(user._id).lean();
    strict_1.default.equal(account?.mobileCountryCode, "+91");
    strict_1.default.equal(account?.mobileNumber, "9876543210");
    await strict_1.default.rejects(invoke(profile_controller_1.updateMyProfile, {
        user: { id: String(user._id), role: "user", status: "active" },
        body: {
            profileStatus: "verified",
            rejectionReason: "client supplied",
            mobileCountryCode: "+1",
            mobileNumber: "5551234567",
        },
    }));
    const afterUpdate = await userProfile_model_1.UserProfile.findById(profile._id).lean();
    strict_1.default.equal(afterUpdate?.profileStatus, "pending_verification");
    strict_1.default.equal(afterUpdate?.rejectionReason, "");
    const accountAfterProfileUpdate = await User_1.default.findById(user._id).lean();
    strict_1.default.equal(accountAfterProfileUpdate?.mobileCountryCode, "+91");
    strict_1.default.equal(accountAfterProfileUpdate?.mobileNumber, "9876543210");
});
(0, node_test_1.test)("existing UserProfiles without new fields remain readable", async () => {
    const user = await User_1.default.create({
        email: "legacy-profile@test.local",
        password: "test-password",
        status: "active",
        governanceState: "ACTIVE",
    });
    const profile = await userProfile_model_1.UserProfile.create({
        userId: user._id,
        username: "legacy-profile",
        dateOfBirth: new Date("1990-01-01"),
        interests: [],
        bio: "Legacy profile",
        avatar: "https://example.test/avatar.jpg",
        cover: "https://example.test/cover.jpg",
        profilePhotos: ["https://example.test/one.jpg", "https://example.test/two.jpg"],
    });
    const reloaded = await userProfile_model_1.UserProfile.findById(profile._id).lean();
    strict_1.default.ok(reloaded);
    strict_1.default.equal(reloaded.realName, null);
    strict_1.default.equal("mobileNumber" in reloaded, false);
    strict_1.default.equal(reloaded.country, null);
    strict_1.default.deepEqual(reloaded.languages, []);
});
(0, node_test_1.test)("legacy UserProfile mobile fields move to User before removal", async () => {
    const user = await User_1.default.create({
        email: "legacy-mobile@test.local",
        password: "test-password",
        status: "active",
        governanceState: "ACTIVE",
    });
    await userProfile_model_1.UserProfile.collection.insertOne({
        userId: user._id,
        username: "legacy-mobile-profile",
        dateOfBirth: new Date("1990-01-01"),
        interests: [],
        bio: "Legacy profile",
        avatar: "https://example.test/avatar.jpg",
        cover: "https://example.test/cover.jpg",
        profilePhotos: ["https://example.test/one.jpg", "https://example.test/two.jpg"],
        profileStatus: "verified",
        rejectionReason: "",
        mobileCountryCode: "+91",
        mobileNumber: "9876543210",
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    await (0, legacyMobileContactMigration_service_1.migrateLegacyProfileMobileContact)(String(user._id));
    const account = await User_1.default.findById(user._id).lean();
    const rawProfile = await userProfile_model_1.UserProfile.collection.findOne({ userId: user._id });
    strict_1.default.equal(account?.mobileCountryCode, "+91");
    strict_1.default.equal(account?.mobileNumber, "9876543210");
    strict_1.default.equal("mobileCountryCode" in (rawProfile ?? {}), false);
    strict_1.default.equal("mobileNumber" in (rawProfile ?? {}), false);
});
(0, node_test_1.test)("onboarding rejects malformed mobile contact input", async () => {
    const user = await User_1.default.create({
        email: "invalid-mobile@test.local",
        password: "test-password",
        status: "pending_profile",
        governanceState: "ACTIVE",
    });
    await strict_1.default.rejects(invoke(profile_controller_1.upsertProfile, {
        user: { id: String(user._id), role: "user", status: "pending_profile" },
        body: {
            username: "invalid-mobile-profile",
            realName: "Private Account Name",
            dateOfBirth: "1990-01-01",
            mobileCountryCode: "91",
            mobileNumber: "not-a-number",
            country: "India",
            city: "Mumbai",
            languages: ["English"],
            interests: [],
            bio: "A complete private profile.",
            avatar: "https://example.test/avatar.jpg",
            cover: "https://example.test/cover.jpg",
            profilePhotos: ["https://example.test/one.jpg", "https://example.test/two.jpg"],
        },
    }));
    strict_1.default.equal(await userProfile_model_1.UserProfile.exists({ userId: user._id }), null);
    const account = await User_1.default.findById(user._id).lean();
    strict_1.default.equal(account?.mobileNumber, null);
});
