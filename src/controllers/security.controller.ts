import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import User from "../models/User";
import { AuthSession } from "../models/authSession.model";
import { revokeAuthSession, revokeCurrentAuthSession, revokeOtherAuthSessions } from "../services/authSession.service";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";
import { disconnectAuthSession } from "../sockets/chat.socket";
import { validateNewPassword } from "../services/auth/passwordPolicy.service";
import { clearPasswordChangeFailures, recordFailedPasswordChange } from "../services/auth/passwordChangeProtection.service";
import { assertPasswordNotBreached } from "../services/auth/breachedPassword.service";
import { recordVisitorTelemetry } from "../services/visitorMonitor.service";

const sessionId = (req: Request) => (req as Request & { authSessionId?: string }).authSessionId!;
export const listMySessions = catchAsync(async (req: Request, res: Response) => {
  const rows = await AuthSession.find({ userId: req.user!.id, expiresAt: { $gt: new Date() }, revokedAt: null }).sort({ lastSeenAt: -1 }).lean();
  res.json({ sessions: rows.map((row) => ({ id: String(row._id), current: String(row._id) === sessionId(req), createdAt: row.createdAt, lastSeenAt: row.lastSeenAt, expiresAt: row.expiresAt })) });
});
export const revokeMySession = catchAsync(async (req: Request, res: Response) => { if (!mongoose.Types.ObjectId.isValid(req.params.sessionId)) throw new AppError("Session not found.", 404); const row = await revokeAuthSession(req.params.sessionId, req.user!.id); if (!row) throw new AppError("Session not found.", 404); disconnectAuthSession(req.params.sessionId); res.json({ revoked: true }); });
export const logoutCurrentSession = catchAsync(async (req: Request, res: Response) => { const currentSessionId = sessionId(req); await revokeCurrentAuthSession(currentSessionId, req.user!.id); void recordVisitorTelemetry(req, { visitorId: typeof req.headers["x-visitor-id"] === "string" ? req.headers["x-visitor-id"] : "", type: "LOGOUT" }).catch(() => undefined); disconnectAuthSession(currentSessionId); res.json({ loggedOut: true }); });
export const revokeMyOtherSessions = catchAsync(async (req: Request, res: Response) => { const others = await AuthSession.find({ userId: req.user!.id, _id: { $ne: sessionId(req) }, revokedAt: null }).select("_id").lean(); const result = await revokeOtherAuthSessions(req.user!.id, sessionId(req)); others.forEach((row) => disconnectAuthSession(String(row._id))); res.json({ revokedCount: result.modifiedCount }); });
export const changeMyPassword = catchAsync(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body ?? {}; const user = await User.findById(req.user!.id).select("password authProvider passwordChangeFailures passwordChangeCooldownUntil");
  if (!user || user.authProvider !== "local" || !user.password) throw new AppError("Password changes are unavailable for this sign-in method.", 409, "PASSWORD_CHANGE_UNAVAILABLE");
  if (user.passwordChangeCooldownUntil && user.passwordChangeCooldownUntil > new Date()) throw new AppError("Try again later.", 429, "PASSWORD_CHANGE_COOLDOWN");
  if (typeof currentPassword !== "string" || !(await bcrypt.compare(currentPassword, user.password))) { await recordFailedPasswordChange(String(user._id)); throw new AppError("Current password is incorrect.", 400, "CURRENT_PASSWORD_INCORRECT"); }
  const next = validateNewPassword(newPassword);
  if (await bcrypt.compare(next, user.password)) throw new AppError("New password must be different from your current password.", 400, "PASSWORD_REUSE");
  await assertPasswordNotBreached(next);
  user.password = await bcrypt.hash(next, 10); await user.save(); await clearPasswordChangeFailures(String(user._id)); const others = await AuthSession.find({ userId: user._id, _id: { $ne: sessionId(req) }, revokedAt: null }).select("_id").lean(); await revokeOtherAuthSessions(String(user._id), sessionId(req)); others.forEach((row) => disconnectAuthSession(String(row._id))); res.json({ changed: true });
});
