import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import { INotification, Notification } from "../../models/notification.model";
import { NotificationRepository } from "../../repositories/notification.repository";
import { createNotificationController } from "../../controllers/notification.controller";
import { NotificationRecipientService } from "../../services/notification/notificationRecipient.service";

const recipient = new mongoose.Types.ObjectId().toString();
const otherRecipient = new mongoose.Types.ObjectId().toString();
const notificationId = new mongoose.Types.ObjectId().toString();

const notification = (overrides: Record<string, unknown> = {}) => new Notification({
  _id: new mongoose.Types.ObjectId(notificationId), recipientId: recipient, category: "BOOKING", type: "BOOKING_UPDATE",
  title: "Booking update", body: "Your booking changed", idempotencyKey: "booking:one", createdAt: new Date("2026-01-01T00:00:00.000Z"),
  expiresAt: new Date("2026-04-01T00:00:00.000Z"), ...overrides,
}) as INotification;

function response() {
  let statusCode = 200; let payload: unknown;
  const res = { status(code: number) { statusCode = code; return this; }, json(value: unknown) { payload = value; return this; } };
  return { res, result: () => ({ statusCode, payload }) };
}

function controller(repository: Partial<NotificationRepository>) {
  return createNotificationController(new NotificationRecipientService(repository as NotificationRepository));
}

test("history is authenticated, recipient-scoped, paginated, and safely serialized", async () => {
  let receivedRecipient = ""; let receivedLimit = 0;
  const item = notification({ metadata: { reference: "BK-1", amount: 100, currency: "USD" } });
  const handlers = controller({ findHistory: async (id, options) => { receivedRecipient = id; receivedLimit = options?.limit ?? 0; return { items: [item], nextCursor: { createdAt: item.createdAt, id: String(item._id) } }; } });
  const unauthenticated = response();
  await handlers.getHistory({ query: {}, user: undefined } as any, unauthenticated.res as any);
  assert.deepEqual(unauthenticated.result(), { statusCode: 401, payload: { message: "Not authorized" } });
  const authenticated = response();
  await handlers.getHistory({ query: {}, user: { id: recipient } } as any, authenticated.res as any);
  const body = authenticated.result().payload as { notifications: Array<Record<string, unknown>>; nextCursor: string; hasMore: boolean };
  assert.equal(receivedRecipient, recipient); assert.equal(receivedLimit, 20); assert.equal(body.notifications[0].recipientId, undefined); assert.equal(body.notifications[0].idempotencyKey, undefined); assert.equal(body.hasMore, true); assert.equal(typeof body.nextCursor, "string");
  assert.equal((body.notifications[0].metadata as Record<string, unknown>).amount, undefined);
  assert.equal((body.notifications[0].metadata as Record<string, unknown>).currency, undefined);
});

test("history rejects malformed cursors and unbounded page sizes", async () => {
  const handlers = controller({ findHistory: async () => ({ items: [], nextCursor: null }) });
  await assert.rejects(() => handlers.getHistory({ query: { cursor: "not-a-cursor" }, user: { id: recipient } } as any, response().res as any), { code: "INVALID_NOTIFICATION_REQUEST" });
  await assert.rejects(() => handlers.getHistory({ query: { limit: "51" }, user: { id: recipient } } as any, response().res as any), { code: "INVALID_NOTIFICATION_REQUEST" });
});

test("unread and read endpoints use only the authenticated recipient", async () => {
  const calls: string[] = [];
  const handlers = controller({
    countUnread: async (id) => { calls.push(`count:${id}`); return 2; },
    markOneRead: async (id, idToRead) => { calls.push(`one:${id}:${idToRead}`); return id === recipient ? notification({ readAt: new Date("2026-01-02T00:00:00.000Z") }) : null; },
    markAllRead: async (id) => { calls.push(`all:${id}`); return { modifiedCount: 2, matchedCount: 2 } as any; },
  });
  const unread = response(); await handlers.getUnreadCount({ query: {}, user: { id: recipient } } as any, unread.res as any);
  assert.deepEqual(unread.result(), { statusCode: 200, payload: { unreadCount: 2 } });
  const read = response(); await handlers.markOneRead({ params: { notificationId }, user: { id: recipient } } as any, read.res as any);
  assert.equal(read.result().statusCode, 200);
  const all = response(); await handlers.markAllRead({ user: { id: recipient } } as any, all.res as any);
  assert.deepEqual(all.result(), { statusCode: 200, payload: { modifiedCount: 2, unreadCount: 2 } });
  assert.ok(calls.every((entry) => entry.includes(recipient)));
  assert.equal(calls.some((entry) => entry.includes(otherRecipient)), false);
});

test("read-one rejects invalid IDs and returns the same non-disclosing result for non-owned records", async () => {
  const handlers = controller({ markOneRead: async () => null });
  await assert.rejects(() => handlers.markOneRead({ params: { notificationId: "invalid" }, user: { id: recipient } } as any, response().res as any), { code: "INVALID_NOTIFICATION_REQUEST" });
  const res = response(); await handlers.markOneRead({ params: { notificationId }, user: { id: recipient } } as any, res.res as any);
  assert.deepEqual(res.result(), { statusCode: 404, payload: { message: "Notification not found" } });
});
