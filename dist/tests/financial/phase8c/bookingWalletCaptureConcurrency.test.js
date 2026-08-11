"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingWalletCaptureConcurrencyTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const booking_model_1 = require("../../../models/booking.model");
const bookingFundReservation_model_1 = require("../../../models/bookingFundReservation.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const bookingFundReservationStatus_enum_1 = require("../../../enums/financial/bookingFundReservationStatus.enum");
const ledgerSource_enum_1 = require("../../../enums/financial/ledgerSource.enum");
const bookingWalletFixtures_1 = require("../phase8a/fixtures/bookingWalletFixtures");
const bookingWalletReleaseFixtures_1 = require("../phase8b/fixtures/bookingWalletReleaseFixtures");
const bookingWalletCaptureFixtures_1 = require("./fixtures/bookingWalletCaptureFixtures");
const accept = async (baseUrl, booking, token) => {
    const response = await (0, bookingWalletReleaseFixtures_1.postCreatorDecision)(baseUrl, booking._id.toString(), token, "ACCEPT");
    strict_1.default.equal(response.status, 200, JSON.stringify(response.body));
    await booking_model_1.Booking.updateOne({ _id: booking._id }, { $set: { hasInteracted: true, interactionStartedAt: new Date(Date.now() - 60000) } });
};
const registerBookingWalletCaptureConcurrencyTests = () => {
    (0, node_test_1.test)("phase8c ten-way Creator completion converges on one capture", async () => {
        const server = await (0, bookingWalletCaptureFixtures_1.startCaptureHttpServer)();
        try {
            const { booking, creatorToken, fixture } = await (0, bookingWalletCaptureFixtures_1.createAcceptedWalletBooking)(server.baseUrl, { walletAmount: 1000, slotAmounts: [400] });
            const results = await Promise.all(Array.from({ length: 10 }, () => (0, bookingWalletCaptureFixtures_1.postCreatorCompletion)(server.baseUrl, booking._id.toString(), creatorToken)));
            strict_1.default.ok(results.every((result) => result.status === 200), JSON.stringify(results));
            strict_1.default.equal(results.filter((result) => result.body.replay === false).length, 1);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                bookingId: booking._id,
                source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_CAPTURE,
            }), 2);
            strict_1.default.equal(await bookingFundReservation_model_1.BookingFundReservation.countDocuments({
                bookingId: booking._id,
                status: bookingFundReservationStatus_enum_1.BookingFundReservationStatus.CAPTURED,
            }), 1);
            const wallet = await wallet_model_1.Wallet.findById(fixture.actors.wallet._id).orFail();
            strict_1.default.deepEqual([wallet.availableBalance, wallet.reservedBalance, wallet.currentBalance], [580, 0, 580]);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8c distinct same-Wallet captures use additive atomic projections", async () => {
        const server = await (0, bookingWalletCaptureFixtures_1.startCaptureHttpServer)();
        try {
            const fixture = await (0, bookingWalletFixtures_1.createBookingWalletFixture)({
                walletAmount: 1000,
                slotAmounts: [300, 500],
            });
            const firstResponse = await (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, fixture, "phase8c-same-wallet-a", {
                slotIds: [fixture.slotIds[0].toString()],
            });
            const secondResponse = await (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, fixture, "phase8c-same-wallet-b", {
                slotIds: [fixture.slotIds[1].toString()],
            });
            strict_1.default.equal(firstResponse.status, 201, JSON.stringify(firstResponse.body));
            strict_1.default.equal(secondResponse.status, 201, JSON.stringify(secondResponse.body));
            const bookings = await booking_model_1.Booking.find({
                bookingReference: {
                    $in: [firstResponse.body.booking.bookingReference, secondResponse.body.booking.bookingReference],
                },
            });
            const token = jsonwebtoken_1.default.sign({ id: fixture.actors.creatorId.toString(), role: "creator" }, process.env.JWT_SECRET);
            await (0, bookingWalletCaptureFixtures_1.enableBookingCompletion)(fixture.actors.adminId.toString());
            for (const booking of bookings)
                await accept(server.baseUrl, booking, token);
            const results = await Promise.all(bookings.map((booking) => (0, bookingWalletCaptureFixtures_1.postCreatorCompletion)(server.baseUrl, booking._id.toString(), token)));
            strict_1.default.ok(results.every((result) => result.status === 200), JSON.stringify(results));
            const wallet = await wallet_model_1.Wallet.findById(fixture.actors.wallet._id).orFail();
            strict_1.default.deepEqual([wallet.availableBalance, wallet.reservedBalance, wallet.currentBalance], [160, 0, 160]);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                bookingId: { $in: bookings.map((booking) => booking._id) },
                source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_CAPTURE,
            }), 4);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8c reservation creation versus capture on one Wallet preserves exact balances", async () => {
        const server = await (0, bookingWalletCaptureFixtures_1.startCaptureHttpServer)();
        try {
            const fixture = await (0, bookingWalletFixtures_1.createBookingWalletFixture)({
                walletAmount: 1000,
                slotAmounts: [400, 300],
            });
            const firstResponse = await (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, fixture, "phase8c-create-capture-a", {
                slotIds: [fixture.slotIds[0].toString()],
            });
            strict_1.default.equal(firstResponse.status, 201, JSON.stringify(firstResponse.body));
            const booking = await booking_model_1.Booking.findOne({
                bookingReference: firstResponse.body.booking.bookingReference,
            }).orFail();
            const token = jsonwebtoken_1.default.sign({ id: fixture.actors.creatorId.toString(), role: "creator" }, process.env.JWT_SECRET);
            await (0, bookingWalletCaptureFixtures_1.enableBookingCompletion)(fixture.actors.adminId.toString());
            await accept(server.baseUrl, booking, token);
            const [completion, creation] = await Promise.all([
                (0, bookingWalletCaptureFixtures_1.postCreatorCompletion)(server.baseUrl, booking._id.toString(), token),
                (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, fixture, "phase8c-create-capture-b", {
                    slotIds: [fixture.slotIds[1].toString()],
                }),
            ]);
            strict_1.default.equal(completion.status, 200, JSON.stringify(completion.body));
            strict_1.default.equal(creation.status, 201, JSON.stringify(creation.body));
            const wallet = await wallet_model_1.Wallet.findById(fixture.actors.wallet._id).orFail();
            strict_1.default.deepEqual([wallet.availableBalance, wallet.reservedBalance, wallet.currentBalance], [265, 315, 580]);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerBookingWalletCaptureConcurrencyTests = registerBookingWalletCaptureConcurrencyTests;
