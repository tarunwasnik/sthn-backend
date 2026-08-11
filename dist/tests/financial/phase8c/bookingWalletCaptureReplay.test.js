"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingWalletCaptureReplayTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const auditLog_model_1 = require("../../../models/auditLog.model");
const bookingFundReservation_model_1 = require("../../../models/bookingFundReservation.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const payment_model_1 = require("../../../models/payment.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const auditAction_enum_1 = require("../../../enums/financial/auditAction.enum");
const bookingWalletCaptureCause_enum_1 = require("../../../enums/financial/bookingWalletCaptureCause.enum");
const ledgerSource_enum_1 = require("../../../enums/financial/ledgerSource.enum");
const bookingWalletReservationCapture_service_1 = require("../../../services/financial/bookingWalletReservationCapture.service");
const bookingWalletCaptureFixtures_1 = require("./fixtures/bookingWalletCaptureFixtures");
const registerBookingWalletCaptureReplayTests = () => {
    (0, node_test_1.test)("phase8c repeated Creator completion validates and returns the authoritative capture", async () => {
        const server = await (0, bookingWalletCaptureFixtures_1.startCaptureHttpServer)();
        try {
            const { booking, creatorToken, fixture } = await (0, bookingWalletCaptureFixtures_1.createAcceptedWalletBooking)(server.baseUrl, { walletAmount: 1000, slotAmounts: [400] });
            const first = await (0, bookingWalletCaptureFixtures_1.postCreatorCompletion)(server.baseUrl, booking._id.toString(), creatorToken);
            const reservationBefore = await bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId: booking._id })
                .select("+captureKey +captureTransactionId +captureLedgerEntryIds")
                .orFail();
            const paymentBefore = await payment_model_1.Payment.findById(booking.paymentId).orFail();
            const second = await (0, bookingWalletCaptureFixtures_1.postCreatorCompletion)(server.baseUrl, booking._id.toString(), creatorToken);
            const validated = await bookingWalletReservationCapture_service_1.bookingWalletReservationCaptureService.validateReplay({
                bookingId: booking._id,
                cause: bookingWalletCaptureCause_enum_1.BookingWalletCaptureCause.CREATOR_COMPLETED,
            });
            strict_1.default.equal(first.status, 200, JSON.stringify(first.body));
            strict_1.default.equal(second.status, 200, JSON.stringify(second.body));
            strict_1.default.equal(first.body.replay, false);
            strict_1.default.equal(second.body.replay, true);
            strict_1.default.equal(validated.replay, true);
            strict_1.default.equal(second.body.reservation.captureReference, first.body.reservation.captureReference);
            const reservationAfter = await bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId: booking._id })
                .select("+captureKey +captureTransactionId +captureLedgerEntryIds")
                .orFail();
            const paymentAfter = await payment_model_1.Payment.findById(booking.paymentId).orFail();
            strict_1.default.equal(reservationAfter.captureKey, reservationBefore.captureKey);
            strict_1.default.equal(reservationAfter.captureTransactionId, reservationBefore.captureTransactionId);
            strict_1.default.deepEqual(reservationAfter.captureLedgerEntryIds, reservationBefore.captureLedgerEntryIds);
            strict_1.default.equal(reservationAfter.capturedAt?.getTime(), reservationBefore.capturedAt?.getTime());
            strict_1.default.equal(paymentAfter.capturedAt?.getTime(), paymentBefore.capturedAt?.getTime());
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                bookingId: booking._id,
                source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_CAPTURE,
            }), 2);
            strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({
                walletId: fixture.actors.wallet._id,
                "deltas.reservedBalance": -420,
            }), 1);
            strict_1.default.equal((await wallet_model_1.Wallet.findById(fixture.actors.wallet._id).orFail()).currentBalance, 580);
            strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({
                action: auditAction_enum_1.AuditAction.BOOKING_WALLET_RESERVATION_CAPTURED,
                "financialContext.bookingReference": first.body.booking.bookingReference,
            }), 1);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerBookingWalletCaptureReplayTests = registerBookingWalletCaptureReplayTests;
