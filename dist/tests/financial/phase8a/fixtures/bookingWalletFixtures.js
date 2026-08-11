"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.postWalletBooking = exports.startBookingHttpServer = exports.createBookingWalletFixture = exports.fundWallet = void 0;
const node_http_1 = __importDefault(require("node:http"));
const express_1 = __importDefault(require("express"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const mongoose_1 = require("mongoose");
const booking_routes_1 = __importDefault(require("../../../../routes/v1/booking.routes"));
const errorHandler_1 = require("../../../../middlewares/errorHandler");
const notFound_1 = require("../../../../middlewares/notFound");
const creatorProfile_model_1 = require("../../../../models/creatorProfile.model");
const creatorService_model_1 = require("../../../../models/creatorService.model");
const slot_model_1 = require("../../../../models/slot.model");
const wallet_model_1 = require("../../../../models/wallet.model");
const topUpFixtures_1 = require("../../phase7h/fixtures/topUpFixtures");
const marketplacePricing_service_1 = require("../../../../services/financial/marketplacePricing.service");
let bookingSequence = 0;
const fundWallet = async (actors, amount) => {
    const { request } = await (0, topUpFixtures_1.createFundedTopUp)(actors, amount);
    await (0, topUpFixtures_1.completeFundedTopUp)(request.topUpReference);
    return wallet_model_1.Wallet.findById(actors.wallet._id).orFail();
};
exports.fundWallet = fundWallet;
const createBookingWalletFixture = async (options = {}) => {
    bookingSequence += 1;
    const actors = options.actors ?? await (0, topUpFixtures_1.createActors)();
    const currency = options.currency ?? "INR";
    const slotAmounts = options.slotAmounts ?? [400];
    if ((options.walletAmount ?? 1000) > 0) {
        await (0, exports.fundWallet)(actors, options.walletAmount ?? 1000);
    }
    if (!await creatorProfile_model_1.CreatorProfile.exists({ userId: actors.creatorId })) {
        await creatorProfile_model_1.CreatorProfile.create({
            userId: actors.creatorId,
            slug: `phase8a-creator-${bookingSequence}`,
            displayName: "Phase 8A Creator",
            primaryCategory: "testing",
            country: "IN",
            city: "Test City",
            currency,
            status: "active",
        });
    }
    const service = await creatorService_model_1.CreatorService.create({
        creatorId: actors.creatorId,
        title: `Phase 8A Service ${bookingSequence}`,
        description: "Wallet reservation runtime fixture",
        durationMinutes: 30,
        price: slotAmounts[0],
        currency,
        isActive: true,
    });
    const start = Date.now() + 24 * 60 * 60 * 1000;
    const slots = await slot_model_1.Slot.create(slotAmounts.map((price, index) => ({
        availabilityId: new mongoose_1.Types.ObjectId(),
        creatorId: actors.creatorId,
        serviceId: service._id,
        startTime: new Date(start + index * 30 * 60 * 1000),
        endTime: new Date(start + (index + 1) * 30 * 60 * 1000),
        timezone: "UTC",
        status: "AVAILABLE",
        price,
    })));
    const token = jsonwebtoken_1.default.sign({ id: actors.userId.toString(), role: "user" }, process.env.JWT_SECRET);
    const amount = slotAmounts.reduce((sum, slotAmount) => sum + slotAmount, 0);
    const pricing = marketplacePricing_service_1.marketplacePricingService.calculate({
        serviceAmount: amount,
        currency: currency,
    });
    return {
        actors,
        serviceId: service._id,
        slotIds: slots.map((slot) => slot._id),
        token,
        amount,
        ...pricing,
    };
};
exports.createBookingWalletFixture = createBookingWalletFixture;
const startBookingHttpServer = async () => {
    const testApp = (0, express_1.default)();
    testApp.use(express_1.default.json());
    testApp.use("/api/v1/bookings", booking_routes_1.default);
    testApp.use(notFound_1.notFound);
    testApp.use(errorHandler_1.errorHandler);
    const server = node_http_1.default.createServer(testApp);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string")
        throw new Error("Test server did not bind.");
    return {
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
    };
};
exports.startBookingHttpServer = startBookingHttpServer;
const postWalletBooking = async (baseUrl, fixture, idempotencyKey, overrides = {}) => {
    const response = await fetch(`${baseUrl}/api/v1/bookings/request`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${fixture.token}`,
        },
        body: JSON.stringify({
            serviceId: fixture.serviceId.toString(),
            slotIds: fixture.slotIds.map(String),
            paymentMethod: "WALLET",
            idempotencyKey,
            ...overrides,
        }),
    });
    return {
        status: response.status,
        body: await response.json(),
    };
};
exports.postWalletBooking = postWalletBooking;
