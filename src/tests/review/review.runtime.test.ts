import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Types } from "mongoose";
import type { Request, Response } from "express";

import User from "../../models/User";
import { Booking } from "../../models/booking.model";
import { CreatorProfile } from "../../models/creatorProfile.model";
import { UserProfile } from "../../models/userProfile.model";
import { Review } from "../../models/review.model";
import {
  getMyBookingReviewState,
  getReviewsForCreator,
} from "../../controllers/review.controller";
import { submitReviewService } from "../../services/review/submitReview.service";
import {
  clearPhase7HDatabase,
  connectPhase7HDatabase,
  disconnectPhase7HDatabase,
} from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";

before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

interface MockResponse {
  body?: unknown;
  statusCode?: number;
  response: Response;
}

function response(): MockResponse {
  const result = {} as MockResponse;
  result.response = {
    status: (code: number) => {
      result.statusCode = code;
      return result.response;
    },
    json: (payload: unknown) => {
      result.body = payload;
      return result.response;
    },
  } as unknown as Response;
  return result;
}

async function createFixture(status: "COMPLETED" | "CANCELLED" | "EXPIRED" | "CONFIRMED" = "COMPLETED") {
  const suffix = new Types.ObjectId().toString();
  const customer = await User.create({ email: `review-user-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" });
  const creator = await User.create({ email: `review-creator-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" });
  await CreatorProfile.create({ userId: creator._id, slug: `review-${suffix}`, displayName: "Review Creator", primaryCategory: "test", country: "IN", city: "Test", currency: "INR", status: "active" });
  await UserProfile.create({
    userId: customer._id,
    username: `reviewer-${suffix}`,
    dateOfBirth: new Date("1990-01-01"),
    interests: [],
    bio: "Review test profile",
    avatar: "https://example.test/avatar.png",
    cover: "https://example.test/cover.png",
    profilePhotos: ["https://example.test/one.png", "https://example.test/two.png"],
    profileStatus: "verified",
  });
  const booking = await Booking.create({
    slotIds: [new Types.ObjectId()], userId: customer._id, creatorId: creator._id,
    serviceId: new Types.ObjectId(), serviceTitle: "Review service", durationMinutes: 30,
    price: 100, currency: "INR", status, paymentStatus: "PAID", isPayable: true,
    isPayoutEligible: false, isFinancialLocked: false, expiresAt: new Date(Date.now() + 86_400_000),
    hasInteracted: true, completedAt: status === "COMPLETED" ? new Date() : undefined,
    serviceAmount: 100, platformFeeAmount: 0, commissionAmount: 20, creatorAmount: 80,
    totalAmount: 100,
  });
  return { customer, creator, booking, reviewerUsername: `reviewer-${suffix}` };
}

test("review router is mounted in the active v1 route tree", async () => {
  const routeIndex = await readFile(
    path.resolve(process.cwd(), "src/routes/v1/index.ts"),
    "utf8",
  );
  assert.match(routeIndex, /import reviewRoutes from "\.\/review\.routes"/);
  assert.match(routeIndex, /router\.use\("\/reviews", reviewRoutes\)/);
});

test("completed customer and Creator participants can independently review once", async () => {
  const { customer, creator, booking, reviewerUsername } = await createFixture();
  await submitReviewService({ bookingId: String(booking._id), reviewerId: String(customer._id), rating: 4, comment: "A useful completed session." });
  await submitReviewService({ bookingId: String(booking._id), reviewerId: String(creator._id), rating: 5, comment: "Customer attended the session." });
  assert.equal(await Review.countDocuments({ bookingId: booking._id }), 2);
  const profile = await CreatorProfile.findOne({ userId: creator._id }).orFail();
  assert.equal(profile.reviewCount, 1);
  assert.equal(profile.rating, 4);
});

test("non-completed bookings and unrelated actors cannot submit reviews", async () => {
  for (const status of ["CANCELLED", "EXPIRED", "CONFIRMED"] as const) {
    const { customer, booking } = await createFixture(status);
    await assert.rejects(
      () => submitReviewService({ bookingId: String(booking._id), reviewerId: String(customer._id), rating: 4 }),
      /Reviews allowed only after completion/,
    );
  }
  const { booking } = await createFixture();
  const stranger = await User.create({ email: `review-stranger-${new Types.ObjectId()}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" });
  await assert.rejects(
    () => submitReviewService({ bookingId: String(booking._id), reviewerId: String(stranger._id), rating: 4 }),
    /not part of this booking/,
  );
});

test("rating bounds and duplicate submissions preserve Creator aggregation integrity", async () => {
  const { customer, creator, booking } = await createFixture();
  await assert.rejects(
    () => submitReviewService({ bookingId: String(booking._id), reviewerId: String(customer._id), rating: 6 }),
    /Rating must be between 1 and 5/,
  );
  await submitReviewService({ bookingId: String(booking._id), reviewerId: String(customer._id), rating: 3 });
  await assert.rejects(
    () => submitReviewService({ bookingId: String(booking._id), reviewerId: String(customer._id), rating: 3 }),
    /You already reviewed this booking/,
  );
  assert.equal(await Review.countDocuments({ bookingId: booking._id, reviewerId: customer._id }), 1);
  const profile = await CreatorProfile.findOne({ userId: creator._id }).orFail();
  assert.equal(profile.reviewCount, 1);
  assert.ok(Math.abs(profile.rating - 3) < 1e-9);
});

test("current-actor review state is bounded, participant-only, and reflects submission", async () => {
  const { customer, creator, booking, reviewerUsername } = await createFixture();
  const before = response();
  await getMyBookingReviewState({ user: { id: String(customer._id) }, params: { bookingId: String(booking._id) } } as unknown as Request, before.response);
  assert.equal(before.statusCode, 200);
  assert.deepEqual(before.body, { hasReviewed: false, review: null });

  await submitReviewService({ bookingId: String(booking._id), reviewerId: String(customer._id), rating: 5, comment: "Excellent session." });
  const afterReview = response();
  await getMyBookingReviewState({ user: { id: String(customer._id) }, params: { bookingId: String(booking._id) } } as unknown as Request, afterReview.response);
  const body = afterReview.body as { hasReviewed: boolean; review: Record<string, unknown> };
  assert.equal(body.hasReviewed, true);
  assert.deepEqual(Object.keys(body.review).sort(), ["comment", "createdAt", "rating", "reportFlag", "reviewId"]);
  assert.equal(body.review.rating, 5);

  const stranger = await User.create({ email: `review-reader-${new Types.ObjectId()}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" });
  const denied = response();
  await getMyBookingReviewState({ user: { id: String(stranger._id) }, params: { bookingId: String(booking._id) } } as unknown as Request, denied.response);
  assert.equal(denied.statusCode, 403);

  const creatorProfile = await CreatorProfile.findOne({ userId: creator._id }).orFail();
  const publicRead = response();
  await getReviewsForCreator({ params: { creatorId: String(creatorProfile._id) }, query: {} } as unknown as Request, publicRead.response);
  assert.equal(publicRead.statusCode, 200);
  const publicBody = publicRead.body as { reviews: Record<string, unknown>[] };
  assert.equal(publicBody.reviews.length, 1);
  assert.deepEqual(Object.keys(publicBody.reviews[0]).sort(), ["comment", "createdAt", "rating", "reviewId", "reviewer"]);
  assert.deepEqual(publicBody.reviews[0].reviewer, {
    displayName: reviewerUsername,
    avatarUrl: "https://example.test/avatar.png",
  });
});

test("public reviews use the CreatorProfile identifier, remain creator-isolated, and retain empty comments", async () => {
  const first = await createFixture();
  const second = await createFixture();
  await submitReviewService({ bookingId: String(first.booking._id), reviewerId: String(first.customer._id), rating: 4 });

  const firstProfile = await CreatorProfile.findOne({ userId: first.creator._id }).orFail();
  const firstRead = response();
  await getReviewsForCreator({ params: { creatorId: String(firstProfile._id) }, query: {} } as unknown as Request, firstRead.response);
  const firstBody = firstRead.body as { reviews: Array<{ comment?: string }> };
  assert.equal(firstRead.statusCode, 200);
  assert.equal(firstBody.reviews.length, 1);
  assert.equal(firstBody.reviews[0].comment, undefined);

  const secondProfile = await CreatorProfile.findOne({ userId: second.creator._id }).orFail();
  const secondRead = response();
  await getReviewsForCreator({ params: { creatorId: String(secondProfile._id) }, query: {} } as unknown as Request, secondRead.response);
  assert.equal(secondRead.statusCode, 200);
  assert.equal((secondRead.body as { reviews: unknown[] }).reviews.length, 0);
});
