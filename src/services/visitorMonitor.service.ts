import crypto from "crypto";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { Request } from "express";
import { visitorMonitorConfig } from "../config/visitorMonitor";
import { VisitorMonitorEvent, VisitorMonitorSession } from "../models/visitorMonitor.model";
import { validAuthSession } from "./authSession.service";

type Input = { visitorId: string; type: string; route?: string; device?: Record<string, unknown>; data?: Record<string, unknown>; accountId?: string; role?: string };
const allowedTypes = new Set(["VISIT", "NAVIGATION", "ACTIVITY", "VISIBILITY", "ERROR", "LOGIN", "LOGIN_FAILED", "LOGOUT", "SESSION_RESUMED", "DIAGNOSTIC"]);
const route = (value: unknown) => typeof value === "string" && value.startsWith("/") ? value.split("?")[0].slice(0, 240) : undefined;
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const publicIp = (ip: string) => !(ip === "::1" || ip === "127.0.0.1" || ip.startsWith("10.") || ip.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(ip));
const network = (req: Request) => { const ip = req.ip || req.socket.remoteAddress || "unknown"; const forwarded = Boolean(req.headers["x-forwarded-for"] && Number(process.env.TRUSTED_PROXY_HOPS || "0") > 0); return { originType: ip === "::1" || ip === "127.0.0.1" ? "loopback" : publicIp(ip) ? "public" : "private-lan", ipVersion: ip.includes(":") ? "IPv6" : "IPv4", ipHash: publicIp(ip) ? crypto.createHash("sha256").update(`${process.env.JWT_SECRET || "dev"}:${ip}`).digest("hex").slice(0, 24) : undefined, proxyTrusted: forwarded, location: "Unavailable (no configured provider)" }; };
const identity = async (req: Request) => { const raw = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1]; if (!raw) return {}; try { const decoded = jwt.verify(raw, process.env.JWT_SECRET as string) as { id: string; role: string; sid?: string }; if (!decoded.sid || !(await validAuthSession(decoded.sid, decoded.id))) return {}; return { accountId: new mongoose.Types.ObjectId(decoded.id), role: decoded.role }; } catch { return {}; } };

export const recordVisitorTelemetry = async (req: Request, input: Input): Promise<void> => {
  const config = visitorMonitorConfig(); if (!config.enabled || !/^[A-Za-z0-9_-]{12,96}$/.test(input.visitorId) || !allowedTypes.has(input.type)) return;
  const now = new Date(); const expiresAt = new Date(now.getTime() + config.retentionDays * 86400000); const authenticated = await identity(req); const who = input.accountId && mongoose.Types.ObjectId.isValid(input.accountId) ? { accountId: new mongoose.Types.ObjectId(input.accountId), role: input.role } : authenticated; const safeRoute = route(input.route); const safeDevice = object(input.device); const safeData = object(input.data);
  await VisitorMonitorSession.updateOne({ visitorId: input.visitorId }, { $setOnInsert: { firstSeenAt: now }, $set: { lastSeenAt: now, expiresAt, environment: config.environment, ...(who.accountId ? who : {}), ...(safeRoute ? { lastRoute: safeRoute } : {}), ...(safeDevice ? { device: safeDevice } : {}), network: network(req) }, $inc: { eventCount: 1 } }, { upsert: true });
  if (input.type !== "ACTIVITY" || input.data?.force === true) await VisitorMonitorEvent.create({ visitorId: input.visitorId, ...who, type: input.type, route: safeRoute, occurredAt: now, expiresAt, data: safeData });
};

export const visitorMonitorEnabled = () => visitorMonitorConfig().enabled;
