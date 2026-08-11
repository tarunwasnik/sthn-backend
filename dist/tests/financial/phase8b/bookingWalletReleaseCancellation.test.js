"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingWalletReleaseCancellationTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const booking_model_1 = require("../../../models/booking.model");
const bookingFundReservation_model_1 = require("../../../models/bookingFundReservation.model");
const payment_model_1 = require("../../../models/payment.model");
const slot_model_1 = require("../../../models/slot.model");
const wallet_model_1 = require("../../../models/wallet.model");
const bookingWalletReleaseCause_enum_1 = require("../../../enums/financial/bookingWalletReleaseCause.enum");
const paymentStatus_enum_1 = require("../../../enums/financial/paymentStatus.enum");
const bookingWalletReleaseFixtures_1 = require("./fixtures/bookingWalletReleaseFixtures");
const assertCancelledRelease = async (bookingId, walletId, cause) => {
    const booking = await booking_model_1.Booking.findById(bookingId).orFail();
    const payment = await payment_model_1.Payment.findById(booking.paymentId).orFail();
    const reservation = await bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId }).orFail();
    const wallet = await wallet_model_1.Wallet.findById(walletId).orFail();
    const slots = await slot_model_1.Slot.find({ _id: { $in: booking.slotIds } });
    strict_1.default.equal(booking.status, "CANCELLED");
    strict_1.default.equal(payment.status, paymentStatus_enum_1.PaymentStatus.CANCELLED);
    strict_1.default.equal(reservation.releaseCause, cause);
    strict_1.default.ok(reservation.releasedAt);
    strict_1.default.ok(slots.every((slot) => slot.status === "AVAILABLE"));
    strict_1.default.equal(wallet.availableBalance, 1000);
    strict_1.default.equal(wallet.reservedBalance, 0);
};
const registerBookingWalletReleaseCancellationTests = () => {
    (0, node_test_1.test)("phase8b User cancellation releases a REQUESTED Wallet booking using authenticated identity", async () => {
        const server = await (0, bookingWalletReleaseFixtures_1.startReleaseHttpServer)();
        try {
            const { fixture, booking } = await (0, bookingWalletReleaseFixtures_1.createActiveWalletBooking)(server.baseUrl, { walletAmount: 1000, slotAmounts: [400] });
            const response = await (0, bookingWalletReleaseFixtures_1.postUserCancellation)(server.baseUrl, booking._id.toString(), fixture);
            strict_1.default.equal(response.status, 200, JSON.stringify(response.body));
            await assertCancelledRelease(booking._id.toString(), fixture.actors.wallet._id, bookingWalletReleaseCause_enum_1.BookingWalletReleaseCause.USER_CANCELLED);
            const cancelled = await booking_model_1.Booking.findById(booking._id).orFail();
            strict_1.default.ok(cancelled.terminatedById?.equals(fixture.actors.userId));
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8b Creator cancellation releases an uncaptured CONFIRMED Wallet booking", async () => {
        const server = await (0, bookingWalletReleaseFixtures_1.startReleaseHttpServer)();
        try {
            const { fixture, booking, creatorToken } = await (0, bookingWalletReleaseFixtures_1.createActiveWalletBooking)(server.baseUrl, { walletAmount: 1000, slotAmounts: [400] });
            const accepted = await (0, bookingWalletReleaseFixtures_1.postCreatorDecision)(server.baseUrl, booking._id.toString(), creatorToken, "ACCEPT");
            strict_1.default.equal(accepted.status, 200, JSON.stringify(accepted.body));
            const response = await (0, bookingWalletReleaseFixtures_1.postCreatorCancellation)(server.baseUrl, booking._id.toString(), creatorToken);
            strict_1.default.equal(response.status, 200, JSON.stringify(response.body));
            await assertCancelledRelease(booking._id.toString(), fixture.actors.wallet._id, bookingWalletReleaseCause_enum_1.BookingWalletReleaseCause.CREATOR_CANCELLED);
            const cancelled = await booking_model_1.Booking.findById(booking._id).orFail();
            strict_1.default.ok(cancelled.terminatedById?.equals(fixture.actors.creatorId));
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8b existing Admin cancellation releases an authorized Wallet booking", async () => {
        const server = await (0, bookingWalletReleaseFixtures_1.startReleaseHttpServer)();
        try {
            const { fixture, booking, adminToken } = await (0, bookingWalletReleaseFixtures_1.createActiveWalletBooking)(server.baseUrl, { walletAmount: 1000, slotAmounts: [400] });
            const result = await (0, bookingWalletReleaseFixtures_1.postAdminCancellation)(server.baseUrl, booking._id.toString(), adminToken);
            strict_1.default.equal(result.status, 200, JSON.stringify(result.body));
            strict_1.default.equal(result.body.financialAction, "RELEASE");
            await assertCancelledRelease(booking._id.toString(), fixture.actors.wallet._id, bookingWalletReleaseCause_enum_1.BookingWalletReleaseCause.ADMIN_CANCELLED);
            const cancelled = await booking_model_1.Booking.findById(booking._id).orFail();
            strict_1.default.ok(cancelled.terminatedById?.equals(fixture.actors.adminId));
        }
        finally {
            await server.close();
        }
    });
};
exports.registerBookingWalletReleaseCancellationTests = registerBookingWalletReleaseCancellationTests;
