"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingWalletReservationFullFlowTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const booking_model_1 = require("../../../models/booking.model");
const bookingFundReservation_model_1 = require("../../../models/bookingFundReservation.model");
const internalPayment_model_1 = __importDefault(require("../../../models/internalProvider/internalPayment.model"));
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const payment_model_1 = require("../../../models/payment.model");
const settlement_model_1 = require("../../../models/settlement.model");
const slot_model_1 = require("../../../models/slot.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const bookingFundReservationStatus_enum_1 = require("../../../enums/financial/bookingFundReservationStatus.enum");
const ledgerAccount_enum_1 = require("../../../enums/financial/ledgerAccount.enum");
const ledgerEntryType_enum_1 = require("../../../enums/financial/ledgerEntryType.enum");
const ledgerSource_enum_1 = require("../../../enums/financial/ledgerSource.enum");
const moneyDirection_enum_1 = require("../../../enums/financial/moneyDirection.enum");
const paymentMethod_enum_1 = require("../../../enums/financial/paymentMethod.enum");
const paymentStatus_enum_1 = require("../../../enums/financial/paymentStatus.enum");
const bookingWalletFixtures_1 = require("./fixtures/bookingWalletFixtures");
const registerBookingWalletReservationFullFlowTests = () => {
    (0, node_test_1.test)("phase8a full flow: Wallet booking atomically reserves the exact booking snapshot", async () => {
        const fixture = await (0, bookingWalletFixtures_1.createBookingWalletFixture)({ walletAmount: 1000, slotAmounts: [400] });
        const before = await wallet_model_1.Wallet.findById(fixture.actors.wallet._id).orFail();
        const server = await (0, bookingWalletFixtures_1.startBookingHttpServer)();
        try {
            const response = await (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, fixture, "phase8a-full-flow");
            strict_1.default.equal(response.status, 201, JSON.stringify(response.body));
            const [booking, payment, reservation, wallet, slots, entries, operations] = await Promise.all([
                booking_model_1.Booking.findOne({ bookingReference: response.body.booking.bookingReference }),
                payment_model_1.Payment.findOne({ paymentReference: response.body.payment.paymentReference }),
                bookingFundReservation_model_1.BookingFundReservation.findOne({
                    reservationReference: response.body.reservation.reservationReference,
                }).select("+walletId +ledgerTransactionId +ledgerEntryIds +projectionOperationId"),
                wallet_model_1.Wallet.findById(fixture.actors.wallet._id),
                slot_model_1.Slot.find({ _id: { $in: fixture.slotIds } }),
                ledgerEntry_model_1.LedgerEntry.find({ source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_AUTHORIZATION }),
                walletProjectionOperation_model_1.WalletProjectionOperation.find({
                    operationReference: { $regex: /^WPO-/ },
                    "deltas.reservedBalance": fixture.totalAmount,
                }),
            ]);
            strict_1.default.ok(booking);
            strict_1.default.ok(payment);
            strict_1.default.ok(reservation);
            strict_1.default.ok(wallet);
            strict_1.default.equal(booking.status, "REQUESTED");
            strict_1.default.ok(slots.every((slot) => slot.status === "LOCKED"));
            strict_1.default.equal(payment.method, paymentMethod_enum_1.PaymentMethod.WALLET);
            strict_1.default.equal(payment.status, paymentStatus_enum_1.PaymentStatus.AUTHORIZED);
            strict_1.default.equal(payment.amount, fixture.totalAmount);
            strict_1.default.equal(payment.serviceAmount, fixture.serviceAmount);
            strict_1.default.equal(payment.customerFeeAmount, fixture.platformFeeAmount);
            strict_1.default.equal(reservation.status, bookingFundReservationStatus_enum_1.BookingFundReservationStatus.ACTIVE);
            strict_1.default.equal(reservation.amount, fixture.totalAmount);
            strict_1.default.equal(entries.length, 2);
            strict_1.default.equal(new Set(entries.map((entry) => entry.transactionId)).size, 1);
            strict_1.default.ok(entries.every((entry) => entry.userId?.equals(fixture.actors.userId)));
            strict_1.default.ok(entries.every((entry) => entry.walletId?.equals(fixture.actors.wallet._id)));
            const available = entries.find((entry) => entry.account === ledgerAccount_enum_1.LedgerAccount.WALLET_AVAILABLE);
            const reserved = entries.find((entry) => entry.account === ledgerAccount_enum_1.LedgerAccount.WALLET_RESERVED);
            strict_1.default.equal(available?.direction, moneyDirection_enum_1.MoneyDirection.DEBIT);
            strict_1.default.equal(reserved?.direction, moneyDirection_enum_1.MoneyDirection.CREDIT);
            strict_1.default.equal(available?.type, ledgerEntryType_enum_1.LedgerEntryType.BOOKING_FUNDS_RESERVED);
            strict_1.default.equal(available?.amount, fixture.totalAmount);
            strict_1.default.equal(reserved?.amount, fixture.totalAmount);
            strict_1.default.equal(operations.length, 1);
            strict_1.default.equal(operations[0].deltas.availableBalance, -fixture.totalAmount);
            strict_1.default.equal(operations[0].deltas.reservedBalance, fixture.totalAmount);
            strict_1.default.equal(operations[0].deltas.lockedBalance, 0);
            strict_1.default.equal(wallet.availableBalance, before.availableBalance - fixture.totalAmount);
            strict_1.default.equal(wallet.reservedBalance, before.reservedBalance + fixture.totalAmount);
            strict_1.default.equal(wallet.lockedBalance, before.lockedBalance);
            strict_1.default.equal(wallet.currentBalance, before.currentBalance);
            strict_1.default.equal(await internalPayment_model_1.default.countDocuments({ paymentId: payment._id }), 0);
            strict_1.default.equal(await wallet_model_1.Wallet.countDocuments({ userId: fixture.actors.creatorId }), 0);
            strict_1.default.equal(await settlement_model_1.Settlement.countDocuments({ paymentId: payment._id }), 0);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                paymentId: payment._id,
                type: ledgerEntryType_enum_1.LedgerEntryType.COMMISSION,
            }), 0);
            strict_1.default.equal("_id" in response.body.booking, false);
            strict_1.default.equal("walletId" in response.body.reservation, false);
            strict_1.default.equal("ledgerEntryIds" in response.body.reservation, false);
            strict_1.default.equal("idempotencyKey" in response.body.payment, false);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerBookingWalletReservationFullFlowTests = registerBookingWalletReservationFullFlowTests;
