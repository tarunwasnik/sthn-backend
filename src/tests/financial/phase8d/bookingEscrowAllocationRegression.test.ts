import assert from "node:assert/strict";
import { test } from "node:test";
import jwt from "jsonwebtoken";

import { Booking } from "../../../models/booking.model";
import { BookingEscrowAllocation } from "../../../models/bookingEscrowAllocation.model";
import { BookingFundReservation } from "../../../models/bookingFundReservation.model";
import { InternalTopUpFunding } from "../../../models/internalTopUpFunding.model";
import InternalPaymentModel from "../../../models/internalProvider/internalPayment.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Payment } from "../../../models/payment.model";
import { Wallet } from "../../../models/wallet.model";
import { PaymentMethod } from "../../../enums/financial/paymentMethod.enum";
import { PaymentStatus } from "../../../enums/financial/paymentStatus.enum";
import { LedgerSource } from "../../../enums/financial/ledgerSource.enum";
import { bookingEscrowAllocationService } from "../../../services/financial/bookingEscrowAllocation.service";
import {
  createBookingWalletFixture,
} from "../phase8a/fixtures/bookingWalletFixtures";
import {
  createActors,
  createFundedTopUp,
} from "../phase7h/fixtures/topUpFixtures";
import { postCreatorDecision } from "../phase8b/fixtures/bookingWalletReleaseFixtures";
import {
  enableBookingCompletion,
  postCreatorCompletion,
} from "../phase8c/fixtures/bookingWalletCaptureFixtures";
import {
  createCapturedWalletBooking,
  startAllocationHttpServer,
} from "./fixtures/bookingEscrowAllocationFixtures";

const expectCode = async (operation: Promise<unknown>, code: string) => {
  await assert.rejects(operation, (error: any) => {
    assert.equal(error?.code, code, String(error));
    return true;
  });
};

export const registerBookingEscrowAllocationRegressionTests = () => {
  test("phase8d Phase 8C capture remains complete before explicit allocation", async () => {
    const server = await startAllocationHttpServer();
    try {
      const captured = await createCapturedWalletBooking(server.baseUrl);
      assert.equal(captured.booking.status, "COMPLETED");
      assert.equal(captured.payment.status, PaymentStatus.CAPTURED);
      assert.equal(captured.reservation.status, "CAPTURED");
      assert.equal(await BookingEscrowAllocation.countDocuments(), 0);
      assert.equal(await LedgerEntry.countDocuments({
        bookingId: captured.booking._id,
        source: LedgerSource.BOOKING_ESCROW_ALLOCATION,
      }), 0);
    } finally {
      await server.close();
    }
  });

  test("phase8d INTERNAL-provider booking remains outside escrow allocation", async () => {
    const server = await startAllocationHttpServer();
    try {
      const fixture = await createBookingWalletFixture({
        walletAmount: 0,
        slotAmounts: [1_000],
      });
      const response = await fetch(`${server.baseUrl}/api/v1/bookings/request`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${fixture.token}`,
        },
        body: JSON.stringify({
          serviceId: fixture.serviceId.toString(),
          slotIds: fixture.slotIds.map(String),
          paymentMethod: PaymentMethod.INTERNAL,
        }),
      });
      const body = await response.json() as Record<string, any>;
      assert.equal(response.status, 201, JSON.stringify(body));
      const booking = await Booking.findOne({
        bookingReference: body.booking.bookingReference,
      }).orFail();
      const creatorToken = jwt.sign(
        { id: fixture.actors.creatorId.toString(), role: "creator" },
        process.env.JWT_SECRET!,
      );
      const accepted = await postCreatorDecision(
        server.baseUrl,
        booking._id.toString(),
        creatorToken,
        "ACCEPT",
      );
      assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
      await enableBookingCompletion(fixture.actors.adminId.toString());
      const completed = await postCreatorCompletion(
        server.baseUrl,
        booking._id.toString(),
        creatorToken,
      );
      assert.equal(completed.status, 200, JSON.stringify(completed.body));
      const payment = await Payment.findById(booking.paymentId).orFail();
      assert.equal(payment.method, PaymentMethod.INTERNAL);
      assert.equal(payment.status, PaymentStatus.CAPTURED);
      assert.equal(await InternalPaymentModel.countDocuments({
        paymentId: payment._id,
      }), 1);
      await expectCode(
        bookingEscrowAllocationService.allocate(booking._id.toString()),
        "BOOKING_ESCROW_ALLOCATION_RESERVATION_NOT_FOUND",
      );
      assert.equal(await BookingFundReservation.countDocuments({
        bookingId: booking._id,
      }), 0);
      assert.equal(await BookingEscrowAllocation.countDocuments(), 0);
      assert.equal(await LedgerEntry.countDocuments({
        source: LedgerSource.BOOKING_ESCROW_ALLOCATION,
      }), 0);
    } finally {
      await server.close();
    }
  });

  test("phase8d top-up records cannot be allocated as captured Bookings", async () => {
    const actors = await createActors();
    const { request } = await createFundedTopUp(actors, 1_000);
    const walletBefore = await Wallet.findById(actors.wallet._id).orFail();
    await expectCode(
      bookingEscrowAllocationService.allocate(request._id.toString()),
      "BOOKING_ESCROW_ALLOCATION_BOOKING_NOT_FOUND",
    );
    assert.equal(await InternalTopUpFunding.countDocuments({
      topUpRequestId: request._id,
    }), 1);
    assert.equal(await BookingEscrowAllocation.countDocuments(), 0);
    assert.equal(await LedgerEntry.countDocuments({
      source: LedgerSource.BOOKING_ESCROW_ALLOCATION,
    }), 0);
    const walletAfter = await Wallet.findById(actors.wallet._id).orFail();
    assert.equal(walletAfter.currentBalance, walletBefore.currentBalance);
    assert.equal(walletAfter.projectionVersion, walletBefore.projectionVersion);
  });

  test("phase8d allocation authority indexes exist in MongoDB", async () => {
    const indexes = await BookingEscrowAllocation.collection.indexes();
    for (const field of [
      "allocationReference",
      "allocationKey",
      "bookingId",
      "paymentId",
      "reservationId",
      "escrowLedgerTransaction",
      "allocationLedgerTransaction",
    ]) {
      const index = indexes.find((candidate) => candidate.key[field] === 1);
      assert.ok(index, `${field} index is missing`);
      assert.equal(index.unique, true);
    }
    assert.ok(indexes.find((candidate) =>
      candidate.key.creatorId === 1 && candidate.key.status === 1));
    assert.ok(indexes.find((candidate) =>
      candidate.key.status === 1 && candidate.key.allocatedAt === -1));
  });
};
