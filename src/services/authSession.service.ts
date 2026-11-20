import mongoose from "mongoose";
import { AuthSession } from "../models/authSession.model";
export const AUTH_SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export const createAuthSession = (userId: string) => AuthSession.create({ userId, expiresAt: new Date(Date.now() + AUTH_SESSION_MS), lastSeenAt: new Date() });
export const validAuthSession = async (id: string, userId: string) => mongoose.Types.ObjectId.isValid(id) && Boolean(await AuthSession.exists({ _id: id, userId, revokedAt: null, expiresAt: { $gt: new Date() } }));
export const revokeAuthSession = (id: string, userId: string) => AuthSession.findOneAndUpdate({ _id: id, userId, revokedAt: null }, { $set: { revokedAt: new Date() } }, { new: true });
/** Idempotent current-session revocation used by normal logout. */
export const revokeCurrentAuthSession = async (id: string, userId: string): Promise<void> => {
  await AuthSession.updateOne({ _id: id, userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
};
export const revokeOtherAuthSessions = (userId: string, currentId: string) => AuthSession.updateMany({ userId, _id: { $ne: currentId }, revokedAt: null }, { $set: { revokedAt: new Date() } });
