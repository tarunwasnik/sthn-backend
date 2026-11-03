import mongoose, { ClientSession } from "mongoose";

import { INotification, Notification } from "../models/notification.model";

export interface NotificationHistoryCursor {
  createdAt: Date;
  id: string;
}

export interface NotificationHistoryResult {
  items: INotification[];
  nextCursor: NotificationHistoryCursor | null;
}

const MAX_HISTORY_LIMIT = 100;
const normalizedLimit = (limit?: number) => Math.min(Math.max(Math.floor(limit ?? 25), 1), MAX_HISTORY_LIMIT);
const isId = (value: string) => mongoose.Types.ObjectId.isValid(value);
const unexpired = (now: Date) => ({ expiresAt: { $gt: now } });

export class NotificationRepository {
  async create(notification: Partial<INotification>, session?: ClientSession): Promise<INotification> {
    const created = await Notification.create([notification], { session });
    return created[0];
  }

  findByRecipientAndIdempotencyKey(recipientId: string, idempotencyKey: string, session?: ClientSession): Promise<INotification | null> {
    if (!isId(recipientId)) return Promise.resolve(null);
    return Notification.findOne({ recipientId, idempotencyKey }).session(session ?? null).exec();
  }

  async findHistory(recipientId: string, options: { limit?: number; before?: NotificationHistoryCursor } = {}, session?: ClientSession): Promise<NotificationHistoryResult> {
    if (!isId(recipientId)) return { items: [], nextCursor: null };
    const limit = normalizedLimit(options.limit);
    const now = new Date();
    const filter: Record<string, unknown> = { recipientId, ...unexpired(now) };
    if (options.before && isId(options.before.id) && !Number.isNaN(options.before.createdAt.getTime())) {
      filter.$or = [
        { createdAt: { $lt: options.before.createdAt } },
        { createdAt: options.before.createdAt, _id: { $lt: new mongoose.Types.ObjectId(options.before.id) } },
      ];
    }
    const rows = await Notification.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).session(session ?? null).exec();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items.length ? items[items.length - 1] : undefined;
    return { items, nextCursor: hasMore && last ? { createdAt: last.createdAt, id: String(last._id) } : null };
  }

  countUnread(recipientId: string, session?: ClientSession): Promise<number> {
    if (!isId(recipientId)) return Promise.resolve(0);
    return Notification.countDocuments({ recipientId, readAt: null, ...unexpired(new Date()) }).session(session ?? null).exec();
  }

  async markOneRead(recipientId: string, notificationId: string, now = new Date(), session?: ClientSession): Promise<INotification | null> {
    if (!isId(recipientId) || !isId(notificationId)) return null;
    const ownership = { _id: notificationId, recipientId, ...unexpired(now) };
    const changed = await Notification.findOneAndUpdate({ ...ownership, readAt: null }, { $set: { readAt: now } }, { new: true, session }).exec();
    return changed ?? Notification.findOne(ownership).session(session ?? null).exec();
  }

  markAllRead(recipientId: string, now = new Date(), session?: ClientSession) {
    if (!isId(recipientId)) return Promise.resolve({ acknowledged: true, modifiedCount: 0, matchedCount: 0 });
    return Notification.updateMany({ recipientId, readAt: null, ...unexpired(now) }, { $set: { readAt: now } }, { session }).exec();
  }
}

export const notificationRepository = new NotificationRepository();
