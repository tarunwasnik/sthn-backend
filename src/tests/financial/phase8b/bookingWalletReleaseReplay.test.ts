import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditLog } from "../../../models/auditLog.model";
import { BookingFundReservation } from "../../../models/bookingFundReservation.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import { BookingWalletReleaseCause } from "../../../enums/financial/bookingWalletReleaseCause.enum";
import { LedgerSource } from "../../../enums/financial/ledgerSource.enum";
import {
  bookingWalletReservationReleaseService,
} from "../../../services/financial/bookingWalletReservationRelease.service";
import {
  createActiveWalletBooking,
  postCreatorDecision,
  postUserCancellation,
  startReleaseHttpServer,
} from "./fixtures/bookingWalletReleaseFixtures";

const releaseCounts = async (bookingId: string) => ({
  ledger: await LedgerEntry.countDocuments({
    bookingId,
    source: LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE,
  }),
  projection: await WalletProjectionOperation.countDocuments({
    "metadata.bookingId": bookingId,
    "deltas.reservedBalance": { $lt: 0 },
  }),
  audit: await AuditLog.countDocuments({
    action: "BOOKING_WALLET_RESERVATION_RELEASED",
  }),
});

export const registerBookingWalletReleaseReplayTests = () => {
  test("phase8b Creator rejection endpoint and service replay preserve release authority", async () => {
    const server = await startReleaseHttpServer();
    try {
      const { booking, creatorToken } = await createActiveWalletBooking(
        server.baseUrl,
        { walletAmount: 1_000, slotAmounts: [400] },
      );
      const first = await postCreatorDecision(
        server.baseUrl,
        booking._id.toString(),
        creatorToken,
        "REJECT",
      );
      assert.equal(first.status, 200, JSON.stringify(first.body));
      const persisted = await BookingFundReservation.findOne({ bookingId: booking._id })
        .select("+releaseKey +releaseTransactionId +releaseProjectionOperationReference")
        .orFail();
      const authority = {
        reference: persisted.releaseReference,
        key: persisted.releaseKey,
        transaction: persisted.releaseTransactionId,
        projection: persisted.releaseProjectionOperationReference,
        releasedAt: persisted.releasedAt?.getTime(),
      };

      const second = await postCreatorDecision(
        server.baseUrl,
        booking._id.toString(),
        creatorToken,
        "REJECT",
      );
      assert.equal(second.status, 200, JSON.stringify(second.body));
      assert.equal(second.body.replay, true);
      const serviceReplay = await bookingWalletReservationReleaseService.validateReplay({
        bookingId: booking._id,
        cause: BookingWalletReleaseCause.CREATOR_REJECTED,
      });
      assert.equal(serviceReplay.replay, true);
      assert.equal(serviceReplay.reservation.releaseReference, authority.reference);
      assert.equal(serviceReplay.reservation.releasedAt.getTime(), authority.releasedAt);

      const reloaded = await BookingFundReservation.findOne({ bookingId: booking._id })
        .select("+releaseKey +releaseTransactionId +releaseProjectionOperationReference")
        .orFail();
      assert.deepEqual({
        reference: reloaded.releaseReference,
        key: reloaded.releaseKey,
        transaction: reloaded.releaseTransactionId,
        projection: reloaded.releaseProjectionOperationReference,
        releasedAt: reloaded.releasedAt?.getTime(),
      }, authority);
      assert.deepEqual(await releaseCounts(booking._id.toString()), {
        ledger: 2,
        projection: 0,
        audit: 1,
      });
    } finally {
      await server.close();
    }
  });

  test("phase8b cancellation endpoint replay performs no duplicate financial effect", async () => {
    const server = await startReleaseHttpServer();
    try {
      const { fixture, booking } = await createActiveWalletBooking(
        server.baseUrl,
        { walletAmount: 1_000, slotAmounts: [250] },
      );
      const first = await postUserCancellation(server.baseUrl, booking._id.toString(), fixture);
      const second = await postUserCancellation(server.baseUrl, booking._id.toString(), fixture);
      assert.equal(first.status, 200, JSON.stringify(first.body));
      assert.equal(second.status, 200, JSON.stringify(second.body));
      assert.equal(second.body.replay, true);
      assert.equal(await LedgerEntry.countDocuments({
        bookingId: booking._id,
        source: LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE,
      }), 2);
      assert.equal(await WalletProjectionOperation.countDocuments({
        walletId: fixture.actors.wallet._id,
        "deltas.reservedBalance": -263,
      }), 1);
    } finally {
      await server.close();
    }
  });
};
