"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startCompletionHttpServer = exports.postCreatorCompletion = exports.makeBookingAutoCompletionEligible = exports.createAcceptedWalletBooking = exports.enableBookingCompletion = exports.startCaptureHttpServer = exports.postUserCancellation = exports.postCreatorCancellation = exports.postAdminCancellation = void 0;
const node_http_1 = __importDefault(require("node:http"));
const express_1 = __importDefault(require("express"));
const booking_routes_1 = __importDefault(require("../../../../routes/v1/booking.routes"));
const creatorBookingDecision_routes_1 = __importDefault(require("../../../../routes/v1/creatorBookingDecision.routes"));
const creatorCancelBooking_routes_1 = __importDefault(require("../../../../routes/v1/creatorCancelBooking.routes"));
const admin_routes_1 = __importDefault(require("../../../../routes/v1/admin.routes"));
const notFound_1 = require("../../../../middlewares/notFound");
const errorHandler_1 = require("../../../../middlewares/errorHandler");
const booking_model_1 = require("../../../../models/booking.model");
const featureFlag_model_1 = require("../../../../models/featureFlag.model");
const slot_model_1 = require("../../../../models/slot.model");
const featureFlagCache_service_1 = require("../../../../services/controlPlane/featureFlagCache.service");
const bookingWalletReleaseFixtures_1 = require("../../phase8b/fixtures/bookingWalletReleaseFixtures");
var bookingWalletReleaseFixtures_2 = require("../../phase8b/fixtures/bookingWalletReleaseFixtures");
Object.defineProperty(exports, "postAdminCancellation", { enumerable: true, get: function () { return bookingWalletReleaseFixtures_2.postAdminCancellation; } });
Object.defineProperty(exports, "postCreatorCancellation", { enumerable: true, get: function () { return bookingWalletReleaseFixtures_2.postCreatorCancellation; } });
Object.defineProperty(exports, "postUserCancellation", { enumerable: true, get: function () { return bookingWalletReleaseFixtures_2.postUserCancellation; } });
let captureSequence = 0;
exports.startCaptureHttpServer = bookingWalletReleaseFixtures_1.startReleaseHttpServer;
const enableBookingCompletion = async (adminId) => {
    await featureFlag_model_1.FeatureFlag.updateOne({ key: "BOOKING_COMPLETION_ENABLED" }, {
        $set: { enabled: true, scope: "GLOBAL", createdBy: adminId },
        $setOnInsert: { key: "BOOKING_COMPLETION_ENABLED" },
    }, { upsert: true });
    featureFlagCache_service_1.featureFlagCache.invalidate();
};
exports.enableBookingCompletion = enableBookingCompletion;
const createAcceptedWalletBooking = async (baseUrl, options = {}) => {
    captureSequence += 1;
    const active = await (0, bookingWalletReleaseFixtures_1.createActiveWalletBooking)(baseUrl, options);
    await (0, exports.enableBookingCompletion)(active.fixture.actors.adminId.toString());
    const accepted = await (0, bookingWalletReleaseFixtures_1.postCreatorDecision)(baseUrl, active.booking._id.toString(), active.creatorToken, "ACCEPT");
    if (accepted.status !== 200) {
        throw new Error(`Wallet acceptance fixture failed: ${JSON.stringify(accepted)}`);
    }
    return {
        ...active,
        booking: await booking_model_1.Booking.findById(active.booking._id).orFail(),
        accepted,
    };
};
exports.createAcceptedWalletBooking = createAcceptedWalletBooking;
const makeBookingAutoCompletionEligible = async (bookingId) => {
    const booking = await booking_model_1.Booking.findById(bookingId).orFail();
    const endTime = new Date(Date.now() - 11 * 60 * 1000);
    await slot_model_1.Slot.updateMany({ _id: { $in: booking.slotIds } }, {
        $set: {
            startTime: new Date(endTime.getTime() - 30 * 60 * 1000),
            endTime,
        },
    });
};
exports.makeBookingAutoCompletionEligible = makeBookingAutoCompletionEligible;
const request = async (url, token, body = {}, method = "POST") => {
    const response = await fetch(url, {
        method,
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
};
const postCreatorCompletion = (baseUrl, bookingId, creatorToken) => request(`${baseUrl}/api/v1/bookings/${bookingId}/complete/creator`, creatorToken);
exports.postCreatorCompletion = postCreatorCompletion;
/** Used only by provider regression when a lightweight server is preferable. */
const startCompletionHttpServer = async () => {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    app.use("/api/v1/bookings", booking_routes_1.default);
    app.use("/api/v1/bookings/creator", creatorCancelBooking_routes_1.default);
    app.use("/api/v1/creator", creatorBookingDecision_routes_1.default);
    app.use("/api/v1/admin", admin_routes_1.default);
    app.use(notFound_1.notFound);
    app.use(errorHandler_1.errorHandler);
    const server = node_http_1.default.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string")
        throw new Error("Capture server did not bind.");
    return {
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
    };
};
exports.startCompletionHttpServer = startCompletionHttpServer;
