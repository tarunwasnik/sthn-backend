import assert from "node:assert/strict";
import { test } from "node:test";
import { Types } from "mongoose";

import { Booking } from "../../../models/booking.model";
import { BookingFundReservation } from "../../../models/bookingFundReservation.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Payment } from "../../../models/payment.model";
import { Slot } from "../../../models/slot.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import {
  BookingTerminationActorType,
  BookingTerminationType,
} from "../../../enums/booking/bookingTerminationType.enum";
import { BookingFundReservationStatus } from "../../../enums/financial/bookingFundReservationStatus.enum";
import { LedgerSource } from "../../../enums/financial/ledgerSource.enum";
import { PaymentMethod } from "../../../enums/financial/paymentMethod.enum";
import { PaymentStatus } from "../../../enums/financial/paymentStatus.enum";
import { BookingWalletReservationReleaseError } from "../../../errors/financial/BookingWalletReservationReleaseError";
import { bookingFinancialTerminationService } from "../../../services/financial/bookingFinancialTermination.service";
import { walletProjectionService } from "../../../services/wallet/walletProjection.service";
import {
  createActiveWalletBooking,
  startReleaseHttpServer,
} from "./fixtures/bookingWalletReleaseFixtures";

const reject = (bookingId: string, creatorId: string) =>
  bookingFinancialTerminationService.terminateBookingFinancially({
    bookingId,
    actorType: BookingTerminationActorType.CREATOR,
    actorId: creatorId,
    terminationType: BookingTerminationType.CREATOR_REJECTED,
  });

const expectReleaseError = async (
  operation: Promise<unknown>,
  codes: string[],
) => {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof BookingWalletReservationReleaseError);
    assert.ok(codes.includes(error.code), `Unexpected release error: ${error.code}`);
    return true;
  });
};

const assertNoReleaseMutation = async (
  bookingId: string,
  paymentId: Types.ObjectId,
  slotIds: Types.ObjectId[],
) => {
  const [booking, payment, reservation, slots] = await Promise.all([
    Booking.findById(bookingId).orFail(),
    Payment.findById(paymentId).orFail(),
    BookingFundReservation.findOne({ bookingId }).orFail(),
    Slot.find({ _id: { $in: slotIds } }),
  ]);
  assert.equal(booking.status, "REQUESTED");
  assert.equal(payment.status, PaymentStatus.AUTHORIZED);
  assert.equal(reservation.status, BookingFundReservationStatus.ACTIVE);
  assert.ok(slots.every((slot) => slot.status === "LOCKED"));
  assert.equal(await LedgerEntry.countDocuments({
    bookingId,
    source: LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE,
  }), 0);
  assert.equal(await WalletProjectionOperation.countDocuments({
    "deltas.reservedBalance": { $lt: 0 },
  }), 0);
};

export const registerBookingWalletReleaseFailureTests = () => {
  test("phase8b insufficient reserved balance fails closed and rolls back lifecycle changes", async () => {
    const server = await startReleaseHttpServer();
    try {
      const { fixture, booking } = await createActiveWalletBooking(
        server.baseUrl,
        { walletAmount: 1_000, slotAmounts: [400] },
      );
      await Wallet.updateOne(
        { _id: fixture.actors.wallet._id },
        { $set: { availableBalance: 900, reservedBalance: 100 } },
      );
      await expectReleaseError(
        reject(booking._id.toString(), fixture.actors.creatorId.toString()),
        ["BOOKING_WALLET_RELEASE_INSUFFICIENT_RESERVED_BALANCE"],
      );
      await assertNoReleaseMutation(
        booking._id.toString(),
        booking.paymentId as Types.ObjectId,
        booking.slotIds,
      );
      const wallet = await Wallet.findById(fixture.actors.wallet._id).orFail();
      assert.equal(wallet.availableBalance, 900);
      assert.equal(wallet.reservedBalance, 100);
      assert.equal(wallet.currentBalance, 1_000);
    } finally {
      await server.close();
    }
  });

  test("phase8b CAPTURED reservation and Payment can never be released", async () => {
    const server = await startReleaseHttpServer();
    try {
      const { fixture, booking } = await createActiveWalletBooking(
        server.baseUrl,
        { walletAmount: 1_000, slotAmounts: [400] },
      );
      await BookingFundReservation.updateOne(
        { bookingId: booking._id },
        { $set: { status: BookingFundReservationStatus.CAPTURED, capturedAt: new Date() } },
      );
      await Payment.updateOne(
        { _id: booking.paymentId },
        { $set: { status: PaymentStatus.CAPTURED } },
      );
      await expectReleaseError(
        reject(booking._id.toString(), fixture.actors.creatorId.toString()),
        ["BOOKING_WALLET_RELEASE_ALREADY_CAPTURED"],
      );
      const [persistedBooking, reservation, payment, slots] = await Promise.all([
        Booking.findById(booking._id).orFail(),
        BookingFundReservation.findOne({ bookingId: booking._id }).orFail(),
        Payment.findById(booking.paymentId).orFail(),
        Slot.find({ _id: { $in: booking.slotIds } }),
      ]);
      assert.equal(persistedBooking.status, "REQUESTED");
      assert.equal(reservation.status, BookingFundReservationStatus.CAPTURED);
      assert.equal(payment.status, PaymentStatus.CAPTURED);
      assert.ok(slots.every((slot) => slot.status === "LOCKED"));
      assert.equal(await LedgerEntry.countDocuments({
        bookingId: booking._id,
        source: LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE,
      }), 0);
    } finally {
      await server.close();
    }
  });

  test("phase8b projection failure after slot release rolls back every transactional record", async () => {
    const server = await startReleaseHttpServer();
    const original = walletProjectionService.applyProjectionMutation.bind(walletProjectionService);
    try {
      const { fixture, booking } = await createActiveWalletBooking(
        server.baseUrl,
        { walletAmount: 1_000, slotAmounts: [400] },
      );
      walletProjectionService.applyProjectionMutation = async () => {
        throw new Error("controlled Phase 8B projection failure");
      };
      await expectReleaseError(
        reject(booking._id.toString(), fixture.actors.creatorId.toString()),
        ["BOOKING_WALLET_RELEASE_PROJECTION_CONFLICT"],
      );
      await assertNoReleaseMutation(
        booking._id.toString(),
        booking.paymentId as Types.ObjectId,
        booking.slotIds,
      );
      const wallet = await Wallet.findById(fixture.actors.wallet._id).orFail();
      assert.equal(wallet.availableBalance, 580);
      assert.equal(wallet.reservedBalance, 420);
    } finally {
      walletProjectionService.applyProjectionMutation = original;
      await server.close();
    }
  });

  const conflictCases: Array<{
    name: string;
    mutate: (bookingId: string, paymentId: Types.ObjectId) => Promise<unknown>;
    codes: string[];
  }> = [
    {
      name: "amount",
      mutate: (bookingId) => Booking.collection.updateOne(
        { _id: new Types.ObjectId(bookingId) },
        { $set: { totalAmount: 421 } },
      ),
      codes: ["BOOKING_WALLET_RELEASE_AMOUNT_CONFLICT"],
    },
    {
      name: "currency",
      mutate: (_bookingId, paymentId) => Payment.collection.updateOne(
        { _id: paymentId as Types.ObjectId },
        { $set: { currency: "USD" } },
      ),
      codes: ["BOOKING_WALLET_RELEASE_CURRENCY_CONFLICT"],
    },
    {
      name: "payment method",
      mutate: (_bookingId, paymentId) => Payment.collection.updateOne(
        { _id: paymentId as Types.ObjectId },
        { $set: { method: PaymentMethod.INTERNAL } },
      ),
      codes: ["BOOKING_WALLET_RELEASE_PAYMENT_METHOD_CONFLICT"],
    },
    {
      name: "reservation Payment link",
      mutate: (bookingId) => BookingFundReservation.collection.updateOne(
        { bookingId: new Types.ObjectId(bookingId) },
        { $set: { paymentId: new Types.ObjectId() } },
      ),
      codes: ["BOOKING_WALLET_RELEASE_IDENTITY_CONFLICT"],
    },
    {
      name: "Payment reservation link",
      mutate: (_bookingId, paymentId) => Payment.collection.updateOne(
        { _id: paymentId },
        { $set: { reservationId: new Types.ObjectId() } },
      ),
      codes: ["BOOKING_WALLET_RELEASE_IDENTITY_CONFLICT"],
    },
    {
      name: "User identity",
      mutate: (bookingId) => BookingFundReservation.collection.updateOne(
        { bookingId: new Types.ObjectId(bookingId) },
        { $set: { userId: new Types.ObjectId() } },
      ),
      codes: ["BOOKING_WALLET_RELEASE_IDENTITY_CONFLICT"],
    },
    {
      name: "Wallet identity",
      mutate: (bookingId) => BookingFundReservation.collection.updateOne(
        { bookingId: new Types.ObjectId(bookingId) },
        { $set: { walletId: new Types.ObjectId() } },
      ),
      codes: ["BOOKING_WALLET_RELEASE_IDENTITY_CONFLICT"],
    },
    {
      name: "Creator identity",
      mutate: (bookingId) => BookingFundReservation.collection.updateOne(
        { bookingId: new Types.ObjectId(bookingId) },
        { $set: { creatorId: new Types.ObjectId() } },
      ),
      codes: ["BOOKING_WALLET_RELEASE_IDENTITY_CONFLICT"],
    },
    {
      name: "service identity",
      mutate: (bookingId) => BookingFundReservation.collection.updateOne(
        { bookingId: new Types.ObjectId(bookingId) },
        { $set: { serviceId: new Types.ObjectId() } },
      ),
      codes: ["BOOKING_WALLET_RELEASE_IDENTITY_CONFLICT"],
    },
    {
      name: "authorization transaction",
      mutate: (bookingId) => BookingFundReservation.collection.updateOne(
        { bookingId: new Types.ObjectId(bookingId) },
        { $unset: { ledgerTransactionId: "" } },
      ),
      codes: ["BOOKING_WALLET_RELEASE_INTEGRITY_ERROR"],
    },
    {
      name: "partial release transaction",
      mutate: (bookingId) => BookingFundReservation.collection.updateOne(
        { bookingId: new Types.ObjectId(bookingId) },
        { $set: { releaseTransactionId: "corrupt-release-transaction" } },
      ),
      codes: ["BOOKING_WALLET_RELEASE_INTEGRITY_ERROR"],
    },
    {
      name: "partial release cause",
      mutate: (bookingId) => BookingFundReservation.collection.updateOne(
        { bookingId: new Types.ObjectId(bookingId) },
        { $set: { releaseCause: "REQUEST_EXPIRED" } },
      ),
      codes: ["BOOKING_WALLET_RELEASE_INTEGRITY_ERROR"],
    },
    {
      name: "terminal Payment with ACTIVE reservation",
      mutate: (_bookingId, paymentId) => Payment.collection.updateOne(
        { _id: paymentId },
        { $set: { status: PaymentStatus.CANCELLED } },
      ),
      codes: ["BOOKING_WALLET_RELEASE_INVALID_PAYMENT_STATUS"],
    },
  ];

  for (const conflictCase of conflictCases) {
    test(`phase8b ${conflictCase.name} identity conflict fails closed`, async () => {
      const server = await startReleaseHttpServer();
      try {
        const { fixture, booking } = await createActiveWalletBooking(
          server.baseUrl,
          { walletAmount: 1_000, slotAmounts: [400] },
        );
        await conflictCase.mutate(
          booking._id.toString(),
          booking.paymentId as Types.ObjectId,
        );
        await expectReleaseError(
          reject(booking._id.toString(), fixture.actors.creatorId.toString()),
          conflictCase.codes,
        );
        const [persistedBooking, reservation, slots] = await Promise.all([
          Booking.findById(booking._id).orFail(),
          BookingFundReservation.findOne({ bookingId: booking._id }).orFail(),
          Slot.find({ _id: { $in: booking.slotIds } }),
        ]);
        assert.equal(persistedBooking.status, "REQUESTED");
        assert.equal(reservation.status, BookingFundReservationStatus.ACTIVE);
        assert.ok(slots.every((slot) => slot.status === "LOCKED"));
        assert.equal(await LedgerEntry.countDocuments({
          bookingId: booking._id,
          source: LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE,
        }), 0);
      } finally {
        await server.close();
      }
    });
  }
};
