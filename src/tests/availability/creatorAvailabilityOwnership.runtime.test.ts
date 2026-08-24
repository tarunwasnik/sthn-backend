import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { Types } from "mongoose";
import type { Request, Response } from "express";

import User from "../../models/User";
import { Availability } from "../../models/availability.model";
import { CreatorService } from "../../models/creatorService.model";
import { Slot } from "../../models/slot.model";
import {
  cancelAvailability,
  createAvailability,
  deleteSlot,
  disableSlot,
  enableSlot,
  getAvailabilitySlots,
} from "../../controllers/creatorAvailability.controller";
import {
  clearPhase7HDatabase,
  connectPhase7HDatabase,
  disconnectPhase7HDatabase,
} from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";

type Result = { statusCode?: number; body?: unknown; response: Response };

const response = (): Result => {
  const result = {} as Result;
  result.response = {
    status: (statusCode: number) => {
      result.statusCode = statusCode;
      return result.response;
    },
    json: (body: unknown) => {
      result.body = body;
      return result.response;
    },
  } as unknown as Response;
  return result;
};

const request = (userId: Types.ObjectId, params: Record<string, string> = {}, body: Record<string, unknown> = {}) => ({
  user: { id: String(userId), role: "creator" },
  params,
  body,
});

async function fixture() {
  const suffix = new Types.ObjectId().toString();
  const [creatorA, creatorB] = await Promise.all([
    User.create({ email: `availability-a-${suffix}@test.local`, password: "test", role: "creator", status: "active", governanceState: "ACTIVE" }),
    User.create({ email: `availability-b-${suffix}@test.local`, password: "test", role: "creator", status: "active", governanceState: "ACTIVE" }),
  ]);
  const [serviceA, serviceB] = await Promise.all([
    CreatorService.create({ creatorId: creatorA._id, title: "A service", description: "A", durationMinutes: 60, price: 100, currency: "USD", isActive: true }),
    CreatorService.create({ creatorId: creatorB._id, title: "B service", description: "B", durationMinutes: 60, price: 100, currency: "USD", isActive: true }),
  ]);
  const date = new Date(Date.now() + 86_400_000 * 7);
  const [availabilityA, availabilityB] = await Promise.all([
    Availability.create({ creatorId: creatorA._id, serviceId: serviceA._id, date, startTime: "10:00", endTime: "12:00", timezone: "UTC", slotDurationMinutes: 60, status: "ACTIVE" }),
    Availability.create({ creatorId: creatorB._id, serviceId: serviceB._id, date, startTime: "10:00", endTime: "12:00", timezone: "UTC", slotDurationMinutes: 60, status: "ACTIVE" }),
  ]);
  const [slotA, slotB] = await Promise.all([
    Slot.create({ availabilityId: availabilityA._id, creatorId: creatorA._id, serviceId: serviceA._id, startTime: date, endTime: new Date(date.getTime() + 3_600_000), timezone: "UTC", status: "AVAILABLE", price: 100 }),
    Slot.create({ availabilityId: availabilityB._id, creatorId: creatorB._id, serviceId: serviceB._id, startTime: date, endTime: new Date(date.getTime() + 3_600_000), timezone: "UTC", status: "AVAILABLE", price: 100 }),
  ]);
  return { creatorA, creatorB, serviceA, serviceB, availabilityA, availabilityB, slotA, slotB };
}

before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

test("create availability permits the owner and rejects another creator's service without writes", async () => {
  const { creatorA, serviceA, serviceB } = await fixture();
  const date = new Date(Date.now() + 86_400_000 * 14).toISOString().slice(0, 10);
  const body = { date, startTime: "10:00", endTime: "11:00", timezone: "UTC" };

  const own = response();
  await createAvailability(request(creatorA._id, {}, { ...body, serviceId: String(serviceA._id) }) as unknown as Request, own.response);
  assert.equal(own.statusCode, 201);

  const beforeAvailabilityCount = await Availability.countDocuments({ creatorId: creatorA._id, serviceId: serviceB._id });
  const beforeSlotCount = await Slot.countDocuments({ creatorId: creatorA._id, serviceId: serviceB._id });
  const crossOwner = response();
  await createAvailability(request(creatorA._id, {}, { ...body, serviceId: String(serviceB._id) }) as unknown as Request, crossOwner.response);
  assert.equal(crossOwner.statusCode, 404);
  assert.equal(await Availability.countDocuments({ creatorId: creatorA._id, serviceId: serviceB._id }), beforeAvailabilityCount);
  assert.equal(await Slot.countDocuments({ creatorId: creatorA._id, serviceId: serviceB._id }), beforeSlotCount);
});

test("private availability reads and parent cancellation are ownership-scoped", async () => {
  const { creatorA, availabilityA, availabilityB, slotA, slotB } = await fixture();
  const ownCancel = response();
  await cancelAvailability(request(creatorA._id, { availabilityId: String(availabilityA._id) }) as unknown as Request, ownCancel.response);
  assert.equal(ownCancel.statusCode, 200);
  assert.equal((await Availability.findById(availabilityA._id).orFail()).status, "CANCELLED");
  assert.equal((await Slot.findById(slotA._id).orFail()).status, "CANCELLED");

  const read = response();
  await getAvailabilitySlots(request(creatorA._id, { availabilityId: String(availabilityB._id) }) as unknown as Request, read.response);
  assert.equal(read.statusCode, 404);
  assert.equal(((await Slot.findById(slotB._id).orFail()).status), "AVAILABLE");

  const cancel = response();
  await cancelAvailability(request(creatorA._id, { availabilityId: String(availabilityB._id) }) as unknown as Request, cancel.response);
  assert.equal(cancel.statusCode, 400);
  assert.equal((await Availability.findById(availabilityB._id).orFail()).status, "ACTIVE");
  assert.equal((await Slot.findById(slotB._id).orFail()).status, "AVAILABLE");
});

test("slot mutations are ownership-scoped and preserve the victim slot", async () => {
  const { creatorA, creatorB, availabilityA, serviceA, slotA, slotB } = await fixture();

  const ownDisable = response();
  await disableSlot(request(creatorA._id, { slotId: String(slotA._id) }) as unknown as Request, ownDisable.response);
  assert.equal(ownDisable.statusCode, 200);
  assert.equal((await Slot.findById(slotA._id).orFail()).status, "CANCELLED");

  const ownEnable = response();
  await enableSlot(request(creatorA._id, { slotId: String(slotA._id) }) as unknown as Request, ownEnable.response);
  assert.equal(ownEnable.statusCode, 200);
  assert.equal((await Slot.findById(slotA._id).orFail()).status, "AVAILABLE");

  const disableVictim = response();
  await disableSlot(request(creatorA._id, { slotId: String(slotB._id) }) as unknown as Request, disableVictim.response);
  assert.equal(disableVictim.statusCode, 404);
  assert.equal((await Slot.findById(slotB._id).orFail()).status, "AVAILABLE");

  await Slot.updateOne({ _id: slotB._id }, { $set: { status: "CANCELLED" } });
  const enableVictim = response();
  await enableSlot(request(creatorA._id, { slotId: String(slotB._id) }) as unknown as Request, enableVictim.response);
  assert.equal(enableVictim.statusCode, 404);
  assert.equal((await Slot.findById(slotB._id).orFail()).status, "CANCELLED");

  const deleteVictim = response();
  await deleteSlot(request(creatorA._id, { slotId: String(slotB._id) }) as unknown as Request, deleteVictim.response);
  assert.equal(deleteVictim.statusCode, 404);
  assert.ok(await Slot.exists({ _id: slotB._id }));

  const ownSlot = await Slot.create({ availabilityId: availabilityA._id, creatorId: creatorA._id, serviceId: serviceA._id, startTime: new Date(), endTime: new Date(Date.now() + 3_600_000), timezone: "UTC", status: "AVAILABLE", price: 100 });
  const ownDelete = response();
  await deleteSlot(request(creatorA._id, { slotId: String(ownSlot._id) }) as unknown as Request, ownDelete.response);
  assert.equal(ownDelete.statusCode, 200);
  assert.equal(await Slot.exists({ _id: ownSlot._id }), null);
  assert.equal(String(creatorB._id).length > 0, true);
});

test("malformed availability, slot, and service IDs fail with bounded 400 responses", async () => {
  const { creatorA } = await fixture();
  const invalidAvailability = response();
  await getAvailabilitySlots(request(creatorA._id, { availabilityId: "invalid" }) as unknown as Request, invalidAvailability.response);
  assert.equal(invalidAvailability.statusCode, 400);

  const invalidSlot = response();
  await disableSlot(request(creatorA._id, { slotId: "invalid" }) as unknown as Request, invalidSlot.response);
  assert.equal(invalidSlot.statusCode, 400);

  const invalidService = response();
  await createAvailability(request(creatorA._id, {}, { serviceId: "invalid", date: "2099-01-01", startTime: "10:00", endTime: "11:00", timezone: "UTC" }) as unknown as Request, invalidService.response);
  assert.equal(invalidService.statusCode, 400);
});
