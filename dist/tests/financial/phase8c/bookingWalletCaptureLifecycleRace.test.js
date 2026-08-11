"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingWalletCaptureLifecycleRaceTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const booking_model_1 = require("../../../models/booking.model");
const bookingFundReservation_model_1 = require("../../../models/bookingFundReservation.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const payment_model_1 = require("../../../models/payment.model");
const bookingFundReservationStatus_enum_1 = require("../../../enums/financial/bookingFundReservationStatus.enum");
const ledgerSource_enum_1 = require("../../../enums/financial/ledgerSource.enum");
const paymentStatus_enum_1 = require("../../../enums/financial/paymentStatus.enum");
const bookingTerminationType_enum_1 = require("../../../enums/booking/bookingTerminationType.enum");
const bookingWalletCaptureCause_enum_1 = require("../../../enums/financial/bookingWalletCaptureCause.enum");
const completeBookings_job_1 = require("../../../jobs/completeBookings.job");
const expireBookings_job_1 = require("../../../jobs/expireBookings.job");
const bookingFinancialTermination_service_1 = require("../../../services/financial/bookingFinancialTermination.service");
const bookingWalletCaptureFixtures_1 = require("./fixtures/bookingWalletCaptureFixtures");
const assertRaceWinner = async (bookingId) => {
    const booking = await booking_model_1.Booking.findById(bookingId).orFail();
    const payment = await payment_model_1.Payment.findById(booking.paymentId).orFail();
    const reservation = await bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId }).orFail();
    const captures = await ledgerEntry_model_1.LedgerEntry.countDocuments({
        bookingId,
        source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_CAPTURE,
    });
    const releases = await ledgerEntry_model_1.LedgerEntry.countDocuments({
        bookingId,
        source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE,
    });
    if (booking.status === "COMPLETED") {
        strict_1.default.equal(payment.status, paymentStatus_enum_1.PaymentStatus.CAPTURED);
        strict_1.default.equal(reservation.status, bookingFundReservationStatus_enum_1.BookingFundReservationStatus.CAPTURED);
        strict_1.default.equal(captures, 2);
        strict_1.default.equal(releases, 0);
    }
    else {
        strict_1.default.equal(booking.status, "CANCELLED");
        strict_1.default.equal(payment.status, paymentStatus_enum_1.PaymentStatus.CANCELLED);
        strict_1.default.equal(reservation.status, bookingFundReservationStatus_enum_1.BookingFundReservationStatus.RELEASED);
        strict_1.default.equal(captures, 0);
        strict_1.default.equal(releases, 2);
    }
};
const registerBookingWalletCaptureLifecycleRaceTests = () => {
    for (const contender of ["User", "Creator", "Admin"]) {
        (0, node_test_1.test)(`phase8c completion versus ${contender} cancellation has one coherent terminal winner`, async () => {
            const server = await (0, bookingWalletCaptureFixtures_1.startCaptureHttpServer)();
            try {
                const accepted = await (0, bookingWalletCaptureFixtures_1.createAcceptedWalletBooking)(server.baseUrl, { walletAmount: 1000, slotAmounts: [400] });
                const cancellation = contender === "User"
                    ? (0, bookingWalletCaptureFixtures_1.postUserCancellation)(server.baseUrl, accepted.booking._id.toString(), accepted.fixture)
                    : contender === "Creator"
                        ? (0, bookingWalletCaptureFixtures_1.postCreatorCancellation)(server.baseUrl, accepted.booking._id.toString(), accepted.creatorToken)
                        : (0, bookingWalletCaptureFixtures_1.postAdminCancellation)(server.baseUrl, accepted.booking._id.toString(), accepted.adminToken);
                await Promise.allSettled([
                    (0, bookingWalletCaptureFixtures_1.postCreatorCompletion)(server.baseUrl, accepted.booking._id.toString(), accepted.creatorToken),
                    cancellation,
                ]);
                await assertRaceWinner(accepted.booking._id.toString());
            }
            finally {
                await server.close();
            }
        });
    }
    (0, node_test_1.test)("phase8c completion versus the direct release service has one coherent terminal winner", async () => {
        const server = await (0, bookingWalletCaptureFixtures_1.startCaptureHttpServer)();
        try {
            const accepted = await (0, bookingWalletCaptureFixtures_1.createAcceptedWalletBooking)(server.baseUrl);
            await Promise.allSettled([
                (0, bookingWalletCaptureFixtures_1.postCreatorCompletion)(server.baseUrl, accepted.booking._id.toString(), accepted.creatorToken),
                bookingFinancialTermination_service_1.bookingFinancialTerminationService.terminateBookingFinancially({
                    bookingId: accepted.booking._id.toString(),
                    actorType: bookingTerminationType_enum_1.BookingTerminationActorType.CREATOR,
                    actorId: accepted.fixture.actors.creatorId.toString(),
                    terminationType: bookingTerminationType_enum_1.BookingTerminationType.CREATOR_CANCELLED,
                    reason: "Phase 8C direct release race",
                }),
            ]);
            await assertRaceWinner(accepted.booking._id.toString());
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8c Creator completion versus automatic completion persists the winning cause", async () => {
        const server = await (0, bookingWalletCaptureFixtures_1.startCaptureHttpServer)();
        try {
            const accepted = await (0, bookingWalletCaptureFixtures_1.createAcceptedWalletBooking)(server.baseUrl);
            await (0, bookingWalletCaptureFixtures_1.makeBookingAutoCompletionEligible)(accepted.booking._id.toString());
            await Promise.allSettled([
                (0, bookingWalletCaptureFixtures_1.postCreatorCompletion)(server.baseUrl, accepted.booking._id.toString(), accepted.creatorToken),
                (0, completeBookings_job_1.completeBookingsJob)(),
            ]);
            await assertRaceWinner(accepted.booking._id.toString());
            const [booking, reservation, payment] = await Promise.all([
                booking_model_1.Booking.findById(accepted.booking._id).orFail(),
                bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId: accepted.booking._id }).orFail(),
                payment_model_1.Payment.findById(accepted.booking.paymentId).orFail(),
            ]);
            strict_1.default.ok([
                bookingWalletCaptureCause_enum_1.BookingWalletCaptureCause.CREATOR_COMPLETED,
                bookingWalletCaptureCause_enum_1.BookingWalletCaptureCause.AUTO_COMPLETED,
            ].includes(booking.completionCause));
            strict_1.default.equal(reservation.captureCause, booking.completionCause);
            strict_1.default.equal(payment.captureCause, booking.completionCause);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8c expiry discovery cannot release a CONFIRMED capture candidate", async () => {
        const server = await (0, bookingWalletCaptureFixtures_1.startCaptureHttpServer)();
        try {
            const accepted = await (0, bookingWalletCaptureFixtures_1.createAcceptedWalletBooking)(server.baseUrl);
            await booking_model_1.Booking.updateOne({ _id: accepted.booking._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
            const results = await Promise.allSettled([
                (0, bookingWalletCaptureFixtures_1.postCreatorCompletion)(server.baseUrl, accepted.booking._id.toString(), accepted.creatorToken),
                (0, expireBookings_job_1.expireBookingsJob)(),
            ]);
            strict_1.default.ok(results.every((result) => result.status === "fulfilled"));
            await assertRaceWinner(accepted.booking._id.toString());
            strict_1.default.equal((await booking_model_1.Booking.findById(accepted.booking._id).orFail()).status, "COMPLETED");
        }
        finally {
            await server.close();
        }
    });
};
exports.registerBookingWalletCaptureLifecycleRaceTests = registerBookingWalletCaptureLifecycleRaceTests;
