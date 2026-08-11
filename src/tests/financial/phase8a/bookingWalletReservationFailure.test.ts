import assert from "node:assert/strict";
import { test } from "node:test";

import { Booking } from "../../../models/booking.model";
import { BookingFundReservation } from "../../../models/bookingFundReservation.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Payment } from "../../../models/payment.model";
import { Slot } from "../../../models/slot.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import { LedgerSource } from "../../../enums/financial/ledgerSource.enum";
import { walletProjectionService } from "../../../services/wallet/walletProjection.service";
import {
  createBookingWalletFixture,
  postWalletBooking,
  startBookingHttpServer,
} from "./fixtures/bookingWalletFixtures";

const assertNoBookingEffect = async () => {
  assert.equal(await Booking.countDocuments(), 0);
  assert.equal(await Payment.countDocuments(), 0);
  assert.equal(await BookingFundReservation.countDocuments(), 0);
  assert.equal(await LedgerEntry.countDocuments({
    source: LedgerSource.BOOKING_WALLET_AUTHORIZATION,
  }), 0);
  assert.equal(await WalletProjectionOperation.countDocuments({
    "deltas.reservedBalance": { $gt: 0 },
  }), 0);
};

export const registerBookingWalletReservationFailureTests = () => {
  test("phase8a balance: exact available balance succeeds and reaches zero", async () => {
    const fixture = await createBookingWalletFixture({ walletAmount: 420, slotAmounts: [400] });
    const server = await startBookingHttpServer();
    try {
      const response = await postWalletBooking(server.baseUrl, fixture, "phase8a-exact");
      assert.equal(response.status, 201, JSON.stringify(response.body));
      const wallet = await Wallet.findById(fixture.actors.wallet._id).orFail();
      assert.equal(wallet.availableBalance, 0);
      assert.equal(wallet.reservedBalance, 420);
      assert.equal(wallet.currentBalance, 420);
    } finally {
      await server.close();
    }
  });

  test("phase8a balance: below-amount available balance fails with zero effects", async () => {
    const fixture = await createBookingWalletFixture({ walletAmount: 399, slotAmounts: [400] });
    const server = await startBookingHttpServer();
    try {
      const response = await postWalletBooking(server.baseUrl, fixture, "phase8a-insufficient");
      assert.equal(response.status, 409, JSON.stringify(response.body));
      assert.equal(
        response.body.code,
        "BOOKING_WALLET_RESERVATION_INSUFFICIENT_AVAILABLE_BALANCE",
      );
      await assertNoBookingEffect();
      assert.equal((await Slot.findById(fixture.slotIds[0]).orFail()).status, "AVAILABLE");
      const wallet = await Wallet.findById(fixture.actors.wallet._id).orFail();
      assert.equal(wallet.availableBalance, 399);
      assert.equal(wallet.reservedBalance, 0);
    } finally {
      await server.close();
    }
  });

  test("phase8a balance: reserved and locked value is never spendable", async () => {
    const fixture = await createBookingWalletFixture({ walletAmount: 500, slotAmounts: [150] });
    await Wallet.updateOne(
      { _id: fixture.actors.wallet._id },
      {
        $set: {
          availableBalance: 100,
          reservedBalance: 200,
          lockedBalance: 200,
          currentBalance: 500,
        },
      },
    );
    const server = await startBookingHttpServer();
    try {
      const response = await postWalletBooking(server.baseUrl, fixture, "phase8a-nonspendable");
      assert.equal(response.status, 409, JSON.stringify(response.body));
      await assertNoBookingEffect();
      const wallet = await Wallet.findById(fixture.actors.wallet._id).orFail();
      assert.equal(wallet.availableBalance, 100);
      assert.equal(wallet.reservedBalance, 200);
      assert.equal(wallet.lockedBalance, 200);
    } finally {
      await server.close();
    }
  });

  test("phase8a currency: server booking currency mismatch fails without conversion", async () => {
    const fixture = await createBookingWalletFixture({
      walletAmount: 500,
      slotAmounts: [200],
      currency: "USD",
    });
    const server = await startBookingHttpServer();
    try {
      const response = await postWalletBooking(server.baseUrl, fixture, "phase8a-currency");
      assert.equal(response.status, 409, JSON.stringify(response.body));
      assert.equal(
        response.body.code,
        "BOOKING_WALLET_RESERVATION_CURRENCY_CONFLICT",
      );
      await assertNoBookingEffect();
    } finally {
      await server.close();
    }
  });

  test("phase8a authority: client financial overrides are rejected before mutation", async () => {
    const fixture = await createBookingWalletFixture({ walletAmount: 500, slotAmounts: [200] });
    const server = await startBookingHttpServer();
    try {
      const response = await postWalletBooking(
        server.baseUrl,
        fixture,
        "phase8a-client-override",
        { amount: 1, currency: "USD", walletId: fixture.actors.wallet._id.toString() },
      );
      assert.equal(response.status, 422);
      await assertNoBookingEffect();
    } finally {
      await server.close();
    }
  });

  test("phase8a rollback: a projection-stage failure rolls back slots, booking, payment, reservation, and Ledger", async () => {
    const fixture = await createBookingWalletFixture({ walletAmount: 500, slotAmounts: [200] });
    const original = walletProjectionService.applyProjectionMutation;
    (walletProjectionService as any).applyProjectionMutation = async () => {
      throw new Error("controlled projection failure");
    };
    const server = await startBookingHttpServer();
    try {
      const response = await postWalletBooking(server.baseUrl, fixture, "phase8a-rollback");
      assert.equal(response.status, 409, JSON.stringify(response.body));
      assert.equal(
        response.body.code,
        "BOOKING_WALLET_RESERVATION_PROJECTION_CONFLICT",
      );
      await assertNoBookingEffect();
      assert.equal((await Slot.findById(fixture.slotIds[0]).orFail()).status, "AVAILABLE");
      const wallet = await Wallet.findById(fixture.actors.wallet._id).orFail();
      assert.equal(wallet.availableBalance, 500);
      assert.equal(wallet.reservedBalance, 0);
    } finally {
      (walletProjectionService as any).applyProjectionMutation = original;
      await server.close();
    }
  });

  test("phase8a slot conflict: unavailable slot leaves no booking or financial effect", async () => {
    const fixture = await createBookingWalletFixture({ walletAmount: 500, slotAmounts: [200] });
    await Slot.updateOne({ _id: fixture.slotIds[0] }, { $set: { status: "CANCELLED" } });
    const server = await startBookingHttpServer();
    try {
      const response = await postWalletBooking(server.baseUrl, fixture, "phase8a-slot-conflict");
      assert.equal(response.status, 409);
      assert.equal(
        response.body.code,
        "BOOKING_WALLET_RESERVATION_BOOKING_CONFLICT",
      );
      await assertNoBookingEffect();
    } finally {
      await server.close();
    }
  });
};
