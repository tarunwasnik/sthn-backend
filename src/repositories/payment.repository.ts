// backend/src/repositories/payment.repository.ts

import { ClientSession, Types } from "mongoose";

import { IPayment, Payment } from "../models/payment.model";
import { PaymentStatus } from "../enums/financial/paymentStatus.enum";
import { PaymentMethod } from "../enums/financial/paymentMethod.enum";
import { BookingWalletReleaseCause } from "../enums/financial/bookingWalletReleaseCause.enum";
import { BookingWalletCaptureCause } from "../enums/financial/bookingWalletCaptureCause.enum";

/**
 * ============================================================
 * STHN Marketplace
 * Financial Domain
 * Payment Repository
 * ============================================================
 *
 * Responsibility
 * --------------
 * Handles persistence operations for Payments.
 *
 * IMPORTANT
 * ---------
 * - No business logic.
 * - No payment processing.
 * - No provider communication.
 * - No financial decisions.
 * ============================================================
 */
export class PaymentRepository {
  async create(
    data: Partial<IPayment>,
    session?: ClientSession,
  ): Promise<IPayment> {
    if (session) {
      const payment = new Payment(data);

      await payment.save({ session });

      return payment;
    }

    return Payment.create(data);
  }

  async findById(id: Types.ObjectId, session?: ClientSession): Promise<IPayment | null> {
    return Payment.findById(id).session(session ?? null).exec();
  }

  async findByIdWithWalletLinks(
    id: Types.ObjectId,
    session?: ClientSession,
  ): Promise<IPayment | null> {
    return Payment.findById(id)
      .select("+walletId +reservationId")
      .session(session ?? null).exec();
  }

  async findByPaymentReference(
    paymentReference: string,
  ): Promise<IPayment | null> {
    return Payment.findOne({ paymentReference }).exec();
  }

  async findByBookingId(bookingId: Types.ObjectId): Promise<IPayment[]> {
    return Payment.find({ bookingId }).sort({ createdAt: -1 }).exec();
  }

  async findByBookingAndStatus(
    bookingId: Types.ObjectId,
    status: PaymentStatus,
  ): Promise<IPayment | null> {
    return Payment.findOne({
      bookingId,
      status,
    }).exec();
  }

  async findByUserId(userId: Types.ObjectId): Promise<IPayment[]> {
    return Payment.find({ userId }).sort({ createdAt: -1 }).exec();
  }

  async findByCreatorId(creatorId: Types.ObjectId): Promise<IPayment[]> {
    return Payment.find({ creatorId }).sort({ createdAt: -1 }).exec();
  }

  async findByStatus(status: PaymentStatus): Promise<IPayment[]> {
    return Payment.find({ status }).sort({ createdAt: -1 }).exec();
  }

  async findByProviderPaymentId(
    providerPaymentId: string,
  ): Promise<IPayment | null> {
    return Payment.findOne({
      providerPaymentId,
    }).exec();
  }

  async findByProviderOrderId(
    providerOrderId: string,
  ): Promise<IPayment | null> {
    return Payment.findOne({
      providerOrderId,
    }).exec();
  }

  async findByProviderTransactionId(
    providerTransactionId: string,
  ): Promise<IPayment | null> {
    return Payment.findOne({
      providerTransactionId,
    }).exec();
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<IPayment | null> {
    return Payment.findOne({
      idempotencyKey,
    }).exec();
  }

  async findOne(filter: Record<string, unknown>): Promise<IPayment | null> {
    return Payment.findOne(filter).exec();
  }

  async findMany(filter: Record<string, unknown>): Promise<IPayment[]> {
    return Payment.find(filter).sort({ createdAt: -1 }).exec();
  }

  async transition(
    id: Types.ObjectId,
    expectedStatuses: PaymentStatus[],
    update: Record<string, unknown>,
    session: ClientSession,
  ): Promise<IPayment | null> {
    return Payment.findOneAndUpdate(
      { _id: id, status: { $in: expectedStatuses } },
      { ...update, $inc: { lifecycleVersion: 1 } },
      { new: true, runValidators: true, session },
    ).exec();
  }

  async guardWalletAuthorizationToReleasedTerminal(
    input: {
      paymentId: Types.ObjectId;
      bookingId: Types.ObjectId;
      reservationId: Types.ObjectId;
      reservationReference: string;
      walletId: Types.ObjectId;
      amount: number;
      currency: string;
      targetStatus: PaymentStatus.CANCELLED | PaymentStatus.EXPIRED;
      releaseReference: string;
      releaseCause: BookingWalletReleaseCause;
      releasedAt: Date;
    },
    session: ClientSession,
  ): Promise<IPayment | null> {
    return Payment.findOneAndUpdate(
      {
        _id: input.paymentId,
        bookingId: input.bookingId,
        method: PaymentMethod.WALLET,
        status: PaymentStatus.AUTHORIZED,
        reservationId: input.reservationId,
        reservationReference: input.reservationReference,
        walletId: input.walletId,
        authorizedAmount: input.amount,
        amount: input.amount,
        currency: input.currency,
        releasedAt: { $exists: false },
        releaseReference: { $exists: false },
      },
      {
        $set: {
          status: input.targetStatus,
          releaseReference: input.releaseReference,
          releasedAmount: input.amount,
          releaseCause: input.releaseCause,
          releasedAt: input.releasedAt,
          retryable: false,
        },
        $inc: { lifecycleVersion: 1 },
      },
      { new: true, runValidators: true, session },
    ).exec();
  }

  async guardWalletAuthorizedToCaptured(
    input: {
      paymentId: Types.ObjectId;
      bookingId: Types.ObjectId;
      reservationId: Types.ObjectId;
      reservationReference: string;
      walletId: Types.ObjectId;
      amount: number;
      currency: string;
      captureReference: string;
      captureCause: BookingWalletCaptureCause;
      captureTransactionId: string;
      capturedAt: Date;
    },
    session: ClientSession,
  ): Promise<IPayment | null> {
    return Payment.findOneAndUpdate(
      {
        _id: input.paymentId,
        bookingId: input.bookingId,
        method: PaymentMethod.WALLET,
        status: PaymentStatus.AUTHORIZED,
        reservationId: input.reservationId,
        reservationReference: input.reservationReference,
        walletId: input.walletId,
        authorizedAmount: input.amount,
        amount: input.amount,
        currency: input.currency,
        capturedAt: { $exists: false },
        captureReference: { $exists: false },
        releasedAt: { $exists: false },
        releaseReference: { $exists: false },
      },
      {
        $set: {
          status: PaymentStatus.CAPTURED,
          captureReference: input.captureReference,
          capturedAmount: input.amount,
          captureCause: input.captureCause,
          capturedAt: input.capturedAt,
          escrowRecognizedAt: input.capturedAt,
          escrowLedgerTransactionReference: input.captureTransactionId,
          retryable: false,
        },
        $inc: { lifecycleVersion: 1 },
      },
      { new: true, runValidators: true, session },
    ).select("+walletId +reservationId").exec();
  }

  async findWalletCapturedAuthoritative(
    paymentId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<IPayment | null> {
    return Payment.findOne({
      _id: paymentId,
      method: PaymentMethod.WALLET,
      status: PaymentStatus.CAPTURED,
    }).select("+walletId +reservationId").session(session ?? null).exec();
  }

  async markEscrowRecognized(
    id: Types.ObjectId,
    transactionReference: string,
    recognizedAt: Date,
    session: ClientSession,
  ): Promise<IPayment | null> {
    return Payment.findOneAndUpdate(
      { _id: id, status: PaymentStatus.CAPTURED, escrowRecognizedAt: { $exists: false } },
      { $set: { escrowRecognizedAt: recognizedAt, escrowLedgerTransactionReference: transactionReference } },
      { new: true, runValidators: true, session },
    ).exec();
  }

  async updateReconciliation(
    id: Types.ObjectId,
    update: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<IPayment | null> {
    const snapshotFields = ["serviceAmount", "customerFeeRateBps", "customerFeeAmount", "grossEscrowAmount", "pricingPolicy", "pricingVersion"];
    const fillsPricingSnapshot = snapshotFields.some((field) => field in update);
    const filter: Record<string, unknown> = { _id: id };
    if (fillsPricingSnapshot) {
      // Historical reconciliation may fill a wholly absent snapshot once, but
      // never overwrite a partially or fully established financial snapshot.
      filter.serviceAmount = { $exists: false };
      filter.customerFeeRateBps = { $exists: false };
      filter.customerFeeAmount = { $exists: false };
      filter.grossEscrowAmount = { $exists: false };
      filter.pricingPolicy = { $exists: false };
      filter.pricingVersion = { $exists: false };
    }
    return Payment.findOneAndUpdate(filter, { $set: update }, { new: true, runValidators: true, session }).exec();
  }

  async exists(filter: Record<string, unknown>): Promise<boolean> {
    const result = await Payment.exists(filter);

    return result !== null;
  }

  async count(filter: Record<string, unknown> = {}): Promise<number> {
    return Payment.countDocuments(filter).exec();
  }

}

export const paymentRepository = new PaymentRepository();
