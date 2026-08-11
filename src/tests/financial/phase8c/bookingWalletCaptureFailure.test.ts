import assert from "node:assert/strict";
import { test } from "node:test";
import { Types } from "mongoose";

import { Booking } from "../../../models/booking.model";
import { AuditLog } from "../../../models/auditLog.model";
import { BookingFundReservation } from "../../../models/bookingFundReservation.model";
import { Dispute } from "../../../models/dispute.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Payment } from "../../../models/payment.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import { BookingFundReservationStatus } from "../../../enums/financial/bookingFundReservationStatus.enum";
import { LedgerAccount } from "../../../enums/financial/ledgerAccount.enum";
import { LedgerSource } from "../../../enums/financial/ledgerSource.enum";
import { PaymentStatus } from "../../../enums/financial/paymentStatus.enum";
import { PaymentMethod } from "../../../enums/financial/paymentMethod.enum";
import { walletProjectionService } from "../../../services/wallet/walletProjection.service";
import { ledgerService } from "../../../services/financial/ledger.service";
import {
  createAcceptedWalletBooking,
  postUserCancellation,
  postCreatorCompletion,
  startCaptureHttpServer,
} from "./fixtures/bookingWalletCaptureFixtures";

const assertUncaptured = async (bookingId: string, walletId: string) => {
  const booking = await Booking.findById(bookingId).orFail();
  const payment = await Payment.findById(booking.paymentId).orFail();
  const reservation = await BookingFundReservation.findOne({ bookingId }).orFail();
  const wallet = await Wallet.findById(walletId).orFail();
  assert.equal(booking.status, "CONFIRMED");
  assert.equal(payment.status, PaymentStatus.AUTHORIZED);
  assert.equal(reservation.status, BookingFundReservationStatus.ACTIVE);
  assert.deepEqual([wallet.availableBalance, wallet.reservedBalance, wallet.currentBalance], [580, 420, 1_000]);
  assert.equal(await LedgerEntry.countDocuments({
    bookingId,
    source: LedgerSource.BOOKING_WALLET_CAPTURE,
  }), 0);
};

export const registerBookingWalletCaptureFailureTests = () => {
  test("phase8c financial lock blocks completion before every capture mutation", async () => {
    const server = await startCaptureHttpServer();
    try {
      const accepted = await createAcceptedWalletBooking(server.baseUrl);
      await Booking.updateOne({ _id: accepted.booking._id }, { $set: { isFinancialLocked: true } });
      const response = await postCreatorCompletion(
        server.baseUrl,
        accepted.booking._id.toString(),
        accepted.creatorToken,
      );
      assert.equal(response.status, 409, JSON.stringify(response.body));
      assert.equal(response.body.code, "BOOKING_WALLET_CAPTURE_FINANCIAL_LOCKED");
      await assertUncaptured(
        accepted.booking._id.toString(),
        accepted.fixture.actors.wallet._id.toString(),
      );
    } finally {
      await server.close();
    }
  });

  test("phase8c OPEN dispute blocks completion before every capture mutation", async () => {
    const server = await startCaptureHttpServer();
    try {
      const accepted = await createAcceptedWalletBooking(server.baseUrl);
      await Dispute.create({
        bookingId: accepted.booking._id,
        raisedBy: accepted.fixture.actors.userId,
        raisedByRole: "USER",
        reason: "Phase 8C controlled OPEN dispute",
        status: "OPEN",
        slaHours: 48,
        escalationLevel: "NONE",
        signals: [],
      });
      const response = await postCreatorCompletion(
        server.baseUrl,
        accepted.booking._id.toString(),
        accepted.creatorToken,
      );
      assert.equal(response.status, 409, JSON.stringify(response.body));
      assert.equal(response.body.code, "BOOKING_WALLET_CAPTURE_DISPUTE_OPEN");
      await assertUncaptured(
        accepted.booking._id.toString(),
        accepted.fixture.actors.wallet._id.toString(),
      );
    } finally {
      await server.close();
    }
  });

  test("phase8c insufficient reserved balance rolls back Booking, Payment, Ledger, and projection", async () => {
    const server = await startCaptureHttpServer();
    try {
      const accepted = await createAcceptedWalletBooking(server.baseUrl);
      await Wallet.collection.updateOne(
        { _id: accepted.fixture.actors.wallet._id },
        { $set: { availableBalance: 900, reservedBalance: 100, currentBalance: 1_000 } },
      );
      const response = await postCreatorCompletion(
        server.baseUrl,
        accepted.booking._id.toString(),
        accepted.creatorToken,
      );
      assert.equal(response.status, 409, JSON.stringify(response.body));
      assert.equal(response.body.code, "BOOKING_WALLET_CAPTURE_INSUFFICIENT_RESERVED_BALANCE");
      const [booking, payment, reservation, wallet] = await Promise.all([
        Booking.findById(accepted.booking._id).orFail(),
        Payment.findById(accepted.booking.paymentId).orFail(),
        BookingFundReservation.findOne({ bookingId: accepted.booking._id }).orFail(),
        Wallet.findById(accepted.fixture.actors.wallet._id).orFail(),
      ]);
      assert.equal(booking.status, "CONFIRMED");
      assert.equal(payment.status, PaymentStatus.AUTHORIZED);
      assert.equal(reservation.status, BookingFundReservationStatus.ACTIVE);
      assert.deepEqual([wallet.availableBalance, wallet.reservedBalance, wallet.currentBalance], [900, 100, 1_000]);
      assert.equal(await LedgerEntry.countDocuments({
        bookingId: booking._id,
        source: LedgerSource.BOOKING_WALLET_CAPTURE,
      }), 0);
      assert.equal(await WalletProjectionOperation.countDocuments({
        walletId: wallet._id,
        "deltas.reservedBalance": -420,
      }), 0);
    } finally {
      await server.close();
    }
  });

  test("phase8c projection interruption rolls back the complete capture transaction", async () => {
    const server = await startCaptureHttpServer();
    const original = walletProjectionService.applyProjectionMutation.bind(walletProjectionService);
    try {
      const accepted = await createAcceptedWalletBooking(server.baseUrl);
      walletProjectionService.applyProjectionMutation = async () => {
        throw new Error("controlled Phase 8C projection interruption");
      };
      const response = await postCreatorCompletion(
        server.baseUrl,
        accepted.booking._id.toString(),
        accepted.creatorToken,
      );
      assert.equal(response.status, 409, JSON.stringify(response.body));
      assert.equal(response.body.code, "BOOKING_WALLET_CAPTURE_PROJECTION_CONFLICT");
      await assertUncaptured(
        accepted.booking._id.toString(),
        accepted.fixture.actors.wallet._id.toString(),
      );
    } finally {
      walletProjectionService.applyProjectionMutation = original;
      await server.close();
    }
  });

  test("phase8c Ledger interruption after the debit attempt rolls back every capture effect", async () => {
    const server = await startCaptureHttpServer();
    const original = ledgerService.createCredit.bind(ledgerService);
    try {
      const accepted = await createAcceptedWalletBooking(server.baseUrl);
      ledgerService.createCredit = async () => {
        throw new Error("controlled Phase 8C Ledger credit interruption");
      };
      const response = await postCreatorCompletion(
        server.baseUrl,
        accepted.booking._id.toString(),
        accepted.creatorToken,
      );
      assert.equal(response.status, 409, JSON.stringify(response.body));
      assert.equal(response.body.code, "BOOKING_WALLET_CAPTURE_LEDGER_CONFLICT");
      await assertUncaptured(
        accepted.booking._id.toString(),
        accepted.fixture.actors.wallet._id.toString(),
      );
    } finally {
      ledgerService.createCredit = original;
      await server.close();
    }
  });

  test("phase8c audit interruption before commit rolls back every capture effect", async () => {
    const server = await startCaptureHttpServer();
    const auditModel = AuditLog as unknown as { create: typeof AuditLog.create };
    const original = auditModel.create;
    try {
      const accepted = await createAcceptedWalletBooking(server.baseUrl);
      auditModel.create = (async () => {
        throw new Error("controlled Phase 8C audit interruption");
      }) as typeof AuditLog.create;
      const response = await postCreatorCompletion(
        server.baseUrl,
        accepted.booking._id.toString(),
        accepted.creatorToken,
      );
      assert.equal(response.status, 409, JSON.stringify(response.body));
      assert.equal(response.body.code, "BOOKING_WALLET_CAPTURE_TRANSACTION_CONFLICT");
      await assertUncaptured(
        accepted.booking._id.toString(),
        accepted.fixture.actors.wallet._id.toString(),
      );
    } finally {
      auditModel.create = original;
      await server.close();
    }
  });

  test("phase8c corrupted captured Ledger direction fails replay closed", async () => {
    const server = await startCaptureHttpServer();
    try {
      const accepted = await createAcceptedWalletBooking(server.baseUrl);
      const first = await postCreatorCompletion(
        server.baseUrl,
        accepted.booking._id.toString(),
        accepted.creatorToken,
      );
      assert.equal(first.status, 200, JSON.stringify(first.body));
      await LedgerEntry.collection.updateOne(
        {
          bookingId: accepted.booking._id,
          source: LedgerSource.BOOKING_WALLET_CAPTURE,
          account: LedgerAccount.WALLET_RESERVED,
        },
        { $set: { direction: "CREDIT" } },
      );
      const replay = await postCreatorCompletion(
        server.baseUrl,
        accepted.booking._id.toString(),
        accepted.creatorToken,
      );
      assert.equal(replay.status, 409, JSON.stringify(replay.body));
      assert.equal(replay.body.code, "BOOKING_WALLET_CAPTURE_LEDGER_CONFLICT");
    } finally {
      await server.close();
    }
  });

  test("phase8c a RELEASED reservation cannot be captured or re-complete the Booking", async () => {
    const server = await startCaptureHttpServer();
    try {
      const accepted = await createAcceptedWalletBooking(server.baseUrl);
      const cancelled = await postUserCancellation(
        server.baseUrl,
        accepted.booking._id.toString(),
        accepted.fixture,
      );
      assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
      await Booking.collection.updateOne(
        { _id: accepted.booking._id },
        {
          $set: {
            status: "CONFIRMED",
            isPayable: true,
            isFinancialLocked: false,
            paymentStatus: "PAID",
          },
          $unset: {
            terminationType: "",
            terminatedByType: "",
            terminatedById: "",
            terminationReason: "",
            terminationOperationKey: "",
            terminatedAt: "",
          },
        },
      );
      const response = await postCreatorCompletion(
        server.baseUrl,
        accepted.booking._id.toString(),
        accepted.creatorToken,
      );
      assert.equal(response.status, 409, JSON.stringify(response.body));
      assert.equal(response.body.code, "BOOKING_WALLET_CAPTURE_ALREADY_RELEASED");
      const [booking, payment, reservation, wallet] = await Promise.all([
        Booking.findById(accepted.booking._id).orFail(),
        Payment.findById(accepted.booking.paymentId).orFail(),
        BookingFundReservation.findOne({ bookingId: accepted.booking._id }).orFail(),
        Wallet.findById(accepted.fixture.actors.wallet._id).orFail(),
      ]);
      assert.equal(booking.status, "CONFIRMED");
      assert.equal(payment.status, PaymentStatus.CANCELLED);
      assert.equal(reservation.status, BookingFundReservationStatus.RELEASED);
      assert.deepEqual([wallet.availableBalance, wallet.reservedBalance, wallet.currentBalance], [1_000, 0, 1_000]);
      assert.equal(await LedgerEntry.countDocuments({
        bookingId: booking._id,
        source: LedgerSource.BOOKING_WALLET_CAPTURE,
      }), 0);
    } finally {
      await server.close();
    }
  });

  const identityCases: Array<{
    name: string;
    code: string;
    mutate: (bookingId: Types.ObjectId, paymentId: Types.ObjectId) => Promise<unknown>;
  }> = [
    {
      name: "amount",
      code: "BOOKING_WALLET_CAPTURE_AMOUNT_CONFLICT",
      mutate: (bookingId) => Booking.collection.updateOne(
        { _id: bookingId },
        { $set: { totalAmount: 421 } },
      ),
    },
    {
      name: "currency",
      code: "BOOKING_WALLET_CAPTURE_CURRENCY_CONFLICT",
      mutate: (_bookingId, paymentId) => Payment.collection.updateOne(
        { _id: paymentId },
        { $set: { currency: "USD" } },
      ),
    },
    {
      name: "payment method",
      code: "BOOKING_WALLET_CAPTURE_PAYMENT_METHOD_CONFLICT",
      mutate: (_bookingId, paymentId) => Payment.collection.updateOne(
        { _id: paymentId },
        { $set: { method: PaymentMethod.INTERNAL } },
      ),
    },
    {
      name: "customer Wallet identity",
      code: "BOOKING_WALLET_CAPTURE_IDENTITY_CONFLICT",
      mutate: (bookingId) => BookingFundReservation.collection.updateOne(
        { bookingId },
        { $set: { walletId: new Types.ObjectId() } },
      ),
    },
    {
      name: "customer User identity",
      code: "BOOKING_WALLET_CAPTURE_IDENTITY_CONFLICT",
      mutate: (bookingId) => BookingFundReservation.collection.updateOne(
        { bookingId },
        { $set: { userId: new Types.ObjectId() } },
      ),
    },
    {
      name: "Creator identity",
      code: "BOOKING_WALLET_CAPTURE_IDENTITY_CONFLICT",
      mutate: (bookingId) => BookingFundReservation.collection.updateOne(
        { bookingId },
        { $set: { creatorId: new Types.ObjectId() } },
      ),
    },
    {
      name: "service identity",
      code: "BOOKING_WALLET_CAPTURE_IDENTITY_CONFLICT",
      mutate: (bookingId) => BookingFundReservation.collection.updateOne(
        { bookingId },
        { $set: { serviceId: new Types.ObjectId() } },
      ),
    },
    {
      name: "authorization transaction",
      code: "BOOKING_WALLET_CAPTURE_INTEGRITY_ERROR",
      mutate: (bookingId) => BookingFundReservation.collection.updateOne(
        { bookingId },
        { $unset: { ledgerTransactionId: "" } },
      ),
    },
    {
      name: "partial capture transaction",
      code: "BOOKING_WALLET_CAPTURE_INTEGRITY_ERROR",
      mutate: (bookingId) => BookingFundReservation.collection.updateOne(
        { bookingId },
        { $set: { captureTransactionId: "corrupt-partial-capture" } },
      ),
    },
    {
      name: "Payment terminal status",
      code: "BOOKING_WALLET_CAPTURE_INVALID_PAYMENT_STATUS",
      mutate: (_bookingId, paymentId) => Payment.collection.updateOne(
        { _id: paymentId },
        { $set: { status: PaymentStatus.FAILED } },
      ),
    },
  ];

  for (const identityCase of identityCases) {
    test(`phase8c ${identityCase.name} conflict fails closed`, async () => {
      const server = await startCaptureHttpServer();
      try {
        const accepted = await createAcceptedWalletBooking(server.baseUrl);
        await identityCase.mutate(
          accepted.booking._id as Types.ObjectId,
          accepted.booking.paymentId as Types.ObjectId,
        );
        const response = await postCreatorCompletion(
          server.baseUrl,
          accepted.booking._id.toString(),
          accepted.creatorToken,
        );
        assert.equal(response.status, identityCase.code.endsWith("INTEGRITY_ERROR") ? 500 : 409);
        assert.equal(response.body.code, identityCase.code, JSON.stringify(response.body));
        assert.equal((await Booking.findById(accepted.booking._id).orFail()).status, "CONFIRMED");
        assert.equal(await LedgerEntry.countDocuments({
          bookingId: accepted.booking._id,
          source: LedgerSource.BOOKING_WALLET_CAPTURE,
        }), 0);
      } finally {
        await server.close();
      }
    });
  }

  const replayCorruptions: Array<{
    name: string;
    code: string;
    mutate: (bookingId: Types.ObjectId, paymentId: Types.ObjectId) => Promise<unknown>;
  }> = [
    {
      name: "Booking completion timestamp",
      code: "BOOKING_WALLET_CAPTURE_INTEGRITY_ERROR",
      mutate: (bookingId) => Booking.collection.updateOne(
        { _id: bookingId },
        { $set: { completedAt: new Date(0) } },
      ),
    },
    {
      name: "Payment capture timestamp",
      code: "BOOKING_WALLET_CAPTURE_INVALID_PAYMENT_STATUS",
      mutate: (_bookingId, paymentId) => Payment.collection.updateOne(
        { _id: paymentId },
        { $set: { capturedAt: new Date(0) } },
      ),
    },
    {
      name: "projection deltas",
      code: "BOOKING_WALLET_CAPTURE_PROJECTION_CONFLICT",
      mutate: async (bookingId) => {
        const reservation = await BookingFundReservation.findOne({ bookingId })
          .select("+captureProjectionOperationId")
          .orFail();
        return WalletProjectionOperation.collection.updateOne(
          { _id: reservation.captureProjectionOperationId },
          { $set: { "deltas.availableBalance": 1 } },
        );
      },
    },
    {
      name: "clearing account",
      code: "BOOKING_WALLET_CAPTURE_LEDGER_CONFLICT",
      mutate: (bookingId) => LedgerEntry.collection.updateOne(
        {
          bookingId,
          source: LedgerSource.BOOKING_WALLET_CAPTURE,
          account: LedgerAccount.PLATFORM_ESCROW,
        },
        { $set: { account: LedgerAccount.WALLET_AVAILABLE } },
      ),
    },
  ];

  for (const corruption of replayCorruptions) {
    test(`phase8c corrupted ${corruption.name} fails authoritative replay`, async () => {
      const server = await startCaptureHttpServer();
      try {
        const accepted = await createAcceptedWalletBooking(server.baseUrl);
        const completed = await postCreatorCompletion(
          server.baseUrl,
          accepted.booking._id.toString(),
          accepted.creatorToken,
        );
        assert.equal(completed.status, 200, JSON.stringify(completed.body));
        await corruption.mutate(
          accepted.booking._id as Types.ObjectId,
          accepted.booking.paymentId as Types.ObjectId,
        );
        const replay = await postCreatorCompletion(
          server.baseUrl,
          accepted.booking._id.toString(),
          accepted.creatorToken,
        );
        assert.equal(replay.body.code, corruption.code, JSON.stringify(replay.body));
        assert.ok([409, 500].includes(replay.status));
      } finally {
        await server.close();
      }
    });
  }
};
