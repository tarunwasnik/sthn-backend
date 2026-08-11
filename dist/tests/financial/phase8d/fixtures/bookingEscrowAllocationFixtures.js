"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCapturedWalletBooking = exports.startAllocationHttpServer = void 0;
const booking_model_1 = require("../../../../models/booking.model");
const bookingFundReservation_model_1 = require("../../../../models/bookingFundReservation.model");
const payment_model_1 = require("../../../../models/payment.model");
const bookingWalletCaptureFixtures_1 = require("../../phase8c/fixtures/bookingWalletCaptureFixtures");
let allocationFixtureSequence = 0;
exports.startAllocationHttpServer = bookingWalletCaptureFixtures_1.startCaptureHttpServer;
const createCapturedWalletBooking = async (baseUrl, options = {}) => {
    allocationFixtureSequence += 1;
    const accepted = await (0, bookingWalletCaptureFixtures_1.createAcceptedWalletBooking)(baseUrl, options);
    const completion = await (0, bookingWalletCaptureFixtures_1.postCreatorCompletion)(baseUrl, accepted.booking._id.toString(), accepted.creatorToken);
    if (completion.status !== 200) {
        throw new Error(`Phase 8D capture fixture failed: ${JSON.stringify(completion.body)}`);
    }
    const booking = await booking_model_1.Booking.findById(accepted.booking._id).orFail();
    const payment = await payment_model_1.Payment.findById(booking.paymentId)
        .select("+walletId +reservationId").orFail();
    const reservation = await bookingFundReservation_model_1.BookingFundReservation.findOne({
        bookingId: booking._id,
    }).select("+walletId +captureKey +captureTransactionId +captureLedgerEntryIds " +
        "+captureProjectionOperationId +captureProjectionOperationReference " +
        "+captureFingerprint +capturedById").orFail();
    return {
        ...accepted,
        booking,
        payment,
        reservation,
        completion,
        allocationFixtureSequence,
    };
};
exports.createCapturedWalletBooking = createCapturedWalletBooking;
