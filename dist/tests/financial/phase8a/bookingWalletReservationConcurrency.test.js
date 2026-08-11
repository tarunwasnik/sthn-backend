"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingWalletReservationConcurrencyTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const booking_model_1 = require("../../../models/booking.model");
const bookingFundReservation_model_1 = require("../../../models/bookingFundReservation.model");
const slot_model_1 = require("../../../models/slot.model");
const wallet_model_1 = require("../../../models/wallet.model");
const bookingFundReservationStatus_enum_1 = require("../../../enums/financial/bookingFundReservationStatus.enum");
const bookingWalletFixtures_1 = require("./fixtures/bookingWalletFixtures");
const requestsForTwoSlots = (fixture) => [
    { ...fixture, slotIds: [fixture.slotIds[0]], amount: 400 },
    { ...fixture, slotIds: [fixture.slotIds[1]], amount: 400 },
];
const registerBookingWalletReservationConcurrencyTests = () => {
    (0, node_test_1.test)("phase8a concurrency: distinct reservations both commit when combined funds suffice", async () => {
        const fixture = await (0, bookingWalletFixtures_1.createBookingWalletFixture)({ walletAmount: 1000, slotAmounts: [400, 400] });
        const [one, two] = requestsForTwoSlots(fixture);
        const server = await (0, bookingWalletFixtures_1.startBookingHttpServer)();
        try {
            const results = await Promise.all([
                (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, one, "phase8a-sufficient-1"),
                (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, two, "phase8a-sufficient-2"),
            ]);
            strict_1.default.ok(results.every((result) => result.status === 201), JSON.stringify(results));
            const wallet = await wallet_model_1.Wallet.findById(fixture.actors.wallet._id).orFail();
            strict_1.default.equal(wallet.availableBalance, 160);
            strict_1.default.equal(wallet.reservedBalance, 840);
            strict_1.default.equal(wallet.lockedBalance, 0);
            strict_1.default.equal(wallet.currentBalance, 1000);
            strict_1.default.equal(await bookingFundReservation_model_1.BookingFundReservation.countDocuments({
                status: bookingFundReservationStatus_enum_1.BookingFundReservationStatus.ACTIVE,
            }), 2);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8a concurrency: atomic available guard prevents same-Wallet overspend", async () => {
        const fixture = await (0, bookingWalletFixtures_1.createBookingWalletFixture)({ walletAmount: 600, slotAmounts: [400, 400] });
        const [one, two] = requestsForTwoSlots(fixture);
        const server = await (0, bookingWalletFixtures_1.startBookingHttpServer)();
        try {
            const results = await Promise.all([
                (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, one, "phase8a-overspend-1"),
                (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, two, "phase8a-overspend-2"),
            ]);
            const successes = results.filter((result) => result.status === 201);
            const failures = results.filter((result) => result.status !== 201);
            strict_1.default.equal(successes.length, 1, JSON.stringify(results));
            strict_1.default.equal(failures.length, 1);
            strict_1.default.ok([409, 400].includes(failures[0].status));
            const [wallet, activeReservations, bookings, slots] = await Promise.all([
                wallet_model_1.Wallet.findById(fixture.actors.wallet._id).orFail(),
                bookingFundReservation_model_1.BookingFundReservation.find({ status: bookingFundReservationStatus_enum_1.BookingFundReservationStatus.ACTIVE }),
                booking_model_1.Booking.find({ userId: fixture.actors.userId }),
                slot_model_1.Slot.find({ _id: { $in: fixture.slotIds } }),
            ]);
            strict_1.default.equal(wallet.availableBalance, 180);
            strict_1.default.equal(wallet.reservedBalance, 420);
            strict_1.default.equal(wallet.currentBalance, 600);
            strict_1.default.ok(wallet.availableBalance >= 0);
            strict_1.default.equal(activeReservations.length, 1);
            strict_1.default.equal(bookings.length, 1);
            strict_1.default.equal(slots.filter((slot) => slot.status === "LOCKED").length, 1);
            strict_1.default.equal(slots.filter((slot) => slot.status === "AVAILABLE").length, 1);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerBookingWalletReservationConcurrencyTests = registerBookingWalletReservationConcurrencyTests;
