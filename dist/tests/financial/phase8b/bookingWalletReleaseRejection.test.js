"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingWalletReleaseRejectionTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const auditLog_model_1 = require("../../../models/auditLog.model");
const booking_model_1 = require("../../../models/booking.model");
const bookingFundReservation_model_1 = require("../../../models/bookingFundReservation.model");
const internalPayment_model_1 = __importDefault(require("../../../models/internalProvider/internalPayment.model"));
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const payment_model_1 = require("../../../models/payment.model");
const refund_model_1 = require("../../../models/refund.model");
const settlement_model_1 = require("../../../models/settlement.model");
const slot_model_1 = require("../../../models/slot.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const bookingFundReservationStatus_enum_1 = require("../../../enums/financial/bookingFundReservationStatus.enum");
const bookingWalletReleaseCause_enum_1 = require("../../../enums/financial/bookingWalletReleaseCause.enum");
const ledgerAccount_enum_1 = require("../../../enums/financial/ledgerAccount.enum");
const ledgerEntryType_enum_1 = require("../../../enums/financial/ledgerEntryType.enum");
const ledgerSource_enum_1 = require("../../../enums/financial/ledgerSource.enum");
const moneyDirection_enum_1 = require("../../../enums/financial/moneyDirection.enum");
const paymentStatus_enum_1 = require("../../../enums/financial/paymentStatus.enum");
const bookingWalletReleaseFixtures_1 = require("./fixtures/bookingWalletReleaseFixtures");
const registerBookingWalletReleaseRejectionTests = () => {
    (0, node_test_1.test)("phase8b Creator rejection atomically reverses the uncaptured Wallet reservation", async () => {
        const server = await (0, bookingWalletReleaseFixtures_1.startReleaseHttpServer)();
        try {
            const { fixture, booking, creatorToken } = await (0, bookingWalletReleaseFixtures_1.createActiveWalletBooking)(server.baseUrl, { walletAmount: 1000, slotAmounts: [400] });
            const before = await wallet_model_1.Wallet.findById(fixture.actors.wallet._id).orFail();
            strict_1.default.equal(before.availableBalance, 580);
            strict_1.default.equal(before.reservedBalance, 420);
            const response = await (0, bookingWalletReleaseFixtures_1.postCreatorDecision)(server.baseUrl, booking._id.toString(), creatorToken, "REJECT");
            strict_1.default.equal(response.status, 200, JSON.stringify(response.body));
            strict_1.default.equal(response.body.financialAction, "RELEASE");
            strict_1.default.equal("_id" in response.body.booking, false);
            strict_1.default.equal("walletId" in response.body.reservation, false);
            const [releasedBooking, payment, reservation, wallet, slots, entries, projections] = await Promise.all([
                booking_model_1.Booking.findById(booking._id).orFail(),
                payment_model_1.Payment.findById(booking.paymentId).orFail(),
                bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId: booking._id })
                    .select("+releaseLedgerEntryIds +releaseTransactionId +releaseProjectionOperationId")
                    .orFail(),
                wallet_model_1.Wallet.findById(fixture.actors.wallet._id).orFail(),
                slot_model_1.Slot.find({ _id: { $in: booking.slotIds } }),
                ledgerEntry_model_1.LedgerEntry.find({
                    bookingId: booking._id,
                    source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE,
                }),
                walletProjectionOperation_model_1.WalletProjectionOperation.find({
                    walletId: fixture.actors.wallet._id,
                    "deltas.reservedBalance": -420,
                }),
            ]);
            strict_1.default.equal(releasedBooking.status, "REJECTED");
            strict_1.default.ok(slots.every((slot) => slot.status === "AVAILABLE"));
            strict_1.default.equal(payment.status, paymentStatus_enum_1.PaymentStatus.CANCELLED);
            strict_1.default.equal(payment.releaseCause, bookingWalletReleaseCause_enum_1.BookingWalletReleaseCause.CREATOR_REJECTED);
            strict_1.default.equal(reservation.status, bookingFundReservationStatus_enum_1.BookingFundReservationStatus.RELEASED);
            strict_1.default.equal(reservation.releaseCause, bookingWalletReleaseCause_enum_1.BookingWalletReleaseCause.CREATOR_REJECTED);
            strict_1.default.ok(reservation.releasedAt);
            strict_1.default.equal(wallet.availableBalance, 1000);
            strict_1.default.equal(wallet.reservedBalance, 0);
            strict_1.default.equal(wallet.lockedBalance, 0);
            strict_1.default.equal(wallet.currentBalance, 1000);
            strict_1.default.equal(entries.length, 2);
            strict_1.default.equal(new Set(entries.map((entry) => entry.transactionId)).size, 1);
            const reservedDebit = entries.find((entry) => entry.account === ledgerAccount_enum_1.LedgerAccount.WALLET_RESERVED);
            const availableCredit = entries.find((entry) => entry.account === ledgerAccount_enum_1.LedgerAccount.WALLET_AVAILABLE);
            strict_1.default.equal(reservedDebit?.direction, moneyDirection_enum_1.MoneyDirection.DEBIT);
            strict_1.default.equal(availableCredit?.direction, moneyDirection_enum_1.MoneyDirection.CREDIT);
            strict_1.default.equal(reservedDebit?.type, ledgerEntryType_enum_1.LedgerEntryType.BOOKING_FUNDS_RELEASED);
            strict_1.default.equal(reservedDebit?.amount, 420);
            strict_1.default.equal(availableCredit?.amount, 420);
            strict_1.default.equal(projections.length, 1);
            strict_1.default.equal(projections[0].deltas.availableBalance, 420);
            strict_1.default.equal(projections[0].deltas.reservedBalance, -420);
            strict_1.default.equal(projections[0].deltas.lockedBalance, 0);
            strict_1.default.equal(await internalPayment_model_1.default.countDocuments({ paymentId: payment._id }), 0);
            strict_1.default.equal(await wallet_model_1.Wallet.countDocuments({ userId: fixture.actors.creatorId }), 0);
            strict_1.default.equal(await settlement_model_1.Settlement.countDocuments({ paymentId: payment._id }), 0);
            strict_1.default.equal(await refund_model_1.Refund.countDocuments({ paymentId: payment._id }), 0);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                paymentId: payment._id,
                type: ledgerEntryType_enum_1.LedgerEntryType.COMMISSION,
            }), 0);
            const audit = await auditLog_model_1.AuditLog.findOne({
                action: "BOOKING_WALLET_RESERVATION_RELEASED",
                entityId: reservation._id,
            }).orFail();
            strict_1.default.equal(audit.actorType, "CREATOR");
            strict_1.default.ok(audit.actorId?.equals(fixture.actors.creatorId));
            strict_1.default.equal(audit.financialContext?.domain, "BOOKING_WALLET");
        }
        finally {
            await server.close();
        }
    });
};
exports.registerBookingWalletReleaseRejectionTests = registerBookingWalletReleaseRejectionTests;
