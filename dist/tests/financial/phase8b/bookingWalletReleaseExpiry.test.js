"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingWalletReleaseExpiryTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const booking_model_1 = require("../../../models/booking.model");
const bookingFundReservation_model_1 = require("../../../models/bookingFundReservation.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const payment_model_1 = require("../../../models/payment.model");
const slot_model_1 = require("../../../models/slot.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const bookingFundReservationStatus_enum_1 = require("../../../enums/financial/bookingFundReservationStatus.enum");
const ledgerSource_enum_1 = require("../../../enums/financial/ledgerSource.enum");
const paymentStatus_enum_1 = require("../../../enums/financial/paymentStatus.enum");
const expireBookings_job_1 = require("../../../jobs/expireBookings.job");
const bookingWalletReleaseFixtures_1 = require("./fixtures/bookingWalletReleaseFixtures");
const registerBookingWalletReleaseExpiryTests = () => {
    (0, node_test_1.test)("phase8b expiry job releases once and repeated execution is effect-free", async () => {
        const server = await (0, bookingWalletReleaseFixtures_1.startReleaseHttpServer)();
        try {
            const { fixture, booking } = await (0, bookingWalletReleaseFixtures_1.createActiveWalletBooking)(server.baseUrl, { walletAmount: 1000, slotAmounts: [400] });
            await booking_model_1.Booking.updateOne({ _id: booking._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
            await (0, expireBookings_job_1.expireBookingsJob)();
            const firstReservation = await bookingFundReservation_model_1.BookingFundReservation.findOne({
                bookingId: booking._id,
            }).orFail();
            const firstReleasedAt = firstReservation.releasedAt?.getTime();
            await (0, expireBookings_job_1.expireBookingsJob)();
            const [expired, payment, reservation, wallet, slots] = await Promise.all([
                booking_model_1.Booking.findById(booking._id).orFail(),
                payment_model_1.Payment.findById(booking.paymentId).orFail(),
                bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId: booking._id }).orFail(),
                wallet_model_1.Wallet.findById(fixture.actors.wallet._id).orFail(),
                slot_model_1.Slot.find({ _id: { $in: booking.slotIds } }),
            ]);
            strict_1.default.equal(expired.status, "EXPIRED");
            strict_1.default.equal(payment.status, paymentStatus_enum_1.PaymentStatus.EXPIRED);
            strict_1.default.equal(reservation.status, bookingFundReservationStatus_enum_1.BookingFundReservationStatus.RELEASED);
            strict_1.default.equal(reservation.releasedAt?.getTime(), firstReleasedAt);
            strict_1.default.ok(slots.every((slot) => slot.status === "AVAILABLE"));
            strict_1.default.equal(wallet.availableBalance, 1000);
            strict_1.default.equal(wallet.reservedBalance, 0);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                bookingId: booking._id,
                source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE,
            }), 2);
            strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({
                walletId: fixture.actors.wallet._id,
                "deltas.reservedBalance": -420,
            }), 1);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerBookingWalletReleaseExpiryTests = registerBookingWalletReleaseExpiryTests;
