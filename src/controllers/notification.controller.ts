/// <reference path="../types/express.d.ts" />

import { Request, Response } from "express";
import mongoose from "mongoose";

import { serializeNotification } from "../dtos/notification/notification.response.dto";
import { NotificationHistoryCursor } from "../repositories/notification.repository";
import { NotificationRecipientService, notificationRecipientService } from "../services/notification/notificationRecipient.service";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

const badRequest = (message: string) => Object.assign(new Error(message), { statusCode: 400, code: "INVALID_NOTIFICATION_REQUEST" });

const recipientId = (req: Request): string | null => req.user?.id ?? null;

const queryString = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw badRequest("Invalid notification query.");
  return value;
};

const pageSize = (value: unknown): number => {
  const raw = queryString(value);
  if (raw === undefined) return DEFAULT_PAGE_SIZE;
  if (!/^[1-9]\d*$/.test(raw)) throw badRequest("Invalid notification page size.");
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed > MAX_PAGE_SIZE) throw badRequest("Invalid notification page size.");
  return parsed;
};

const decodeCursor = (value: unknown): NotificationHistoryCursor | undefined => {
  const raw = queryString(value);
  if (raw === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    const cursor = parsed as Record<string, unknown>;
    if (Object.keys(cursor).length !== 2 || typeof cursor.createdAt !== "string" || typeof cursor.id !== "string" || !mongoose.Types.ObjectId.isValid(cursor.id)) throw new Error("invalid");
    const createdAt = new Date(cursor.createdAt);
    if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== cursor.createdAt) throw new Error("invalid");
    return { createdAt, id: cursor.id };
  } catch {
    throw badRequest("Invalid notification cursor.");
  }
};

const encodeCursor = (cursor: NotificationHistoryCursor | null): string | null => cursor
  ? Buffer.from(JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id })).toString("base64url")
  : null;

export const createNotificationController = (service: NotificationRecipientService = notificationRecipientService) => ({
  getHistory: async (req: Request, res: Response) => {
    const recipient = recipientId(req);
    if (!recipient) return res.status(401).json({ message: "Not authorized" });
    const result = await service.getHistory(recipient, { limit: pageSize(req.query.limit), before: decodeCursor(req.query.cursor) });
    return res.status(200).json({ notifications: result.items.map(serializeNotification), nextCursor: encodeCursor(result.nextCursor), hasMore: result.nextCursor !== null });
  },

  getUnreadCount: async (req: Request, res: Response) => {
    const recipient = recipientId(req);
    if (!recipient) return res.status(401).json({ message: "Not authorized" });
    return res.status(200).json({ unreadCount: await service.getUnreadCount(recipient) });
  },

  markOneRead: async (req: Request, res: Response) => {
    const recipient = recipientId(req);
    const notificationId = req.params.notificationId;
    if (!recipient) return res.status(401).json({ message: "Not authorized" });
    if (!mongoose.Types.ObjectId.isValid(notificationId)) throw badRequest("Invalid notification identifier.");
    const notification = await service.markOneRead(recipient, notificationId);
    if (!notification) return res.status(404).json({ message: "Notification not found" });
    return res.status(200).json({ notification: serializeNotification(notification) });
  },

  markAllRead: async (req: Request, res: Response) => {
    const recipient = recipientId(req);
    if (!recipient) return res.status(401).json({ message: "Not authorized" });
    return res.status(200).json(await service.markAllRead(recipient));
  },
});

export const notificationController = createNotificationController();
