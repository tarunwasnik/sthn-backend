"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.postAdminCancellation = exports.postCreatorCancellation = exports.postUserCancellation = exports.postCreatorDecision = exports.createActiveWalletBooking = exports.startReleaseHttpServer = void 0;
const node_http_1 = __importDefault(require("node:http"));
const express_1 = __importDefault(require("express"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const booking_routes_1 = __importDefault(require("../../../../routes/v1/booking.routes"));
const creatorBookingDecision_routes_1 = __importDefault(require("../../../../routes/v1/creatorBookingDecision.routes"));
const creatorCancelBooking_routes_1 = __importDefault(require("../../../../routes/v1/creatorCancelBooking.routes"));
const admin_routes_1 = __importDefault(require("../../../../routes/v1/admin.routes"));
const notFound_1 = require("../../../../middlewares/notFound");
const errorHandler_1 = require("../../../../middlewares/errorHandler");
const booking_model_1 = require("../../../../models/booking.model");
const bookingWalletFixtures_1 = require("../../phase8a/fixtures/bookingWalletFixtures");
let releaseSequence = 0;
const startReleaseHttpServer = async () => {
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
        throw new Error("Release test server did not bind.");
    return {
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
    };
};
exports.startReleaseHttpServer = startReleaseHttpServer;
const createActiveWalletBooking = async (baseUrl, options = {}) => {
    releaseSequence += 1;
    const fixture = await (0, bookingWalletFixtures_1.createBookingWalletFixture)(options);
    const response = await (0, bookingWalletFixtures_1.postWalletBooking)(baseUrl, fixture, `phase8b-reservation-${releaseSequence}`);
    if (response.status !== 201) {
        throw new Error(`Wallet reservation fixture failed: ${JSON.stringify(response)}`);
    }
    const booking = await booking_model_1.Booking.findOne({
        bookingReference: response.body.booking.bookingReference,
    }).orFail();
    const creatorToken = jsonwebtoken_1.default.sign({ id: fixture.actors.creatorId.toString(), role: "creator" }, process.env.JWT_SECRET);
    const adminToken = jsonwebtoken_1.default.sign({ id: fixture.actors.adminId.toString(), role: "admin" }, process.env.JWT_SECRET);
    return { fixture, booking, response, creatorToken, adminToken };
};
exports.createActiveWalletBooking = createActiveWalletBooking;
const request = async (url, token, body, method = "POST") => {
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
const postCreatorDecision = (baseUrl, bookingId, creatorToken, decision) => request(`${baseUrl}/api/v1/creator/bookings/${bookingId}/decision`, creatorToken, { decision });
exports.postCreatorDecision = postCreatorDecision;
const postUserCancellation = (baseUrl, bookingId, fixture) => request(`${baseUrl}/api/v1/bookings/${bookingId}/cancel`, fixture.token, { reason: "Phase 8B User cancellation", actorId: fixture.actors.creatorId.toString() });
exports.postUserCancellation = postUserCancellation;
const postCreatorCancellation = (baseUrl, bookingId, creatorToken) => request(`${baseUrl}/api/v1/bookings/creator/cancel-booking`, creatorToken, { bookingId, reason: "Phase 8B Creator cancellation", actorId: "spoofed" });
exports.postCreatorCancellation = postCreatorCancellation;
const postAdminCancellation = (baseUrl, bookingId, adminToken) => request(`${baseUrl}/api/v1/admin/bookings/${bookingId}/cancel`, adminToken, { reason: "Phase 8B Admin cancellation", actorId: "spoofed" }, "PATCH");
exports.postAdminCancellation = postAdminCancellation;
