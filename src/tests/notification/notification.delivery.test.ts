import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import { Notification, INotification } from "../../models/notification.model";
import { NotificationDeliveryService } from "../../services/notification/notificationDelivery.service";
import { personalRoom } from "../../sockets/chat.socket";

const recipientId = new mongoose.Types.ObjectId().toString();
const notification = (overrides: Record<string, unknown> = {}) => new Notification({
  recipientId, category: "BOOKING", type: "BOOKING_UPDATE", title: "Booking update", body: "Your booking changed",
  idempotencyKey: "booking:delivery", expiresAt: new Date(Date.now() + 60_000), ...overrides,
}) as INotification;

class FakeIo {
  readonly rooms = new Map<string, Set<string>>();
  readonly emitted: Array<{ room: string; event: string; payload: Record<string, unknown> }> = [];
  readonly sockets = { adapter: { rooms: this.rooms } };
  shouldThrow = false;

  to(room: string) {
    return { emit: (event: string, payload: unknown) => {
      if (this.shouldThrow) throw new Error("socket unavailable");
      this.emitted.push({ room, event, payload: payload as Record<string, unknown> });
    } };
  }
}

test("delivery emits only the persisted recipient's personal room with the REST-safe payload", () => {
  const io = new FakeIo(); io.rooms.set(personalRoom(recipientId), new Set(["socket-a"]));
  const record = notification({ metadata: { reference: "BK-1", amount: 100, currency: "USD" } });
  const result = new NotificationDeliveryService(() => io).deliverPersisted(record, { postCommit: true });
  assert.deepEqual(result, { status: "DELIVERED", delivered: true });
  assert.equal(io.emitted.length, 1); assert.equal(io.emitted[0].room, personalRoom(recipientId)); assert.equal(io.emitted[0].event, "notification:created");
  assert.equal(io.emitted[0].payload.recipientId, undefined); assert.equal(io.emitted[0].payload.idempotencyKey, undefined); assert.equal(io.emitted[0].payload._id, undefined);
  assert.equal(io.emitted[0].payload.id, String(record._id));
});

test("delivery never emits before post-commit or when a transaction session is supplied", () => {
  const io = new FakeIo(); io.rooms.set(personalRoom(recipientId), new Set(["socket-a"]));
  const service = new NotificationDeliveryService(() => io);
  assert.deepEqual(service.deliverPersisted(notification(), { postCommit: false }), { status: "UNCOMMITTED_TRANSACTION", delivered: false });
  assert.deepEqual(service.deliverPersisted(notification(), { postCommit: true, session: {} }), { status: "UNCOMMITTED_TRANSACTION", delivered: false });
  assert.equal(io.emitted.length, 0);
});

test("delivery safely reports unavailable socket, offline recipient, invalid notification, and emit failure", () => {
  assert.deepEqual(new NotificationDeliveryService(() => null).deliverPersisted(notification(), { postCommit: true }), { status: "SOCKET_UNAVAILABLE", delivered: false });
  const offline = new FakeIo(); assert.deepEqual(new NotificationDeliveryService(() => offline).deliverPersisted(notification(), { postCommit: true }), { status: "RECIPIENT_OFFLINE", delivered: false });
  const online = new FakeIo(); online.rooms.set(personalRoom(recipientId), new Set(["socket-a"])); online.shouldThrow = true;
  assert.deepEqual(new NotificationDeliveryService(() => online).deliverPersisted(notification(), { postCommit: true }), { status: "EMIT_FAILED", delivered: false });
  assert.deepEqual(new NotificationDeliveryService(() => online).deliverPersisted(notification({ expiresAt: new Date(Date.now() - 1) }), { postCommit: true }), { status: "INELIGIBLE_NOTIFICATION", delivered: false });
});
