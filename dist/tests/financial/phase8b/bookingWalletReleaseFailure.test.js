"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingWalletReleaseFailureTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const mongoose_1 = require("mongoose");
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
const paymentMethod_enum_1 = require("../../../enums/financial/paymentMethod.enum");
const paymentStatus_enum_1 = require("../../../enums/financial/paymentStatus.enum");
const BookingWalletReservationReleaseError_1 = require("../../../errors/financial/BookingWalletReservationReleaseError");
const bookingFinancialTermination_service_1 = require("../../../services/financial/bookingFinancialTermination.service");
const walletProjection_service_1 = require("../../../services/wallet/walletProjection.service");
const bookingWalletReleaseFixtures_1 = require("./fixtures/bookingWalletReleaseFixtures");
const reject = (bookingId, creatorId) => bookingFinancialTermination_service_1.bookingFinancialTerminationService.terminateBookingFinancially({
    bookingId,
    actorType: bookingTerminationType_enum_1.BookingTerminationActorType.CREATOR,
    actorId: creatorId,
    terminationType: bookingTerminationType_enum_1.BookingTerminationType.CREATOR_REJECTED,
});
const expectReleaseError = async (operation, codes) => {
    await strict_1.default.rejects(operation, (error) => {
        strict_1.default.ok(error instanceof BookingWalletReservationReleaseError_1.BookingWalletReservationReleaseError);
        strict_1.default.ok(codes.includes(error.code), `Unexpected release error: ${error.code}`);
        return true;
    });
};
const assertNoReleaseMutation = async (bookingId, paymentId, slotIds) => {
    const [booking, payment, reservation, slots] = await Promise.all([
        booking_model_1.Booking.findById(bookingId).orFail(),
        payment_model_1.Payment.findById(paymentId).orFail(),
        bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId }).orFail(),
        slot_model_1.Slot.find({ _id: { $in: slotIds } }),
    ]);
    strict_1.default.equal(booking.status, "REQUESTED");
    strict_1.default.equal(payment.status, paymentStatus_enum_1.PaymentStatus.AUTHORIZED);
    strict_1.default.equal(reservation.status, bookingFundReservationStatus_enum_1.BookingFundReservationStatus.ACTIVE);
    strict_1.default.ok(slots.every((slot) => slot.status === "LOCKED"));
    strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
        bookingId,
        source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE,
    }), 0);
    strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({
        "deltas.reservedBalance": { $lt: 0 },
    }), 0);
};
const registerBookingWalletReleaseFailureTests = () => {
    (0, node_test_1.test)("phase8b insufficient reserved balance fails closed and rolls back lifecycle changes", async () => {
        const server = await (0, bookingWalletReleaseFixtures_1.startReleaseHttpServer)();
        try {
            const { fixture, booking } = await (0, bookingWalletReleaseFixtures_1.createActiveWalletBooking)(server.baseUrl, { walletAmount: 1000, slotAmounts: [400] });
            await wallet_model_1.Wallet.updateOne({ _id: fixture.actors.wallet._id }, { $set: { availableBalance: 900, reservedBalance: 100 } });
            await expectReleaseError(reject(booking._id.toString(), fixture.actors.creatorId.toString()), ["BOOKING_WALLET_RELEASE_INSUFFICIENT_RESERVED_BALANCE"]);
            await assertNoReleaseMutation(booking._id.toString(), booking.paymentId, booking.slotIds);
            const wallet = await wallet_model_1.Wallet.findById(fixture.actors.wallet._id).orFail();
            strict_1.default.equal(wallet.availableBalance, 900);
            strict_1.default.equal(wallet.reservedBalance, 100);
            strict_1.default.equal(wallet.currentBalance, 1000);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8b CAPTURED reservation and Payment can never be released", async () => {
        const server = await (0, bookingWalletReleaseFixtures_1.startReleaseHttpServer)();
        try {
            const { fixture, booking } = await (0, bookingWalletReleaseFixtures_1.createActiveWalletBooking)(server.baseUrl, { walletAmount: 1000, slotAmounts: [400] });
            await bookingFundReservation_model_1.BookingFundReservation.updateOne({ bookingId: booking._id }, { $set: { status: bookingFundReservationStatus_enum_1.BookingFundReservationStatus.CAPTURED, capturedAt: new Date() } });
            await payment_model_1.Payment.updateOne({ _id: booking.paymentId }, { $set: { status: paymentStatus_enum_1.PaymentStatus.CAPTURED } });
            await expectReleaseError(reject(booking._id.toString(), fixture.actors.creatorId.toString()), ["BOOKING_WALLET_RELEASE_ALREADY_CAPTURED"]);
            const [persistedBooking, reservation, payment, slots] = await Promise.all([
                booking_model_1.Booking.findById(booking._id).orFail(),
                bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId: booking._id }).orFail(),
                payment_model_1.Payment.findById(booking.paymentId).orFail(),
                slot_model_1.Slot.find({ _id: { $in: booking.slotIds } }),
            ]);
            strict_1.default.equal(persistedBooking.status, "REQUESTED");
            strict_1.default.equal(reservation.status, bookingFundReservationStatus_enum_1.BookingFundReservationStatus.CAPTURED);
            strict_1.default.equal(payment.status, paymentStatus_enum_1.PaymentStatus.CAPTURED);
            strict_1.default.ok(slots.every((slot) => slot.status === "LOCKED"));
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                bookingId: booking._id,
                source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE,
            }), 0);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8b projection failure after slot release rolls back every transactional record", async () => {
        const server = await (0, bookingWalletReleaseFixtures_1.startReleaseHttpServer)();
        const original = walletProjection_service_1.walletProjectionService.applyProjectionMutation.bind(walletProjection_service_1.walletProjectionService);
        try {
            const { fixture, booking } = await (0, bookingWalletReleaseFixtures_1.createActiveWalletBooking)(server.baseUrl, { walletAmount: 1000, slotAmounts: [400] });
            walletProjection_service_1.walletProjectionService.applyProjectionMutation = async () => {
                throw new Error("controlled Phase 8B projection failure");
            };
            await expectReleaseError(reject(booking._id.toString(), fixture.actors.creatorId.toString()), ["BOOKING_WALLET_RELEASE_PROJECTION_CONFLICT"]);
            await assertNoReleaseMutation(booking._id.toString(), booking.paymentId, booking.slotIds);
            const wallet = await wallet_model_1.Wallet.findById(fixture.actors.wallet._id).orFail();
            strict_1.default.equal(wallet.availableBalance, 580);
            strict_1.default.equal(wallet.reservedBalance, 420);
        }
        finally {
            walletProjection_service_1.walletProjectionService.applyProjectionMutation = original;
            await server.close();
        }
    });
    const conflictCases = [
        {
            name: "amount",
            mutate: (bookingId) => booking_model_1.Booking.collection.updateOne({ _id: new mongoose_1.Types.ObjectId(bookingId) }, { $set: { totalAmount: 421 } }),
            codes: ["BOOKING_WALLET_RELEASE_AMOUNT_CONFLICT"],
        },
        {
            name: "currency",
            mutate: (_bookingId, paymentId) => payment_model_1.Payment.collection.updateOne({ _id: paymentId }, { $set: { currency: "USD" } }),
            codes: ["BOOKING_WALLET_RELEASE_CURRENCY_CONFLICT"],
        },
        {
            name: "payment method",
            mutate: (_bookingId, paymentId) => payment_model_1.Payment.collection.updateOne({ _id: paymentId }, { $set: { method: paymentMethod_enum_1.PaymentMethod.INTERNAL } }),
            codes: ["BOOKING_WALLET_RELEASE_PAYMENT_METHOD_CONFLICT"],
        },
        {
            name: "reservation Payment link",
            mutate: (bookingId) => bookingFundReservation_model_1.BookingFundReservation.collection.updateOne({ bookingId: new mongoose_1.Types.ObjectId(bookingId) }, { $set: { paymentId: new mongoose_1.Types.ObjectId() } }),
            codes: ["BOOKING_WALLET_RELEASE_IDENTITY_CONFLICT"],
        },
        {
            name: "Payment reservation link",
            mutate: (_bookingId, paymentId) => payment_model_1.Payment.collection.updateOne({ _id: paymentId }, { $set: { reservationId: new mongoose_1.Types.ObjectId() } }),
            codes: ["BOOKING_WALLET_RELEASE_IDENTITY_CONFLICT"],
        },
        {
            name: "User identity",
            mutate: (bookingId) => bookingFundReservation_model_1.BookingFundReservation.collection.updateOne({ bookingId: new mongoose_1.Types.ObjectId(bookingId) }, { $set: { userId: new mongoose_1.Types.ObjectId() } }),
            codes: ["BOOKING_WALLET_RELEASE_IDENTITY_CONFLICT"],
        },
        {
            name: "Wallet identity",
            mutate: (bookingId) => bookingFundReservation_model_1.BookingFundReservation.collection.updateOne({ bookingId: new mongoose_1.Types.ObjectId(bookingId) }, { $set: { walletId: new mongoose_1.Types.ObjectId() } }),
            codes: ["BOOKING_WALLET_RELEASE_IDENTITY_CONFLICT"],
        },
        {
            name: "Creator identity",
            mutate: (bookingId) => bookingFundReservation_model_1.BookingFundReservation.collection.updateOne({ bookingId: new mongoose_1.Types.ObjectId(bookingId) }, { $set: { creatorId: new mongoose_1.Types.ObjectId() } }),
            codes: ["BOOKING_WALLET_RELEASE_IDENTITY_CONFLICT"],
        },
        {
            name: "service identity",
            mutate: (bookingId) => bookingFundReservation_model_1.BookingFundReservation.collection.updateOne({ bookingId: new mongoose_1.Types.ObjectId(bookingId) }, { $set: { serviceId: new mongoose_1.Types.ObjectId() } }),
            codes: ["BOOKING_WALLET_RELEASE_IDENTITY_CONFLICT"],
        },
        {
            name: "authorization transaction",
            mutate: (bookingId) => bookingFundReservation_model_1.BookingFundReservation.collection.updateOne({ bookingId: new mongoose_1.Types.ObjectId(bookingId) }, { $unset: { ledgerTransactionId: "" } }),
            codes: ["BOOKING_WALLET_RELEASE_INTEGRITY_ERROR"],
        },
        {
            name: "partial release transaction",
            mutate: (bookingId) => bookingFundReservation_model_1.BookingFundReservation.collection.updateOne({ bookingId: new mongoose_1.Types.ObjectId(bookingId) }, { $set: { releaseTransactionId: "corrupt-release-transaction" } }),
            codes: ["BOOKING_WALLET_RELEASE_INTEGRITY_ERROR"],
        },
        {
            name: "partial release cause",
            mutate: (bookingId) => bookingFundReservation_model_1.BookingFundReservation.collection.updateOne({ bookingId: new mongoose_1.Types.ObjectId(bookingId) }, { $set: { releaseCause: "REQUEST_EXPIRED" } }),
            codes: ["BOOKING_WALLET_RELEASE_INTEGRITY_ERROR"],
        },
        {
            name: "terminal Payment with ACTIVE reservation",
            mutate: (_bookingId, paymentId) => payment_model_1.Payment.collection.updateOne({ _id: paymentId }, { $set: { status: paymentStatus_enum_1.PaymentStatus.CANCELLED } }),
            codes: ["BOOKING_WALLET_RELEASE_INVALID_PAYMENT_STATUS"],
        },
    ];
    for (const conflictCase of conflictCases) {
        (0, node_test_1.test)(`phase8b ${conflictCase.name} identity conflict fails closed`, async () => {
            const server = await (0, bookingWalletReleaseFixtures_1.startReleaseHttpServer)();
            try {
                const { fixture, booking } = await (0, bookingWalletReleaseFixtures_1.createActiveWalletBooking)(server.baseUrl, { walletAmount: 1000, slotAmounts: [400] });
                await conflictCase.mutate(booking._id.toString(), booking.paymentId);
                await expectReleaseError(reject(booking._id.toString(), fixture.actors.creatorId.toString()), conflictCase.codes);
                const [persistedBooking, reservation, slots] = await Promise.all([
                    booking_model_1.Booking.findById(booking._id).orFail(),
                    bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId: booking._id }).orFail(),
                    slot_model_1.Slot.find({ _id: { $in: booking.slotIds } }),
                ]);
                strict_1.default.equal(persistedBooking.status, "REQUESTED");
                strict_1.default.equal(reservation.status, bookingFundReservationStatus_enum_1.BookingFundReservationStatus.ACTIVE);
                strict_1.default.ok(slots.every((slot) => slot.status === "LOCKED"));
                strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                    bookingId: booking._id,
                    source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE,
                }), 0);
            }
            finally {
                await server.close();
            }
        });
    }
};
exports.registerBookingWalletReleaseFailureTests = registerBookingWalletReleaseFailureTests;
