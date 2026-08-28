"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetAccountTrust = exports.revokeAccountCooldown = exports.applyAccountCooldown = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = __importDefault(require("../../models/User"));
const assertInput = (userId, until) => {
    if (!mongoose_1.default.Types.ObjectId.isValid(userId))
        throw new Error("Invalid target user id");
    if (until && until.getTime() <= Date.now())
        throw new Error("Cooldown end date must be in the future");
};
const fieldsFor = (kind) => kind === "USER"
    ? { until: "userCooldownUntil", reason: "userCooldownReason", by: "userCooldownBy", triggeredAt: "userCooldownTriggeredAt" }
    : { until: "creatorCooldownUntil", reason: "creatorCooldownReason", by: "creatorCooldownBy", triggeredAt: "creatorCooldownTriggeredAt" };
const applyAccountCooldown = async ({ userId, kind, until, reason = null, actorId = null }) => {
    assertInput(userId, until);
    if (actorId && !mongoose_1.default.Types.ObjectId.isValid(actorId))
        throw new Error("Invalid cooldown actor id");
    const user = await User_1.default.findById(userId);
    if (!user)
        throw new Error("Target user not found");
    const fields = fieldsFor(kind);
    const existing = user[fields.until];
    if (existing && existing.getTime() >= until.getTime()) {
        return { user, until: existing, replay: true };
    }
    user[fields.until] = until;
    user[fields.reason] = reason?.trim() || null;
    user[fields.by] = actorId ? new mongoose_1.default.Types.ObjectId(actorId) : null;
    user[fields.triggeredAt] = new Date();
    await user.save();
    return { user, until, replay: false };
};
exports.applyAccountCooldown = applyAccountCooldown;
const revokeAccountCooldown = async ({ userId, kind }) => {
    assertInput(userId);
    const user = await User_1.default.findById(userId);
    if (!user)
        throw new Error("Target user not found");
    const fields = fieldsFor(kind);
    const wasPresent = Boolean(user[fields.until] || user[fields.reason] || user[fields.by] || user[fields.triggeredAt]);
    user[fields.until] = null;
    user[fields.reason] = null;
    user[fields.by] = null;
    user[fields.triggeredAt] = null;
    await user.save();
    return { user, revoked: wasPresent };
};
exports.revokeAccountCooldown = revokeAccountCooldown;
const resetAccountTrust = async (userId) => {
    assertInput(userId);
    const user = await User_1.default.findById(userId);
    if (!user)
        throw new Error("User not found");
    user.abuseScore = 0;
    for (const kind of ["USER", "CREATOR"]) {
        const fields = fieldsFor(kind);
        user[fields.until] = null;
        user[fields.reason] = null;
        user[fields.by] = null;
        user[fields.triggeredAt] = null;
    }
    user.status = user.governanceState === "BANNED"
        ? "banned"
        : user.governanceState === "SUSPENDED"
            ? "suspended"
            : "active";
    await user.save();
    return user;
};
exports.resetAccountTrust = resetAccountTrust;
