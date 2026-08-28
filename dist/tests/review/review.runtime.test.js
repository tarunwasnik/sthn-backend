"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const mongoose_1 = require("mongoose");
const User_1 = __importDefault(require("../../models/User"));
const booking_model_1 = require("../../models/booking.model");
const creatorProfile_model_1 = require("../../models/creatorProfile.model");
const userProfile_model_1 = require("../../models/userProfile.model");
const review_model_1 = require("../../models/review.model");
const review_controller_1 = require("../../controllers/review.controller");
const submitReview_service_1 = require("../../services/review/submitReview.service");
const database_1 = require("../financial/phase7h/helpers/database");
process.env.NODE_ENV = "test";
(0, node_test_1.before)(async () => (0, database_1.connectPhase7HDatabase)(), { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => (0, database_1.clearPhase7HDatabase)());
(0, node_test_1.after)(async () => (0, database_1.disconnectPhase7HDatabase)(), { timeout: 30000 });
function response() {
    const result = {};
    result.response = {
        status: (code) => {
            result.statusCode = code;
            return result.response;
        },
        json: (payload) => {
            result.body = payload;
            return result.response;
        },
    };
    return result;
}
async function createFixture(status = "COMPLETED") {
    const suffix = new mongoose_1.Types.ObjectId().toString();
    const customer = await User_1.default.create({ email: `review-user-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" });
    const creator = await User_1.default.create({ email: `review-creator-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" });
    await creatorProfile_model_1.CreatorProfile.create({ userId: creator._id, slug: `review-${suffix}`, displayName: "Review Creator", primaryCategory: "test", country: "IN", city: "Test", currency: "INR", status: "active" });
    await userProfile_model_1.UserProfile.create({
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
    const booking = await booking_model_1.Booking.create({
        slotIds: [new mongoose_1.Types.ObjectId()], userId: customer._id, creatorId: creator._id,
        serviceId: new mongoose_1.Types.ObjectId(), serviceTitle: "Review service", durationMinutes: 30,
        price: 100, currency: "INR", status, paymentStatus: "PAID", isPayable: true,
        isPayoutEligible: false, isFinancialLocked: false, expiresAt: new Date(Date.now() + 86400000),
        hasInteracted: true, completedAt: status === "COMPLETED" ? new Date() : undefined,
        serviceAmount: 100, platformFeeAmount: 0, commissionAmount: 20, creatorAmount: 80,
        totalAmount: 100,
    });
    return { customer, creator, booking, reviewerUsername: `reviewer-${suffix}` };
}
(0, node_test_1.test)("review router is mounted in the active v1 route tree", async () => {
    const routeIndex = await (0, promises_1.readFile)(node_path_1.default.resolve(process.cwd(), "src/routes/v1/index.ts"), "utf8");
    strict_1.default.match(routeIndex, /import reviewRoutes from "\.\/review\.routes"/);
    strict_1.default.match(routeIndex, /router\.use\("\/reviews", reviewRoutes\)/);
});
(0, node_test_1.test)("completed customer and Creator participants can independently review once", async () => {
    const { customer, creator, booking, reviewerUsername } = await createFixture();
    await (0, submitReview_service_1.submitReviewService)({ bookingId: String(booking._id), reviewerId: String(customer._id), rating: 4, comment: "A useful completed session." });
    await (0, submitReview_service_1.submitReviewService)({ bookingId: String(booking._id), reviewerId: String(creator._id), rating: 5, comment: "Customer attended the session." });
    strict_1.default.equal(await review_model_1.Review.countDocuments({ bookingId: booking._id }), 2);
    const profile = await creatorProfile_model_1.CreatorProfile.findOne({ userId: creator._id }).orFail();
    strict_1.default.equal(profile.reviewCount, 1);
    strict_1.default.equal(profile.rating, 4);
});
(0, node_test_1.test)("non-completed bookings and unrelated actors cannot submit reviews", async () => {
    for (const status of ["CANCELLED", "EXPIRED", "CONFIRMED"]) {
        const { customer, booking } = await createFixture(status);
        await strict_1.default.rejects(() => (0, submitReview_service_1.submitReviewService)({ bookingId: String(booking._id), reviewerId: String(customer._id), rating: 4 }), /Reviews allowed only after completion/);
    }
    const { booking } = await createFixture();
    const stranger = await User_1.default.create({ email: `review-stranger-${new mongoose_1.Types.ObjectId()}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" });
    await strict_1.default.rejects(() => (0, submitReview_service_1.submitReviewService)({ bookingId: String(booking._id), reviewerId: String(stranger._id), rating: 4 }), /not part of this booking/);
});
(0, node_test_1.test)("rating bounds and duplicate submissions preserve Creator aggregation integrity", async () => {
    const { customer, creator, booking } = await createFixture();
    await strict_1.default.rejects(() => (0, submitReview_service_1.submitReviewService)({ bookingId: String(booking._id), reviewerId: String(customer._id), rating: 6 }), /Rating must be between 1 and 5/);
    await (0, submitReview_service_1.submitReviewService)({ bookingId: String(booking._id), reviewerId: String(customer._id), rating: 3 });
    await strict_1.default.rejects(() => (0, submitReview_service_1.submitReviewService)({ bookingId: String(booking._id), reviewerId: String(customer._id), rating: 3 }), /You already reviewed this booking/);
    strict_1.default.equal(await review_model_1.Review.countDocuments({ bookingId: booking._id, reviewerId: customer._id }), 1);
    const profile = await creatorProfile_model_1.CreatorProfile.findOne({ userId: creator._id }).orFail();
    strict_1.default.equal(profile.reviewCount, 1);
    strict_1.default.ok(Math.abs(profile.rating - 3) < 1e-9);
});
(0, node_test_1.test)("current-actor review state is bounded, participant-only, and reflects submission", async () => {
    const { customer, creator, booking, reviewerUsername } = await createFixture();
    const before = response();
    await (0, review_controller_1.getMyBookingReviewState)({ user: { id: String(customer._id) }, params: { bookingId: String(booking._id) } }, before.response);
    strict_1.default.equal(before.statusCode, 200);
    strict_1.default.deepEqual(before.body, { hasReviewed: false, review: null });
    await (0, submitReview_service_1.submitReviewService)({ bookingId: String(booking._id), reviewerId: String(customer._id), rating: 5, comment: "Excellent session." });
    const afterReview = response();
    await (0, review_controller_1.getMyBookingReviewState)({ user: { id: String(customer._id) }, params: { bookingId: String(booking._id) } }, afterReview.response);
    const body = afterReview.body;
    strict_1.default.equal(body.hasReviewed, true);
    strict_1.default.deepEqual(Object.keys(body.review).sort(), ["comment", "createdAt", "rating", "reportFlag", "reviewId"]);
    strict_1.default.equal(body.review.rating, 5);
    const stranger = await User_1.default.create({ email: `review-reader-${new mongoose_1.Types.ObjectId()}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" });
    const denied = response();
    await (0, review_controller_1.getMyBookingReviewState)({ user: { id: String(stranger._id) }, params: { bookingId: String(booking._id) } }, denied.response);
    strict_1.default.equal(denied.statusCode, 403);
    const creatorProfile = await creatorProfile_model_1.CreatorProfile.findOne({ userId: creator._id }).orFail();
    const publicRead = response();
    await (0, review_controller_1.getReviewsForCreator)({ params: { creatorId: String(creatorProfile._id) }, query: {} }, publicRead.response);
    strict_1.default.equal(publicRead.statusCode, 200);
    const publicBody = publicRead.body;
    strict_1.default.equal(publicBody.reviews.length, 1);
    strict_1.default.deepEqual(Object.keys(publicBody.reviews[0]).sort(), ["comment", "createdAt", "rating", "reviewId", "reviewer"]);
    strict_1.default.deepEqual(publicBody.reviews[0].reviewer, {
        displayName: reviewerUsername,
        avatarUrl: "https://example.test/avatar.png",
    });
});
(0, node_test_1.test)("public reviews use the CreatorProfile identifier, remain creator-isolated, and retain empty comments", async () => {
    const first = await createFixture();
    const second = await createFixture();
    await (0, submitReview_service_1.submitReviewService)({ bookingId: String(first.booking._id), reviewerId: String(first.customer._id), rating: 4 });
    const firstProfile = await creatorProfile_model_1.CreatorProfile.findOne({ userId: first.creator._id }).orFail();
    const firstRead = response();
    await (0, review_controller_1.getReviewsForCreator)({ params: { creatorId: String(firstProfile._id) }, query: {} }, firstRead.response);
    const firstBody = firstRead.body;
    strict_1.default.equal(firstRead.statusCode, 200);
    strict_1.default.equal(firstBody.reviews.length, 1);
    strict_1.default.equal(firstBody.reviews[0].comment, undefined);
    const secondProfile = await creatorProfile_model_1.CreatorProfile.findOne({ userId: second.creator._id }).orFail();
    const secondRead = response();
    await (0, review_controller_1.getReviewsForCreator)({ params: { creatorId: String(secondProfile._id) }, query: {} }, secondRead.response);
    strict_1.default.equal(secondRead.statusCode, 200);
    strict_1.default.equal(secondRead.body.reviews.length, 0);
});
