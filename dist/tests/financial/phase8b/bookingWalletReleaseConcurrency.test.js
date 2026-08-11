"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingWalletReleaseConcurrencyTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const booking_model_1 = require("../../../models/booking.model");
const bookingFundReservation_model_1 = require("../../../models/bookingFundReservation.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const payment_model_1 = require("../../../models/payment.model");
const slot_model_1 = require("../../../models/slot.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const bookingTerminationType_enum_1 = require("../../../enums/booking/bookingTerminationType.enum");
const bookingFundReservationStatus_enum_1 = require("../../../enums/financial/bookingFundReservationStatus.enum");
const ledgerSource_enum_1 = require("../../../enums/financial/ledgerSource.enum");
const paymentStatus_enum_1 = require("../../../enums/financial/paymentStatus.enum");
const expireBookings_job_1 = require("../../../jobs/expireBookings.job");
const bookingFinancialTermination_service_1 = require("../../../services/financial/bookingFinancialTermination.service");
const bookingWalletFixtures_1 = require("../phase8a/fixtures/bookingWalletFixtures");
const bookingWalletReleaseFixtures_1 = require("./fixtures/bookingWalletReleaseFixtures");
const assertSingleRelease = async (bookingId, amount) => {
    const reservation = await bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId })
        .select("+walletId")
        .orFail();
    strict_1.default.equal(reservation.status, bookingFundReservationStatus_enum_1.BookingFundReservationStatus.RELEASED);
    strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
        bookingId,
        source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE,
    }), 2);
    strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({
        walletId: reservation.walletId,
        "deltas.reservedBalance": -amount,
    }), 1);
};
const cancelAsUser = (bookingId, userId) => bookingFinancialTermination_service_1.bookingFinancialTerminationService.terminateBookingFinancially({
    bookingId,
    actorType: bookingTerminationType_enum_1.BookingTerminationActorType.CUSTOMER,
    actorId: userId,
    terminationType: bookingTerminationType_enum_1.BookingTerminationType.CUSTOMER_CANCELLED,
});
const registerBookingWalletReleaseConcurrencyTests = () => {
    (0, node_test_1.test)("phase8b ten-way identical Creator rejection converges on one release", async () => {
        const server = await (0, bookingWalletReleaseFixtures_1.startReleaseHttpServer)();
        try {
            const { booking, creatorToken } = await (0, bookingWalletReleaseFixtures_1.createActiveWalletBooking)(server.baseUrl, { walletAmount: 1000, slotAmounts: [400] });
            const contenders = await Promise.allSettled(Array.from({ length: 10 }, () => (0, bookingWalletReleaseFixtures_1.postCreatorDecision)(server.baseUrl, booking._id.toString(), creatorToken, "REJECT")));
            strict_1.default.ok(contenders.some((result) => result.status === "fulfilled" && result.value.status === 200));
            strict_1.default.ok(contenders.every((result) => result.status === "rejected" || [200, 409].includes(result.value.status)));
            await assertSingleRelease(booking._id.toString(), 420);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8b ten-way expiry execution converges on one release", async () => {
        const server = await (0, bookingWalletReleaseFixtures_1.startReleaseHttpServer)();
        try {
            const { booking } = await (0, bookingWalletReleaseFixtures_1.createActiveWalletBooking)(server.baseUrl, { walletAmount: 1000, slotAmounts: [400] });
            await booking_model_1.Booking.updateOne({ _id: booking._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
            const contenders = await Promise.allSettled(Array.from({ length: 10 }, () => (0, expireBookings_job_1.expireBookingsJob)()));
            strict_1.default.ok(contenders.some((result) => result.status === "fulfilled"));
            await assertSingleRelease(booking._id.toString(), 420);
            strict_1.default.equal((await booking_model_1.Booking.findById(booking._id).orFail()).status, "EXPIRED");
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8b ACCEPT versus REJECT leaves one coherent booking and financial state", async () => {
        const server = await (0, bookingWalletReleaseFixtures_1.startReleaseHttpServer)();
        try {
            const { booking, creatorToken } = await (0, bookingWalletReleaseFixtures_1.createActiveWalletBooking)(server.baseUrl, { walletAmount: 1000, slotAmounts: [400] });
            await Promise.allSettled([
                (0, bookingWalletReleaseFixtures_1.postCreatorDecision)(server.baseUrl, booking._id.toString(), creatorToken, "ACCEPT"),
                (0, bookingWalletReleaseFixtures_1.postCreatorDecision)(server.baseUrl, booking._id.toString(), creatorToken, "REJECT"),
            ]);
            const [winner, reservation, payment, slots] = await Promise.all([
                booking_model_1.Booking.findById(booking._id).orFail(),
                bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId: booking._id }).orFail(),
                payment_model_1.Payment.findById(booking.paymentId).orFail(),
                slot_model_1.Slot.find({ _id: { $in: booking.slotIds } }),
            ]);
            if (winner.status === "CONFIRMED") {
                strict_1.default.equal(reservation.status, bookingFundReservationStatus_enum_1.BookingFundReservationStatus.ACTIVE);
                strict_1.default.equal(payment.status, paymentStatus_enum_1.PaymentStatus.AUTHORIZED);
                strict_1.default.ok(slots.every((slot) => slot.status === "BOOKED"));
            }
            else {
                strict_1.default.equal(winner.status, "REJECTED");
                strict_1.default.equal(reservation.status, bookingFundReservationStatus_enum_1.BookingFundReservationStatus.RELEASED);
                strict_1.default.equal(payment.status, paymentStatus_enum_1.PaymentStatus.CANCELLED);
                strict_1.default.ok(slots.every((slot) => slot.status === "AVAILABLE"));
            }
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8b ACCEPT versus EXPIRE gives financial state matching the winner", async () => {
        const server = await (0, bookingWalletReleaseFixtures_1.startReleaseHttpServer)();
        try {
            const { booking, creatorToken } = await (0, bookingWalletReleaseFixtures_1.createActiveWalletBooking)(server.baseUrl, { walletAmount: 1000, slotAmounts: [300] });
            await booking_model_1.Booking.updateOne({ _id: booking._id }, { $set: { expiresAt: new Date(Date.now() - 1) } });
            await Promise.allSettled([
                (0, bookingWalletReleaseFixtures_1.postCreatorDecision)(server.baseUrl, booking._id.toString(), creatorToken, "ACCEPT"),
                (0, expireBookings_job_1.expireBookingsJob)(),
            ]);
            const winner = await booking_model_1.Booking.findById(booking._id).orFail();
            const reservation = await bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId: booking._id }).orFail();
            strict_1.default.equal(winner.status, "EXPIRED");
            strict_1.default.equal(reservation.status, bookingFundReservationStatus_enum_1.BookingFundReservationStatus.RELEASED);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8b REJECT versus EXPIRE produces exactly one compatible release cause", async () => {
        const server = await (0, bookingWalletReleaseFixtures_1.startReleaseHttpServer)();
        try {
            const { booking, creatorToken } = await (0, bookingWalletReleaseFixtures_1.createActiveWalletBooking)(server.baseUrl, { walletAmount: 1000, slotAmounts: [300] });
            await booking_model_1.Booking.updateOne({ _id: booking._id }, { $set: { expiresAt: new Date(Date.now() - 1) } });
            await Promise.allSettled([
                (0, bookingWalletReleaseFixtures_1.postCreatorDecision)(server.baseUrl, booking._id.toString(), creatorToken, "REJECT"),
                (0, expireBookings_job_1.expireBookingsJob)(),
            ]);
            const winner = await booking_model_1.Booking.findById(booking._id).orFail();
            const reservation = await bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId: booking._id }).orFail();
            strict_1.default.ok(["REJECTED", "EXPIRED"].includes(winner.status));
            strict_1.default.equal(reservation.releaseCause, winner.status === "REJECTED" ? "CREATOR_REJECTED" : "REQUEST_EXPIRED");
            await assertSingleRelease(booking._id.toString(), 315);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8b User cancellation versus Creator decision remains coherent", async () => {
        const server = await (0, bookingWalletReleaseFixtures_1.startReleaseHttpServer)();
        try {
            const { fixture, booking, creatorToken } = await (0, bookingWalletReleaseFixtures_1.createActiveWalletBooking)(server.baseUrl, { walletAmount: 1000, slotAmounts: [350] });
            await Promise.allSettled([
                (0, bookingWalletReleaseFixtures_1.postUserCancellation)(server.baseUrl, booking._id.toString(), fixture),
                (0, bookingWalletReleaseFixtures_1.postCreatorDecision)(server.baseUrl, booking._id.toString(), creatorToken, "ACCEPT"),
            ]);
            const winner = await booking_model_1.Booking.findById(booking._id).orFail();
            const reservation = await bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId: booking._id }).orFail();
            strict_1.default.ok(["CANCELLED", "CONFIRMED"].includes(winner.status));
            strict_1.default.equal(reservation.status, winner.status === "CONFIRMED"
                ? bookingFundReservationStatus_enum_1.BookingFundReservationStatus.ACTIVE
                : bookingFundReservationStatus_enum_1.BookingFundReservationStatus.RELEASED);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8b distinct same-Wallet releases use atomic additive projections", async () => {
        const server = await (0, bookingWalletReleaseFixtures_1.startReleaseHttpServer)();
        try {
            const fixture = await (0, bookingWalletFixtures_1.createBookingWalletFixture)({
                walletAmount: 1000,
                slotAmounts: [200, 300],
            });
            const first = await (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, fixture, "phase8b-same-wallet-a", {
                slotIds: [fixture.slotIds[0].toString()],
            });
            const second = await (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, fixture, "phase8b-same-wallet-b", {
                slotIds: [fixture.slotIds[1].toString()],
            });
            strict_1.default.equal(first.status, 201, JSON.stringify(first.body));
            strict_1.default.equal(second.status, 201, JSON.stringify(second.body));
            const bookings = await booking_model_1.Booking.find({
                bookingReference: {
                    $in: [first.body.booking.bookingReference, second.body.booking.bookingReference],
                },
            });
            const results = await Promise.allSettled(bookings.map((entry) => cancelAsUser(entry._id.toString(), fixture.actors.userId.toString())));
            strict_1.default.ok(results.every((result) => result.status === "fulfilled"), results.map((result) => result.status === "fulfilled"
                ? "fulfilled"
                : String(result.reason)).join(" | "));
            const wallet = await wallet_model_1.Wallet.findById(fixture.actors.wallet._id).orFail();
            strict_1.default.equal(wallet.availableBalance, 1000);
            strict_1.default.equal(wallet.reservedBalance, 0);
            strict_1.default.equal(wallet.currentBalance, 1000);
            strict_1.default.equal(await bookingFundReservation_model_1.BookingFundReservation.countDocuments({
                bookingId: { $in: bookings.map((entry) => entry._id) },
                status: bookingFundReservationStatus_enum_1.BookingFundReservationStatus.RELEASED,
            }), 2);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8b reservation creation versus release on one Wallet preserves exact balances", async () => {
        const server = await (0, bookingWalletReleaseFixtures_1.startReleaseHttpServer)();
        try {
            const fixture = await (0, bookingWalletFixtures_1.createBookingWalletFixture)({
                walletAmount: 1000,
                slotAmounts: [400, 300],
            });
            const first = await (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, fixture, "phase8b-create-release-a", {
                slotIds: [fixture.slotIds[0].toString()],
            });
            strict_1.default.equal(first.status, 201, JSON.stringify(first.body));
            const firstBooking = await booking_model_1.Booking.findOne({
                bookingReference: first.body.booking.bookingReference,
            }).orFail();
            const raced = await Promise.allSettled([
                cancelAsUser(firstBooking._id.toString(), fixture.actors.userId.toString()),
                (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, fixture, "phase8b-create-release-b", {
                    slotIds: [fixture.slotIds[1].toString()],
                }),
            ]);
            strict_1.default.ok(raced.every((result) => result.status === "fulfilled"));
            const creation = raced[1].status === "fulfilled" ? raced[1].value : null;
            strict_1.default.equal(creation?.status, 201, JSON.stringify(creation));
            const wallet = await wallet_model_1.Wallet.findById(fixture.actors.wallet._id).orFail();
            strict_1.default.equal(wallet.availableBalance, 685);
            strict_1.default.equal(wallet.reservedBalance, 315);
            strict_1.default.equal(wallet.currentBalance, 1000);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerBookingWalletReleaseConcurrencyTests = registerBookingWalletReleaseConcurrencyTests;
