"use strict";
//backend/src/services/cooldownEngine.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyCooldownIfNeeded = void 0;
const User_1 = __importDefault(require("../models/User"));
const nowPlus = (hours) => new Date(Date.now() + hours * 60 * 60 * 1000);
const applyCooldownIfNeeded = async (userId) => {
    const user = await User_1.default.findById(userId);
    if (!user)
        return;
    const score = user.abuseScore;
    let userCooldown;
    let creatorCooldown;
    if (score >= 80) {
        userCooldown = nowPlus(90 * 24);
        creatorCooldown = nowPlus(30 * 24);
    }
    else if (score >= 60) {
        userCooldown = nowPlus(30 * 24);
        creatorCooldown = nowPlus(7 * 24);
    }
    else if (score >= 40) {
        userCooldown = nowPlus(7 * 24);
        creatorCooldown = nowPlus(24);
    }
    else if (score >= 20) {
        userCooldown = nowPlus(24);
    }
    await User_1.default.updateOne({ _id: userId }, {
        ...(userCooldown && { userCooldownUntil: userCooldown }),
        ...(creatorCooldown && { creatorCooldownUntil: creatorCooldown }),
    });
};
exports.applyCooldownIfNeeded = applyCooldownIfNeeded;
