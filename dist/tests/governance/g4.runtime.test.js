"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const mongoose_1 = require("mongoose");
const User_1 = __importDefault(require("../../models/User"));
const creatorProfile_model_1 = require("../../models/creatorProfile.model");
const accountGovernanceResolver_service_1 = require("../../services/accountGovernance/accountGovernanceResolver.service");
const cooldownLifecycle_service_1 = require("../../services/accountGovernance/cooldownLifecycle.service");
const applyCreatorCooldown_service_1 = require("../../services/adminActions/applyCreatorCooldown.service");
const revokeCreatorCooldown_service_1 = require("../../services/adminActions/revokeCreatorCooldown.service");
const database_1 = require("../financial/phase7h/helpers/database");
process.env.NODE_ENV = "test";
(0, node_test_1.before)(async () => (0, database_1.connectPhase7HDatabase)(), { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => (0, database_1.clearPhase7HDatabase)());
(0, node_test_1.after)(async () => (0, database_1.disconnectPhase7HDatabase)(), { timeout: 30000 });
const createActor = async (suffix, governanceState = "ACTIVE") => {
    const user = await User_1.default.create({
        email: `g4-${suffix}-${new mongoose_1.Types.ObjectId()}@test.local`, password: "test", status: governanceState === "BANNED" ? "banned" : governanceState === "SUSPENDED" ? "suspended" : "active", governanceState,
    });
    const profile = await creatorProfile_model_1.CreatorProfile.create({ userId: user._id, slug: `g4-${suffix}-${user._id}`, displayName: "G4 Creator", primaryCategory: "test", country: "IN", city: "Test", currency: "INR", status: "active" });
    return { user, profile };
};
(0, node_test_1.test)("G4 user and creator cooldowns are independent and resolver capabilities match the frozen matrix", async () => {
    const { user } = await createActor("independent");
    const until = new Date(Date.now() + 60000);
    await (0, cooldownLifecycle_service_1.applyAccountCooldown)({ userId: String(user._id), kind: "USER", until, reason: "user-only" });
    let resolved = (0, accountGovernanceResolver_service_1.resolveAccountGovernance)(await User_1.default.findById(user._id).orFail());
    strict_1.default.equal(resolved.blocksOutgoingBookings, true);
    strict_1.default.equal(resolved.blocksIncomingBookings, false);
    strict_1.default.equal(resolved.blocksAcceptingBookings, false);
    await (0, cooldownLifecycle_service_1.applyAccountCooldown)({ userId: String(user._id), kind: "CREATOR", until: new Date(Date.now() + 120000), reason: "creator-only" });
    resolved = (0, accountGovernanceResolver_service_1.resolveAccountGovernance)(await User_1.default.findById(user._id).orFail());
    strict_1.default.equal(resolved.blocksOutgoingBookings, true);
    strict_1.default.equal(resolved.blocksIncomingBookings, true);
    strict_1.default.equal(resolved.blocksAcceptingBookings, true);
    await (0, cooldownLifecycle_service_1.revokeAccountCooldown)({ userId: String(user._id), kind: "USER" });
    resolved = (0, accountGovernanceResolver_service_1.resolveAccountGovernance)(await User_1.default.findById(user._id).orFail());
    strict_1.default.equal(resolved.isUserCooldownActive, false);
    strict_1.default.equal(resolved.isCreatorCooldownActive, true);
    await (0, cooldownLifecycle_service_1.revokeAccountCooldown)({ userId: String(user._id), kind: "CREATOR" });
    resolved = (0, accountGovernanceResolver_service_1.resolveAccountGovernance)(await User_1.default.findById(user._id).orFail());
    strict_1.default.equal(resolved.condition, "ACTIVE");
});
(0, node_test_1.test)("G4 admin creator cooldown writes canonical User creator fields and revokes without touching user cooldown", async () => {
    const admin = await createActor("admin");
    const { user, profile } = await createActor("target");
    await (0, cooldownLifecycle_service_1.applyAccountCooldown)({ userId: String(user._id), kind: "USER", until: new Date(Date.now() + 60000), reason: "preserve" });
    await (0, applyCreatorCooldown_service_1.applyCreatorCooldownService)({ adminId: String(admin.user._id), creatorProfileId: String(profile._id), days: 1, reason: "admin creator cooldown" });
    let reloaded = await User_1.default.findById(user._id).orFail();
    strict_1.default.ok(reloaded.creatorCooldownUntil);
    strict_1.default.ok(reloaded.userCooldownUntil);
    strict_1.default.equal(reloaded.creatorCooldownReason, "admin creator cooldown");
    await (0, revokeCreatorCooldown_service_1.revokeCreatorCooldownService)({ adminId: String(admin.user._id), creatorProfileId: String(profile._id), reason: "revoke" });
    reloaded = await User_1.default.findById(user._id).orFail();
    const reloadedProfile = await creatorProfile_model_1.CreatorProfile.findById(profile._id).orFail();
    strict_1.default.equal(reloaded.creatorCooldownUntil, null);
    strict_1.default.equal(reloaded.creatorCooldownReason, null);
    strict_1.default.equal(reloaded.creatorCooldownBy, null);
    strict_1.default.equal(reloaded.userCooldownReason, "preserve");
    strict_1.default.equal(reloadedProfile.creatorCooldownUntil, null);
});
(0, node_test_1.test)("G4 cooldown expiry is time-derived at exact boundary", async () => {
    const { user } = await createActor("expiry");
    const now = new Date("2026-08-12T00:00:00.000Z");
    user.userCooldownUntil = new Date(now.getTime());
    user.creatorCooldownUntil = new Date(now.getTime() + 1);
    await user.save();
    let resolved = (0, accountGovernanceResolver_service_1.resolveAccountGovernance)(await User_1.default.findById(user._id).orFail(), now);
    strict_1.default.equal(resolved.isUserCooldownActive, false);
    strict_1.default.equal(resolved.isCreatorCooldownActive, true);
    resolved = (0, accountGovernanceResolver_service_1.resolveAccountGovernance)(await User_1.default.findById(user._id).orFail(), new Date(now.getTime() + 1));
    strict_1.default.equal(resolved.isCreatorCooldownActive, false);
});
(0, node_test_1.test)("G4 trust reset clears cooldown metadata while preserving canonical suspension and ban", async () => {
    for (const state of ["ACTIVE", "SUSPENDED", "BANNED"]) {
        const { user } = await createActor(`trust-${state}`, state);
        user.abuseScore = 55;
        user.userCooldownUntil = new Date(Date.now() + 60000);
        user.userCooldownReason = "user";
        user.creatorCooldownUntil = new Date(Date.now() + 60000);
        user.creatorCooldownReason = "creator";
        await user.save();
        const reset = await (0, cooldownLifecycle_service_1.resetAccountTrust)(String(user._id));
        strict_1.default.equal(reset.governanceState, state);
        strict_1.default.equal(reset.status, state === "BANNED" ? "banned" : state === "SUSPENDED" ? "suspended" : "active");
        strict_1.default.equal(reset.abuseScore, 0);
        strict_1.default.equal(reset.userCooldownUntil, null);
        strict_1.default.equal(reset.creatorCooldownUntil, null);
        strict_1.default.equal(reset.userCooldownReason, null);
        strict_1.default.equal(reset.creatorCooldownReason, null);
    }
});
