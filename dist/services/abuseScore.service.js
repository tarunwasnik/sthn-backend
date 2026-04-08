"use strict";
//backend/src/services/abuseScore.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyAbuseScore = void 0;
const User_1 = __importDefault(require("../models/User"));
const cooldownEngine_service_1 = require("./cooldownEngine.service");
/**
 * Score delta per abuse event
 */
const SCORE_MAP = {
    // USER behavior
    USER_CANCEL_EARLY: 1,
    USER_CANCEL_MID: 3,
    USER_CANCEL_LATE: 7,
    USER_CANCEL_AFTER_INTERACTION: 15,
    // CREATOR behavior
    CREATOR_CANCEL: 5,
    CREATOR_CANCEL_AFTER_INTERACTION: 15,
    // Positive behavior
    BOOKING_COMPLETED: -2,
    // CHAT ABUSE
    CHAT_CONTACT_ATTEMPT: 8,
    CHAT_CONTACT_AFTER_INTERACTION: 20,
};
/**
 * Apply abuse score and trigger cooldown engine
 *
 * ✅ RETURNS updated abuseScore (number)
 */
const applyAbuseScore = async (userId, event, session) => {
    const delta = SCORE_MAP[event];
    if (delta === undefined) {
        // No-op, but return current score safely
        const user = await User_1.default.findById(userId).select("abuseScore");
        return user?.abuseScore ?? 0;
    }
    const update = {
        $inc: { abuseScore: delta },
    };
    // Prevent negative abuse score
    if (delta < 0) {
        update.$max = { abuseScore: 0 };
    }
    // Apply update
    await User_1.default.updateOne({ _id: userId }, update, { session });
    // 🔁 Immediately evaluate cooldowns
    await (0, cooldownEngine_service_1.applyCooldownIfNeeded)(userId.toString());
    // ✅ Fetch and return updated score
    const updatedUser = await User_1.default.findById(userId).select("abuseScore");
    return updatedUser?.abuseScore ?? 0;
};
exports.applyAbuseScore = applyAbuseScore;
