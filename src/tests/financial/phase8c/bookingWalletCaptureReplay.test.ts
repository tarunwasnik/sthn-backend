import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditLog } from "../../../models/auditLog.model";
import { BookingFundReservation } from "../../../models/bookingFundReservation.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Payment } from "../../../models/payment.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import { AuditAction } from "../../../enums/financial/auditAction.enum";
import { BookingWalletCaptureCause } from "../../../enums/financial/bookingWalletCaptureCause.enum";
import { LedgerSource } from "../../../enums/financial/ledgerSource.enum";
import { bookingWalletReservationCaptureService } from "../../../services/financial/bookingWalletReservationCapture.service";
import {
  createAcceptedWalletBooking,
  postCreatorCompletion,
  startCaptureHttpServer,
} from "./fixtures/bookingWalletCaptureFixtures";

export const registerBookingWalletCaptureReplayTests = () => {
  test("phase8c repeated Creator completion validates and returns the authoritative capture", async () => {
    const server = await startCaptureHttpServer();
    try {
      const { booking, creatorToken, fixture } = await createAcceptedWalletBooking(
        server.baseUrl,
        { walletAmount: 1_000, slotAmounts: [400] },
      );
      const first = await postCreatorCompletion(server.baseUrl, booking._id.toString(), creatorToken);
      const reservationBefore = await BookingFundReservation.findOne({ bookingId: booking._id })
        .select("+captureKey +captureTransactionId +captureLedgerEntryIds")
        .orFail();
      const paymentBefore = await Payment.findById(booking.paymentId).orFail();
      const second = await postCreatorCompletion(server.baseUrl, booking._id.toString(), creatorToken);
      const validated = await bookingWalletReservationCaptureService.validateReplay({
        bookingId: booking._id,
        cause: BookingWalletCaptureCause.CREATOR_COMPLETED,
      });
      assert.equal(first.status, 200, JSON.stringify(first.body));
      assert.equal(second.status, 200, JSON.stringify(second.body));
      assert.equal(first.body.replay, false);
      assert.equal(second.body.replay, true);
      assert.equal(validated.replay, true);
      assert.equal(second.body.reservation.captureReference, first.body.reservation.captureReference);
      const reservationAfter = await BookingFundReservation.findOne({ bookingId: booking._id })
        .select("+captureKey +captureTransactionId +captureLedgerEntryIds")
        .orFail();
      const paymentAfter = await Payment.findById(booking.paymentId).orFail();
      assert.equal(reservationAfter.captureKey, reservationBefore.captureKey);
      assert.equal(reservationAfter.captureTransactionId, reservationBefore.captureTransactionId);
      assert.deepEqual(reservationAfter.captureLedgerEntryIds, reservationBefore.captureLedgerEntryIds);
      assert.equal(reservationAfter.capturedAt?.getTime(), reservationBefore.capturedAt?.getTime());
      assert.equal(paymentAfter.capturedAt?.getTime(), paymentBefore.capturedAt?.getTime());
      assert.equal(await LedgerEntry.countDocuments({
        bookingId: booking._id,
        source: LedgerSource.BOOKING_WALLET_CAPTURE,
      }), 2);
      assert.equal(await WalletProjectionOperation.countDocuments({
        walletId: fixture.actors.wallet._id,
        "deltas.reservedBalance": -420,
      }), 1);
      assert.equal((await Wallet.findById(fixture.actors.wallet._id).orFail()).currentBalance, 580);
      assert.equal(await AuditLog.countDocuments({
        action: AuditAction.BOOKING_WALLET_RESERVATION_CAPTURED,
        "financialContext.bookingReference": first.body.booking.bookingReference,
      }), 1);
    } finally {
      await server.close();
    }
  });
};
