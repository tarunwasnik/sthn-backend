"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingWalletCaptureFullFlowTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const auditLog_model_1 = require("../../../models/auditLog.model");
const booking_model_1 = require("../../../models/booking.model");
const bookingFundReservation_model_1 = require("../../../models/bookingFundReservation.model");
const internalPayment_model_1 = __importDefault(require("../../../models/internalProvider/internalPayment.model"));
const internalTopUpFunding_model_1 = require("../../../models/internalTopUpFunding.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const payment_model_1 = require("../../../models/payment.model");
const refund_model_1 = require("../../../models/refund.model");
const settlement_model_1 = require("../../../models/settlement.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const auditAction_enum_1 = require("../../../enums/financial/auditAction.enum");
const bookingWalletCaptureCause_enum_1 = require("../../../enums/financial/bookingWalletCaptureCause.enum");
const bookingFundReservationStatus_enum_1 = require("../../../enums/financial/bookingFundReservationStatus.enum");
const ledgerAccount_enum_1 = require("../../../enums/financial/ledgerAccount.enum");
const ledgerEntryType_enum_1 = require("../../../enums/financial/ledgerEntryType.enum");
const ledgerSource_enum_1 = require("../../../enums/financial/ledgerSource.enum");
const moneyDirection_enum_1 = require("../../../enums/financial/moneyDirection.enum");
const paymentStatus_enum_1 = require("../../../enums/financial/paymentStatus.enum");
const completeBookings_job_1 = require("../../../jobs/completeBookings.job");
const bookingWalletCaptureFixtures_1 = require("./fixtures/bookingWalletCaptureFixtures");
const assertCaptureGraph = async (bookingId, expectedCause, amount = 420) => {
    const booking = await booking_model_1.Booking.findById(bookingId).orFail();
    const [payment, reservation, wallet, entries, projections] = await Promise.all([
        payment_model_1.Payment.findById(booking.paymentId).orFail(),
        bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId }).select("+walletId +captureTransactionId +captureLedgerEntryIds " +
            "+captureProjectionOperationId +captureProjectionOperationReference " +
            "+captureKey +captureFingerprint +capturedById").orFail(),
        wallet_model_1.Wallet.findOne({ userId: booking.userId }).orFail(),
        ledgerEntry_model_1.LedgerEntry.find({ bookingId, source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_CAPTURE }),
        walletProjectionOperation_model_1.WalletProjectionOperation.find({ walletId: { $exists: true }, "deltas.reservedBalance": -amount }),
    ]);
    strict_1.default.equal(booking.status, "COMPLETED");
    strict_1.default.equal(booking.paymentStatus, "PAID");
    strict_1.default.equal(booking.isPayable, false);
    strict_1.default.equal(booking.isPayoutEligible, false);
    strict_1.default.equal(booking.creatorEarningSnapshot, undefined);
    strict_1.default.equal(booking.platformCommissionSnapshot, undefined);
    strict_1.default.ok(booking.completedAt);
    strict_1.default.ok(booking.settlementEligibleAt);
    strict_1.default.equal(booking.completionCause, expectedCause);
    strict_1.default.equal(payment.status, paymentStatus_enum_1.PaymentStatus.CAPTURED);
    strict_1.default.equal(payment.capturedAmount, amount);
    strict_1.default.equal(payment.captureCause, expectedCause);
    strict_1.default.equal(reservation.status, bookingFundReservationStatus_enum_1.BookingFundReservationStatus.CAPTURED);
    strict_1.default.equal(reservation.captureCause, expectedCause);
    strict_1.default.equal(reservation.captureLedgerEntryIds.length, 2);
    strict_1.default.equal(entries.length, 2);
    strict_1.default.equal(new Set(entries.map((entry) => entry.transactionId)).size, 1);
    const debit = entries.find((entry) => entry.account === ledgerAccount_enum_1.LedgerAccount.WALLET_RESERVED);
    const credit = entries.find((entry) => entry.account === ledgerAccount_enum_1.LedgerAccount.PLATFORM_ESCROW);
    strict_1.default.equal(debit?.direction, moneyDirection_enum_1.MoneyDirection.DEBIT);
    strict_1.default.equal(debit?.walletId?.toString(), wallet._id.toString());
    strict_1.default.equal(credit?.direction, moneyDirection_enum_1.MoneyDirection.CREDIT);
    strict_1.default.equal(credit?.walletId, undefined);
    strict_1.default.ok(entries.every((entry) => entry.type === ledgerEntryType_enum_1.LedgerEntryType.BOOKING_FUNDS_CAPTURED &&
        entry.amount === amount));
    strict_1.default.equal(projections.length, 1);
    strict_1.default.equal(projections[0].deltas.availableBalance, 0);
    strict_1.default.equal(projections[0].deltas.reservedBalance, -amount);
    strict_1.default.equal(projections[0].deltas.lockedBalance, 0);
    strict_1.default.equal(wallet.availableBalance, 580);
    strict_1.default.equal(wallet.reservedBalance, 0);
    strict_1.default.equal(wallet.lockedBalance, 0);
    strict_1.default.equal(wallet.currentBalance, 580);
    strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
        bookingId,
        source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE,
    }), 0);
    strict_1.default.equal(await wallet_model_1.Wallet.countDocuments({ userId: booking.creatorId }), 0);
    strict_1.default.equal(await internalPayment_model_1.default.countDocuments({ paymentId: payment._id }), 0);
    strict_1.default.equal(await settlement_model_1.Settlement.countDocuments({ paymentId: payment._id }), 0);
    strict_1.default.equal(await refund_model_1.Refund.countDocuments({ paymentId: payment._id }), 0);
    strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
        bookingId,
        type: ledgerEntryType_enum_1.LedgerEntryType.COMMISSION,
    }), 0);
    return { booking, payment, reservation, wallet, entries, projection: projections[0] };
};
const registerBookingWalletCaptureFullFlowTests = () => {
    (0, node_test_1.test)("phase8c full flow: Creator completion captures reserved Wallet funds into platform escrow", async () => {
        const server = await (0, bookingWalletCaptureFixtures_1.startCaptureHttpServer)();
        try {
            const { booking, creatorToken, fixture } = await (0, bookingWalletCaptureFixtures_1.createAcceptedWalletBooking)(server.baseUrl, { walletAmount: 1000, slotAmounts: [400] });
            const before = await wallet_model_1.Wallet.findById(fixture.actors.wallet._id).orFail();
            const topUpFundingCount = await internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments();
            strict_1.default.deepEqual([before.availableBalance, before.reservedBalance, before.lockedBalance, before.currentBalance], [580, 420, 0, 1000]);
            const response = await (0, bookingWalletCaptureFixtures_1.postCreatorCompletion)(server.baseUrl, booking._id.toString(), creatorToken);
            strict_1.default.equal(response.status, 200, JSON.stringify(response.body));
            strict_1.default.equal(response.body.replay, false);
            strict_1.default.equal(response.body.booking.status, "COMPLETED");
            strict_1.default.equal(response.body.payment.status, paymentStatus_enum_1.PaymentStatus.CAPTURED);
            strict_1.default.equal(response.body.reservation.status, bookingFundReservationStatus_enum_1.BookingFundReservationStatus.CAPTURED);
            strict_1.default.equal("_id" in response.body.booking, false);
            strict_1.default.equal("walletId" in response.body.reservation, false);
            strict_1.default.equal("captureLedgerEntryIds" in response.body.reservation, false);
            await assertCaptureGraph(booking._id.toString(), bookingWalletCaptureCause_enum_1.BookingWalletCaptureCause.CREATOR_COMPLETED);
            strict_1.default.equal(await internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments(), topUpFundingCount);
            const audit = await auditLog_model_1.AuditLog.findOne({
                action: auditAction_enum_1.AuditAction.BOOKING_WALLET_RESERVATION_CAPTURED,
                "financialContext.bookingReference": booking.bookingReference,
            }).orFail();
            strict_1.default.equal(audit.actorType, "CREATOR");
            strict_1.default.equal(audit.actorId?.toString(), fixture.actors.creatorId.toString());
            strict_1.default.equal(audit.financialContext?.domain, "BOOKING_WALLET");
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8c automatic completion captures through the same orchestrator and replays safely", async () => {
        const server = await (0, bookingWalletCaptureFixtures_1.startCaptureHttpServer)();
        try {
            const { booking } = await (0, bookingWalletCaptureFixtures_1.createAcceptedWalletBooking)(server.baseUrl, { walletAmount: 1000, slotAmounts: [400] });
            await (0, bookingWalletCaptureFixtures_1.makeBookingAutoCompletionEligible)(booking._id.toString());
            const first = await (0, completeBookings_job_1.completeBookingsJob)();
            const second = await (0, completeBookings_job_1.completeBookingsJob)();
            strict_1.default.equal(first.completed, 1);
            strict_1.default.equal(second.completed, 0);
            const graph = await assertCaptureGraph(booking._id.toString(), bookingWalletCaptureCause_enum_1.BookingWalletCaptureCause.AUTO_COMPLETED);
            strict_1.default.equal(graph.booking.completedByType, bookingWalletCaptureCause_enum_1.BookingCompletionActorType.SYSTEM);
            strict_1.default.equal(graph.reservation.capturedByType, bookingWalletCaptureCause_enum_1.BookingCompletionActorType.SYSTEM);
            strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({
                action: auditAction_enum_1.AuditAction.BOOKING_WALLET_RESERVATION_CAPTURED,
                "financialContext.bookingReference": graph.booking.bookingReference,
            }), 1);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerBookingWalletCaptureFullFlowTests = registerBookingWalletCaptureFullFlowTests;
