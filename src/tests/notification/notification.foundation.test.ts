import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import { Notification, NOTIFICATION_RETENTION_MS } from "../../models/notification.model";
import { NotificationRepository } from "../../repositories/notification.repository";
import { CreateNotificationInput, NotificationService } from "../../services/notification/notification.service";

const recipientId = new mongoose.Types.ObjectId().toString();
const validInput = (): CreateNotificationInput => ({ recipientId, category: "BOOKING", type: "BOOKING_UPDATE", title: "Booking update", body: "Your booking changed.", idempotencyKey: "booking:example:updated" });

test("notification model accepts a minimal valid record and defines required indexes", () => {
  const notification = new Notification({ ...validInput(), recipientId });
  assert.equal(notification.validateSync(), undefined);
  assert.ok(Math.abs(notification.expiresAt.getTime() - (Date.now() + NOTIFICATION_RETENTION_MS)) < 2_000);
  const indexes = Notification.schema.indexes() as Array<[Record<string, number>, Record<string, unknown>]>;
  assert.ok(indexes.some(([keys, options]) => keys.recipientId === 1 && keys.idempotencyKey === 1 && options.unique === true));
  assert.ok(indexes.some(([keys, options]) => keys.expiresAt === 1 && options.expireAfterSeconds === 0));
});

test("notification model rejects missing recipient and oversized content", () => {
  assert.ok(new Notification({ ...validInput(), recipientId: undefined }).validateSync()?.errors.recipientId);
  assert.ok(new Notification({ ...validInput(), title: "x".repeat(161) }).validateSync()?.errors.title);
});

test("service validates navigation, metadata, recipient, type, and idempotency key before persistence", async () => {
  const repository = { findByRecipientAndIdempotencyKey: async () => null, create: async () => { throw new Error("must not persist"); } } as unknown as NotificationRepository;
  const service = new NotificationService(repository);
  await assert.rejects(() => service.create({ ...validInput(), recipientId: "bad" }), { code: "NOTIFICATION_INVALID_RECIPIENT" });
  await assert.rejects(() => service.create({ ...validInput(), navigationPath: "https://unsafe.example" }), { code: "NOTIFICATION_UNSAFE_NAVIGATION" });
  await assert.rejects(() => service.create({ ...validInput(), metadata: { reference: "safe", extra: "unsafe" } as never }), { code: "NOTIFICATION_INVALID_METADATA" });
  await assert.rejects(() => service.create({ ...validInput(), category: "BOOKING", type: "DISPUTE_UPDATE" }), { code: "NOTIFICATION_UNSUPPORTED_TYPE" });
  await assert.rejects(() => service.create({ ...validInput(), idempotencyKey: " " }), { code: "NOTIFICATION_INVALID_INPUT" });
  await assert.rejects(() => service.create({ ...validInput(), title: "<script>alert(1)</script>" }), { code: "NOTIFICATION_INVALID_INPUT" });
});

test("service returns an existing record for replay without mutation", async () => {
  const existing = new Notification({ ...validInput(), recipientId, readAt: new Date("2026-01-01T00:00:00.000Z"), expiresAt: new Date("2026-03-01T00:00:00.000Z") });
  const repository = { findByRecipientAndIdempotencyKey: async () => existing, create: async () => { throw new Error("must not create"); } } as unknown as NotificationRepository;
  const result = await new NotificationService(repository).create(validInput());
  assert.equal(result, existing);
  assert.equal(result.readAt?.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.deepEqual(await new NotificationService(repository).createWithOutcome(validInput()), { notification: existing, created: false });
});

test("service resolves a duplicate-key race by returning the winning record", async () => {
  const winner = new Notification({ ...validInput(), recipientId });
  let lookups = 0;
  const duplicate = Object.assign(new Error("duplicate"), { code: 11000 });
  const repository = { findByRecipientAndIdempotencyKey: async () => (++lookups === 1 ? null : winner), create: async () => { throw duplicate; } } as unknown as NotificationRepository;
  assert.equal(await new NotificationService(repository).create(validInput()), winner);
});

test("service exposes non-duplicate storage failures to callers", async () => {
  const storageFailure = new Error("storage unavailable");
  const repository = { findByRecipientAndIdempotencyKey: async () => null, create: async () => { throw storageFailure; } } as unknown as NotificationRepository;
  await assert.rejects(() => new NotificationService(repository).create(validInput()), storageFailure);
});
