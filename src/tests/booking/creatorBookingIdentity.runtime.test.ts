import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { Types } from "mongoose";
import type { Request, Response } from "express";

import { getCreatorBookingDetails } from "../../controllers/creatorBookingDetails.controller";
import { getCreatorBookings } from "../../controllers/creatorBookingDecision.controller";
import { Booking } from "../../models/booking.model";
import { CreatorProfile } from "../../models/creatorProfile.model";
import { CreatorService } from "../../models/creatorService.model";
import { Slot } from "../../models/slot.model";
import { UserProfile } from "../../models/userProfile.model";

const originals = {
  bookingFindOne: Booking.findOne,
  bookingFind: Booking.find,
  creatorFindOne: CreatorProfile.findOne,
  serviceFindById: CreatorService.findById,
  serviceFind: CreatorService.find,
  slotFind: Slot.find,
  userFindOne: UserProfile.findOne,
  userFind: UserProfile.find,
};

afterEach(() => {
  Booking.findOne = originals.bookingFindOne;
  Booking.find = originals.bookingFind;
  CreatorProfile.findOne = originals.creatorFindOne;
  CreatorService.findById = originals.serviceFindById;
  CreatorService.find = originals.serviceFind;
  Slot.find = originals.slotFind;
  UserProfile.findOne = originals.userFindOne;
  UserProfile.find = originals.userFind;
});

const response = () => {
  let statusCode: number | undefined;
  let body: unknown;
  const value = {
    status(code: number) { statusCode = code; return value; },
    json(next: unknown) { body = next; return value; },
  } as unknown as Response;
  return { value, result: () => ({ statusCode, body }) };
};

const bookingFixture = () => ({
  _id: new Types.ObjectId(),
  userId: new Types.ObjectId(),
  creatorId: new Types.ObjectId(),
  serviceId: new Types.ObjectId(),
  slotIds: [new Types.ObjectId()],
  serviceTitle: "Portrait session",
  status: "CONFIRMED",
  paymentStatus: "PAID",
});

test("Creator booking detail uses the Customer's dedicated User avatar, not gallery media", async () => {
  const booking = bookingFixture();
  Booking.findOne = (() => ({ lean: async () => booking })) as typeof Booking.findOne;
  Slot.find = (() => ({ sort: () => ({ lean: async () => [] }) })) as typeof Slot.find;
  UserProfile.findOne = (() => ({ lean: async () => ({ username: "Creator 45", avatar: "https://media.test/white-user-avatar.jpg", profilePhotos: ["https://media.test/dark-gallery.jpg"] }) })) as typeof UserProfile.findOne;
  CreatorService.findById = (() => ({ lean: async () => null })) as typeof CreatorService.findById;

  const res = response();
  await getCreatorBookingDetails({ params: { id: String(booking._id) }, user: { id: String(booking.creatorId) } } as unknown as Request, res.value);
  const body = res.result().body as { booking: { user: { avatarUrl: string | null } } };
  assert.equal(res.result().statusCode, 200);
  assert.equal(body.booking.user.avatarUrl, "https://media.test/white-user-avatar.jpg");
});

test("Creator booking list keeps a Creator acting as Customer on their User avatar", async () => {
  const booking = bookingFixture();
  CreatorProfile.findOne = (() => ({ status: "active" })) as unknown as typeof CreatorProfile.findOne;
  Booking.find = (() => ({ sort: () => ({ lean: async () => [booking] }) })) as typeof Booking.find;
  UserProfile.find = (() => ({ lean: async () => [{ userId: booking.userId, username: "Creator 45", avatar: "https://media.test/white-user-avatar.jpg", profilePhotos: ["https://media.test/dark-gallery.jpg"] }] })) as typeof UserProfile.find;
  Slot.find = (() => ({ lean: async () => [] })) as typeof Slot.find;
  CreatorService.find = (() => ({ lean: async () => [{ _id: booking.serviceId, title: booking.serviceTitle, media: ["https://media.test/service.jpg"] }] })) as typeof CreatorService.find;

  const res = response();
  await getCreatorBookings({ query: {}, user: { id: String(booking.creatorId) } } as unknown as Request, res.value);
  const body = res.result().body as { bookings: Array<{ user: { avatarUrl: string | null } }> };
  assert.equal(res.result().statusCode, 200);
  assert.equal(body.bookings[0].user.avatarUrl, "https://media.test/white-user-avatar.jpg");
});
