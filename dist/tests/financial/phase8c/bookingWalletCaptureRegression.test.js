"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingWalletCaptureRegressionTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const booking_model_1 = require("../../../models/booking.model");
const bookingFundReservation_model_1 = require("../../../models/bookingFundReservation.model");
const internalTopUpFunding_model_1 = require("../../../models/internalTopUpFunding.model");
const internalPayment_model_1 = __importDefault(require("../../../models/internalProvider/internalPayment.model"));
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const payment_model_1 = require("../../../models/payment.model");
const settlement_model_1 = require("../../../models/settlement.model");
const wallet_model_1 = require("../../../models/wallet.model");
const bookingFundReservationStatus_enum_1 = require("../../../enums/financial/bookingFundReservationStatus.enum");
const ledgerSource_enum_1 = require("../../../enums/financial/ledgerSource.enum");
const paymentMethod_enum_1 = require("../../../enums/financial/paymentMethod.enum");
const paymentStatus_enum_1 = require("../../../enums/financial/paymentStatus.enum");
const bookingWalletFixtures_1 = require("../phase8a/fixtures/bookingWalletFixtures");
const topUpFixtures_1 = require("../phase7h/fixtures/topUpFixtures");
const bookingWalletReleaseFixtures_1 = require("../phase8b/fixtures/bookingWalletReleaseFixtures");
const bookingWalletCaptureFixtures_1 = require("./fixtures/bookingWalletCaptureFixtures");
const registerBookingWalletCaptureRegressionTests = () => {
    (0, node_test_1.test)("phase8c INTERNAL-provider completion remains on Payment lifecycle without Wallet capture", async () => {
        const server = await (0, bookingWalletCaptureFixtures_1.startCaptureHttpServer)();
        try {
            const fixture = await (0, bookingWalletFixtures_1.createBookingWalletFixture)({ walletAmount: 0, slotAmounts: [200] });
            const response = await fetch(`${server.baseUrl}/api/v1/bookings/request`, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    authorization: `Bearer ${fixture.token}`,
                },
                body: JSON.stringify({
                    serviceId: fixture.serviceId.toString(),
                    slotIds: fixture.slotIds.map(String),
                    paymentMethod: paymentMethod_enum_1.PaymentMethod.INTERNAL,
                }),
            });
            const body = await response.json();
            strict_1.default.equal(response.status, 201, JSON.stringify(body));
            const booking = await booking_model_1.Booking.findOne({
                bookingReference: body.booking.bookingReference,
            }).orFail();
            const payment = await payment_model_1.Payment.findById(booking.paymentId).orFail();
            strict_1.default.equal(payment.method, paymentMethod_enum_1.PaymentMethod.INTERNAL);
            strict_1.default.equal(payment.status, paymentStatus_enum_1.PaymentStatus.CAPTURED);
            strict_1.default.equal(await internalPayment_model_1.default.countDocuments({ paymentId: payment._id }), 1);
            const creatorToken = jsonwebtoken_1.default.sign({ id: fixture.actors.creatorId.toString(), role: "creator" }, process.env.JWT_SECRET);
            const accepted = await (0, bookingWalletReleaseFixtures_1.postCreatorDecision)(server.baseUrl, booking._id.toString(), creatorToken, "ACCEPT");
            strict_1.default.equal(accepted.status, 200, JSON.stringify(accepted.body));
            await (0, bookingWalletCaptureFixtures_1.enableBookingCompletion)(fixture.actors.adminId.toString());
            const completed = await (0, bookingWalletCaptureFixtures_1.postCreatorCompletion)(server.baseUrl, booking._id.toString(), creatorToken);
            strict_1.default.equal(completed.status, 200, JSON.stringify(completed.body));
            strict_1.default.equal((await booking_model_1.Booking.findById(booking._id).orFail()).status, "COMPLETED");
            strict_1.default.equal(await bookingFundReservation_model_1.BookingFundReservation.countDocuments({ bookingId: booking._id }), 0);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                bookingId: booking._id,
                source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_CAPTURE,
            }), 0);
            strict_1.default.equal(await wallet_model_1.Wallet.countDocuments({ userId: fixture.actors.creatorId }), 0);
            strict_1.default.equal(await settlement_model_1.Settlement.countDocuments({ paymentId: payment._id }), 0);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8c cancellation still releases ACTIVE Wallet funds and never captures them", async () => {
        const server = await (0, bookingWalletCaptureFixtures_1.startCaptureHttpServer)();
        try {
            const active = await (0, bookingWalletReleaseFixtures_1.createActiveWalletBooking)(server.baseUrl, { walletAmount: 1000, slotAmounts: [400] });
            const response = await (0, bookingWalletCaptureFixtures_1.postUserCancellation)(server.baseUrl, active.booking._id.toString(), active.fixture);
            strict_1.default.equal(response.status, 200, JSON.stringify(response.body));
            const reservation = await bookingFundReservation_model_1.BookingFundReservation.findOne({
                bookingId: active.booking._id,
            }).orFail();
            strict_1.default.equal(reservation.status, bookingFundReservationStatus_enum_1.BookingFundReservationStatus.RELEASED);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                bookingId: active.booking._id,
                source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_CAPTURE,
            }), 0);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                bookingId: active.booking._id,
                source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE,
            }), 2);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8c booking capture cannot operate on Wallet top-up funding records", async () => {
        const actors = await (0, topUpFixtures_1.createActors)();
        const { request } = await (0, topUpFixtures_1.createFundedTopUp)(actors, 300);
        strict_1.default.equal(await internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments({ topUpRequestId: request._id }), 1);
        strict_1.default.equal(await bookingFundReservation_model_1.BookingFundReservation.countDocuments(), 0);
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({ source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_CAPTURE }), 0);
    });
    (0, node_test_1.test)("phase8c capture authority and completion indexes are present", async () => {
        const reservationIndexes = await bookingFundReservation_model_1.BookingFundReservation.collection.indexes();
        for (const field of [
            "captureReference",
            "captureKey",
            "captureTransactionId",
            "captureProjectionOperationReference",
        ]) {
            const index = reservationIndexes.find((candidate) => candidate.key[field] === 1);
            strict_1.default.ok(index, `${field} index is missing`);
            strict_1.default.equal(index.unique, true);
            strict_1.default.ok(index.partialFilterExpression);
        }
        const bookingIndexes = await booking_model_1.Booking.collection.indexes();
        const completion = bookingIndexes.find((candidate) => candidate.key.completionOperationKey === 1);
        strict_1.default.ok(completion);
        strict_1.default.equal(completion.unique, true);
        strict_1.default.ok(completion.partialFilterExpression);
    });
};
exports.registerBookingWalletCaptureRegressionTests = registerBookingWalletCaptureRegressionTests;
