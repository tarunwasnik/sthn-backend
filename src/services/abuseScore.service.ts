//backend/src/services/abuseScore.service.ts


import mongoose from "mongoose";
import User from "../models/User";
import { applyCooldownIfNeeded } from "./cooldownEngine.service";

/**
 * All abuse-triggering events in the system
 * (single source of truth)
 */
export type AbuseEvent =
  | "USER_CANCEL_EARLY"
  | "USER_CANCEL_MID"
  | "USER_CANCEL_LATE"
  | "USER_CANCEL_AFTER_INTERACTION"
  | "CREATOR_CANCEL"
  | "CREATOR_CANCEL_AFTER_INTERACTION"
  | "BOOKING_COMPLETED"
  | "CHAT_CONTACT_ATTEMPT"
  | "CHAT_CONTACT_AFTER_INTERACTION";

/**
 * Score delta per abuse event
 */
const SCORE_MAP: Record<AbuseEvent, number> = {
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
export const applyAbuseScore = async (
  userId: mongoose.Types.ObjectId,
  event: AbuseEvent,
  session?: mongoose.ClientSession
): Promise<number> => {
  const delta = SCORE_MAP[event];
  if (delta === undefined) {
    // No-op, but return current score safely
    const user = await User.findById(userId).select("abuseScore");
    return user?.abuseScore ?? 0;
  }

  const update: any = {
    $inc: { abuseScore: delta },
  };

  // Prevent negative abuse score
  if (delta < 0) {
    update.$max = { abuseScore: 0 };
  }

  // Apply update
  await User.updateOne(
    { _id: userId },
    update,
    { session }
  );

  // 🔁 Immediately evaluate cooldowns
  await applyCooldownIfNeeded(userId.toString());

  // ✅ Fetch and return updated score
  const updatedUser = await User.findById(userId).select("abuseScore");

  return updatedUser?.abuseScore ?? 0;
};