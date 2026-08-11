"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingWalletReservationReplayTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const mongoose_1 = __importDefault(require("mongoose"));
const booking_model_1 = require("../../../models/booking.model");
const bookingFundReservation_model_1 = require("../../../models/bookingFundReservation.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const payment_model_1 = require("../../../models/payment.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const ledgerSource_enum_1 = require("../../../enums/financial/ledgerSource.enum");
const bookingWalletReservation_service_1 = require("../../../services/financial/bookingWalletReservation.service");
const bookingWalletFixtures_1 = require("./fixtures/bookingWalletFixtures");
const registerBookingWalletReservationReplayTests = () => {
    (0, node_test_1.test)("phase8a replay: sequential, reloaded, and concurrent API submissions converge", async () => {
        const fixture = await (0, bookingWalletFixtures_1.createBookingWalletFixture)({ walletAmount: 1000, slotAmounts: [350] });
        const server = await (0, bookingWalletFixtures_1.startBookingHttpServer)();
        try {
            const first = await (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, fixture, "phase8a-replay");
            const second = await (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, fixture, "phase8a-replay");
            const concurrent = await Promise.all([
                (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, fixture, "phase8a-replay"),
                (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, fixture, "phase8a-replay"),
            ]);
            strict_1.default.equal(first.status, 201, JSON.stringify(first.body));
            strict_1.default.equal(second.status, 200, JSON.stringify(second.body));
            strict_1.default.ok(concurrent.every((result) => result.status === 200));
            strict_1.default.ok([
                second,
                ...concurrent,
            ].every((result) => result.body.reservation.reservationReference ===
                first.body.reservation.reservationReference));
            const [bookings, payments, reservations, ledgers, projections, wallet] = await Promise.all([
                booking_model_1.Booking.find({ userId: fixture.actors.userId }),
                payment_model_1.Payment.find({ userId: fixture.actors.userId }),
                bookingFundReservation_model_1.BookingFundReservation.find({ userId: fixture.actors.userId }),
                ledgerEntry_model_1.LedgerEntry.find({ source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_AUTHORIZATION }),
                walletProjectionOperation_model_1.WalletProjectionOperation.find({ "deltas.reservedBalance": fixture.totalAmount }),
                wallet_model_1.Wallet.findById(fixture.actors.wallet._id),
            ]);
            strict_1.default.equal(bookings.length, 1);
            strict_1.default.equal(payments.length, 1);
            strict_1.default.equal(reservations.length, 1);
            strict_1.default.equal(ledgers.length, 2);
            strict_1.default.equal(projections.length, 1);
            strict_1.default.equal(wallet?.availableBalance, 1000 - fixture.totalAmount);
            strict_1.default.equal(wallet?.reservedBalance, fixture.totalAmount);
            strict_1.default.equal(reservations[0].authorizedAt?.getTime(), new Date(first.body.reservation.authorizedAt).getTime());
            const session = await mongoose_1.default.startSession();
            try {
                session.startTransaction();
                const reloadedBooking = await booking_model_1.Booking.findById(bookings[0]._id).session(session).orFail();
                const reloadedPayment = await payment_model_1.Payment.findById(payments[0]._id).session(session).orFail();
                const serviceReplay = await bookingWalletReservation_service_1.bookingWalletReservationService.authorize({
                    booking: reloadedBooking,
                    payment: reloadedPayment,
                    authenticatedUserId: fixture.actors.userId,
                    currency: "INR",
                    session,
                });
                await session.commitTransaction();
                strict_1.default.equal(serviceReplay.reservation.reservationReference, first.body.reservation.reservationReference);
            }
            finally {
                if (session.inTransaction())
                    await session.abortTransaction();
                await session.endSession();
            }
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_AUTHORIZATION,
            }), 2);
            strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({
                "deltas.reservedBalance": fixture.totalAmount,
            }), 1);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8a replay: concurrent first submissions create one complete booking graph", async () => {
        const fixture = await (0, bookingWalletFixtures_1.createBookingWalletFixture)({ walletAmount: 1000, slotAmounts: [300] });
        const server = await (0, bookingWalletFixtures_1.startBookingHttpServer)();
        try {
            const results = await Promise.all([
                (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, fixture, "phase8a-first-race"),
                (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, fixture, "phase8a-first-race"),
            ]);
            strict_1.default.equal(results.filter((result) => result.status === 201).length, 1, JSON.stringify(results));
            strict_1.default.equal(results.filter((result) => result.status === 200).length, 1, JSON.stringify(results));
            strict_1.default.equal(await booking_model_1.Booking.countDocuments({ userId: fixture.actors.userId }), 1);
            strict_1.default.equal(await payment_model_1.Payment.countDocuments({ userId: fixture.actors.userId }), 1);
            strict_1.default.equal(await bookingFundReservation_model_1.BookingFundReservation.countDocuments({ userId: fixture.actors.userId }), 1);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_AUTHORIZATION,
            }), 2);
            strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({
                "deltas.reservedBalance": fixture.totalAmount,
            }), 1);
            const wallet = await wallet_model_1.Wallet.findById(fixture.actors.wallet._id).orFail();
            strict_1.default.equal(wallet.availableBalance, 685);
            strict_1.default.equal(wallet.reservedBalance, 315);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8a replay: reused request key with different immutable intent fails closed", async () => {
        const fixture = await (0, bookingWalletFixtures_1.createBookingWalletFixture)({ walletAmount: 1000, slotAmounts: [200, 200] });
        const firstRequest = { ...fixture, slotIds: [fixture.slotIds[0]], amount: 200 };
        const conflictingRequest = { ...fixture, slotIds: [fixture.slotIds[1]], amount: 200 };
        const server = await (0, bookingWalletFixtures_1.startBookingHttpServer)();
        try {
            const first = await (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, firstRequest, "phase8a-key-conflict");
            const conflict = await (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, conflictingRequest, "phase8a-key-conflict");
            strict_1.default.equal(first.status, 201);
            strict_1.default.equal(conflict.status, 409);
            strict_1.default.equal(conflict.body.code, "BOOKING_WALLET_RESERVATION_IDENTITY_CONFLICT");
            strict_1.default.equal(await booking_model_1.Booking.countDocuments({ userId: fixture.actors.userId }), 1);
            strict_1.default.equal(await bookingFundReservation_model_1.BookingFundReservation.countDocuments({ userId: fixture.actors.userId }), 1);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerBookingWalletReservationReplayTests = registerBookingWalletReservationReplayTests;
