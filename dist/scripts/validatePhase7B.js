"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const root = path_1.default.resolve(__dirname, "..");
const read = (...parts) => fs_1.default.readFileSync(path_1.default.join(root, ...parts), "utf8");
const expect = (condition, message) => {
    if (!condition)
        throw new Error(message);
};
const walletModel = read("models", "wallet.model.ts");
const walletRepository = read("repositories", "wallet", "wallet.repository.ts");
const walletCreation = read("services", "wallet", "walletCreation.service.ts");
const profileVerification = read("controllers", "profileVerification.controller.ts");
const walletController = read("controllers", "wallet.controller.ts");
const backfill = read("services", "admin", "walletBackfill.service.ts");
const creatorProfile = read("models", "creatorProfile.model.ts");
const creatorApplication = read("controllers", "creatorApplication.controller.ts");
const creatorProfileController = read("controllers", "creatorProfile.controller.ts");
const booking = read("controllers", "booking.controller.ts");
expect(walletModel.includes("userId:") && walletModel.includes('ref: "User"'), "Wallet is not User-owned.");
expect(walletModel.includes("walletSchema.index({ userId: 1, currency: 1 }, { unique: true })"), "Wallet compound ownership index is missing.");
expect(creatorProfile.includes("userId:") && creatorProfile.includes('ref: "User"'), "CreatorProfile is not User-owned.");
expect(walletCreation.includes("assertVerifiedProfile") && walletCreation.includes('profileStatus: "verified"'), "Wallet creation does not require profile verification.");
expect(walletCreation.includes("if (existing) return existing") && walletCreation.includes("code === 11000") && walletCreation.includes("findByUserAndCurrency(userId, normalizedCurrency)"), "Wallet creation is not idempotent or race-safe.");
expect(walletRepository.includes(".limit(2)") && walletRepository.includes("WALLET_DUPLICATE_OWNERSHIP"), "Duplicate Wallet ownership is not detected.");
expect(profileVerification.includes("walletCreationService.createWallet(profile.userId)"), "Verified profile approval does not invoke wallet creation.");
expect(!creatorApplication.includes("walletCreationService") && !creatorApplication.includes("Wallet.create"), "Creator application creates a Wallet.");
expect(!creatorProfileController.includes("walletCreationService") && !creatorProfileController.includes("Wallet.create"), "CreatorProfile lifecycle creates a Wallet.");
expect(walletController.includes("new Types.ObjectId(req.user.id)") && !walletController.includes("req.body.userId") && !walletController.includes("req.query.userId"), "Wallet controller ownership is not authenticated-user based.");
expect(backfill.includes('profileStatus: "verified"') && backfill.includes("profile.userId") && backfill.includes("walletCreationService.createWallet"), "Wallet backfill does not use verified User identity.");
expect(booking.includes("const user = req.user") && booking.includes("userId: user.id"), "Booking customer identity is not authenticated User identity.");
expect(!walletCreation.includes("ledger") && !walletCreation.includes("projection") && !walletCreation.includes("provider"), "Wallet creation changes financial accounting or provider behavior.");
console.log("Phase 7B one-user-one-wallet validation passed.");
