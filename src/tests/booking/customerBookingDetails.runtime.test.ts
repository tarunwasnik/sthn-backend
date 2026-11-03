import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { Types } from "mongoose";
import type { Request, Response } from "express";

import { getCustomerBookingDetails } from "../../controllers/customerBookingDetails.controller";
import { customerBookingReadService } from "../../services/booking/customerBookingRead.service";
import { Booking } from "../../models/booking.model";
import { CreatorProfile } from "../../models/creatorProfile.model";
import { CreatorService } from "../../models/creatorService.model";
import { Slot } from "../../models/slot.model";

const originals = {
  findOne: Booking.findOne,
  slotFind: Slot.find,
  creatorFindOne: CreatorProfile.findOne,
  serviceFindById: CreatorService.findById,
};

afterEach(() => {
  Booking.findOne = originals.findOne;
  Slot.find = originals.slotFind;
  CreatorProfile.findOne = originals.creatorFindOne;
  CreatorService.findById = originals.serviceFindById;
});

test("Customer booking detail read scopes the lookup to the authenticated owner", async () => {
  const bookingId = new Types.ObjectId();
  const customerId = new Types.ObjectId();
  const creatorId = new Types.ObjectId();
  const slotId = new Types.ObjectId();
  let query: Record<string, unknown> | undefined;

  Booking.findOne = ((nextQuery: Record<string, unknown>) => {
    query = nextQuery;
    return { lean: async () => ({ _id: bookingId, userId: customerId, creatorId, serviceId: new Types.ObjectId(), slotIds: [slotId], status: "CONFIRMED", paymentStatus: "PAID", price: 100, serviceAmount: 100, platformFeeAmount: 0, totalAmount: 100, currency: "INR", durationMinutes: 30, expiresAt: new Date(), createdAt: new Date(), completedAt: undefined, serviceTitle: "Test service" }) };
  }) as typeof Booking.findOne;
  Slot.find = (() => ({ sort: () => ({ lean: async () => [{ _id: slotId, startTime: new Date(), endTime: new Date(), status: "LOCKED", price: 100 }] }) })) as typeof Slot.find;
  CreatorProfile.findOne = (() => ({ lean: async () => ({ userId: creatorId, displayName: "Creator" }) })) as typeof CreatorProfile.findOne;
  CreatorService.findById = (() => ({ lean: async () => ({ title: "Live service" }) })) as typeof CreatorService.findById;

  const detail = await customerBookingReadService.getById({ bookingId: String(bookingId), customerId: String(customerId) });
  assert.equal(String(query?._id), String(bookingId));
  assert.equal(String(query?.userId), String(customerId));
  assert.equal(String(detail._id), String(bookingId));
  assert.equal(detail.slots.length, 1);
});

test("Customer booking detail controller rejects an unauthenticated request", async () => {
  let statusCode: number | undefined;
  let body: unknown;
  const response = {
    status(code: number) { statusCode = code; return response; },
    json(value: unknown) { body = value; return response; },
  } as unknown as Response;
  await getCustomerBookingDetails({ params: { bookingId: String(new Types.ObjectId()) } } as unknown as Request, response);
  assert.equal(statusCode, 401);
  assert.deepEqual(body, { message: "Unauthorized" });
});
