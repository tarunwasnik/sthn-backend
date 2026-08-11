import { ClientSession, Types } from "mongoose";

import { SupportedCurrency } from "../../constants/financial/supportedCurrencies";
import { BookingFundReservationStatus } from "../../enums/financial/bookingFundReservationStatus.enum";
import { LedgerAccount } from "../../enums/financial/ledgerAccount.enum";
import { LedgerEntryType } from "../../enums/financial/ledgerEntryType.enum";
import { LedgerSource } from "../../enums/financial/ledgerSource.enum";
import { PaymentMethod } from "../../enums/financial/paymentMethod.enum";
import { PaymentStatus } from "../../enums/financial/paymentStatus.enum";
import {
  BookingWalletReservationError,
  BookingWalletReservationErrorCode,
} from "../../errors/financial/BookingWalletReservationError";
import { WalletError } from "../../errors/financial/WalletError";
import { IBooking } from "../../models/booking.model";
import { BookingFundReservationDocument } from "../../models/bookingFundReservation.model";
import { IPayment } from "../../models/payment.model";
import { bookingFundReservationRepository } from "../../repositories/bookingFundReservation.repository";
import { paymentRepository } from "../../repositories/payment.repository";
import { walletRepository } from "../../repositories/wallet/wallet.repository";
import { walletProjectionOperationRepository } from "../../repositories/wallet/walletProjectionOperation.repository";
import { deriveBookingWalletReservationIdentity } from "../../utils/financial/bookingWalletReservationIdentity.util";
import { ledgerService } from "./ledger.service";
import { walletProjectionService } from "../wallet/walletProjection.service";

export interface AuthorizeBookingWalletReservationInput {
  booking: IBooking;
  payment: IPayment;
  authenticatedUserId: Types.ObjectId;
  currency: SupportedCurrency;
  session: ClientSession;
}

export interface BookingWalletReservationResult {
  reservation: BookingFundReservationDocument;
  availableBalance: number;
  reservedBalance: number;
  lockedBalance: number;
  currentBalance: number;
}

export class BookingWalletReservationService {
  private fail(
    message: string,
    code: BookingWalletReservationErrorCode,
    cause?: unknown,
  ): never {
    throw new BookingWalletReservationError(message, code, { cause });
  }

  private assertIntent(input: AuthorizeBookingWalletReservationInput): void {
    const { booking, payment, authenticatedUserId, currency, session } = input;
    if (!session.inTransaction()) {
      this.fail(
        "Booking Wallet reservation requires an active transaction.",
        "BOOKING_WALLET_RESERVATION_TRANSACTION_CONFLICT",
      );
    }
    if (booking.status !== "REQUESTED") {
      this.fail(
        "Booking is not eligible for Wallet authorization.",
        "BOOKING_WALLET_RESERVATION_BOOKING_CONFLICT",
      );
    }
    if (
      ![PaymentStatus.CREATED, PaymentStatus.AUTHORIZED].includes(payment.status) ||
      payment.method !== PaymentMethod.WALLET
    ) {
      this.fail(
        "Payment is not eligible for Wallet authorization.",
        "BOOKING_WALLET_RESERVATION_PAYMENT_CONFLICT",
      );
    }
    if (
      payment.status === PaymentStatus.AUTHORIZED &&
      (
        payment.authorizedAmount !== booking.totalAmount ||
        !payment.reservationReference ||
        payment.reservationReference !== booking.reservationReference
      )
    ) {
      this.fail(
        "Authorized Payment does not match the Booking reservation.",
        "BOOKING_WALLET_RESERVATION_PAYMENT_CONFLICT",
      );
    }
    if (
      booking.userId.toString() !== authenticatedUserId.toString() ||
      payment.userId.toString() !== authenticatedUserId.toString()
    ) {
      this.fail(
        "Wallet ownership does not match the authenticated customer.",
        "BOOKING_WALLET_RESERVATION_WALLET_OWNERSHIP_CONFLICT",
      );
    }
    if (
      payment.bookingId.toString() !== booking._id.toString() ||
      payment.creatorId.toString() !== booking.creatorId.toString()
    ) {
      this.fail(
        "Booking and Payment identity are inconsistent.",
        "BOOKING_WALLET_RESERVATION_INTEGRITY_ERROR",
      );
    }
    if (
      !Number.isSafeInteger(booking.totalAmount) ||
      booking.totalAmount <= 0 ||
      payment.amount !== booking.totalAmount ||
      payment.serviceAmount !== booking.serviceAmount ||
      booking.price !== booking.serviceAmount ||
      payment.customerFeeAmount !== booking.platformFeeAmount ||
      booking.serviceAmount + booking.platformFeeAmount !== booking.totalAmount
    ) {
      this.fail(
        "Wallet reservation amount must equal the positive booking snapshot amount.",
        "BOOKING_WALLET_RESERVATION_INVALID_AMOUNT",
      );
    }
    if (booking.currency !== currency || payment.currency !== currency) {
      this.fail(
        "Booking and Payment currency are inconsistent.",
        "BOOKING_WALLET_RESERVATION_CURRENCY_CONFLICT",
      );
    }
  }

  private mapProjectionError(error: unknown): never {
    if (error instanceof WalletError) {
      if (error.code === "WALLET_INSUFFICIENT_BALANCE") {
        this.fail(
          "Insufficient available Wallet balance.",
          "BOOKING_WALLET_RESERVATION_INSUFFICIENT_AVAILABLE_BALANCE",
          error,
        );
      }
      if (error.code === "WALLET_NOT_FOUND") {
        this.fail(
          "Wallet not found.",
          "BOOKING_WALLET_RESERVATION_WALLET_NOT_FOUND",
          error,
        );
      }
    }
    this.fail(
      "Wallet projection could not apply the booking reservation.",
      "BOOKING_WALLET_RESERVATION_PROJECTION_CONFLICT",
      error,
    );
  }

  async authorize(
    input: AuthorizeBookingWalletReservationInput,
  ): Promise<BookingWalletReservationResult> {
    this.assertIntent(input);
    const { booking, payment, authenticatedUserId, currency, session } = input;

    const wallet = await walletRepository.findByUserAndCurrency(
      authenticatedUserId,
      currency,
      session,
    );
    if (!wallet) {
      const otherWallet = await walletRepository.findAnyByUser(authenticatedUserId, session);
      this.fail(
        otherWallet
          ? "Wallet currency does not match the booking currency."
          : "Wallet not found.",
        otherWallet
          ? "BOOKING_WALLET_RESERVATION_CURRENCY_CONFLICT"
          : "BOOKING_WALLET_RESERVATION_WALLET_NOT_FOUND",
      );
    }
    if (wallet.userId.toString() !== authenticatedUserId.toString()) {
      this.fail(
        "Wallet ownership does not match the authenticated customer.",
        "BOOKING_WALLET_RESERVATION_WALLET_OWNERSHIP_CONFLICT",
      );
    }

    const identity = deriveBookingWalletReservationIdentity({
      bookingId: booking._id as Types.ObjectId,
      paymentId: payment._id as Types.ObjectId,
      paymentReference: payment.paymentReference,
      userId: authenticatedUserId,
      walletId: wallet._id as Types.ObjectId,
      creatorId: booking.creatorId,
      serviceId: booking.serviceId,
      amount: booking.totalAmount,
      currency,
      method: PaymentMethod.WALLET,
    });

    const created = await bookingFundReservationRepository.createOrFindDeterministicReservation(
      {
        reservationReference: identity.reservationReference,
        reservationKey: identity.reservationKey,
        bookingId: booking._id,
        bookingReference: booking.bookingReference ?? booking._id.toString(),
        paymentId: payment._id,
        paymentReference: payment.paymentReference,
        userId: authenticatedUserId,
        walletId: wallet._id,
        creatorId: booking.creatorId,
        serviceId: booking.serviceId,
        amount: booking.totalAmount,
        currency,
        status: BookingFundReservationStatus.PENDING,
        requestFingerprint: identity.requestFingerprint,
        version: 0,
      },
      session,
    );

    if (created.reservation.requestFingerprint !== identity.requestFingerprint) {
      this.fail(
        "Reservation identity conflicts with the persisted intent.",
        "BOOKING_WALLET_RESERVATION_IDENTITY_CONFLICT",
      );
    }
    if (!created.created) {
      if (created.reservation.status !== BookingFundReservationStatus.ACTIVE) {
        this.fail(
          "Reservation is not in a replayable state.",
          "BOOKING_WALLET_RESERVATION_INVALID_STATUS",
        );
      }
      return {
        reservation: created.reservation,
        availableBalance: wallet.availableBalance,
        reservedBalance: wallet.reservedBalance,
        lockedBalance: wallet.lockedBalance,
        currentBalance: wallet.currentBalance,
      };
    }

    let availableDebit;
    let reservedCredit;
    try {
      const common = {
        type: LedgerEntryType.BOOKING_FUNDS_RESERVED,
        source: LedgerSource.BOOKING_WALLET_AUTHORIZATION,
        money: { amount: booking.totalAmount, currency },
        transactionId: identity.ledgerTransactionId,
        bookingId: booking._id.toString(),
        paymentId: payment._id.toString(),
        userId: authenticatedUserId.toString(),
        walletId: wallet._id.toString(),
        idempotencyKey: identity.ledgerTransactionId,
        metadata: {
          reservationReference: identity.reservationReference,
          paymentReference: payment.paymentReference,
        },
      } as const;
      availableDebit = await ledgerService.createDebit({
        ...common,
        account: LedgerAccount.WALLET_AVAILABLE,
        postingKey: identity.availablePostingKey,
        description: "Booking Wallet available funds reserved",
      }, session);
      reservedCredit = await ledgerService.createCredit({
        ...common,
        account: LedgerAccount.WALLET_RESERVED,
        postingKey: identity.reservedPostingKey,
        description: "Booking Wallet reserved funds increase",
      }, session);
    } catch (error) {
      this.fail(
        "Ledger could not record the booking Wallet reservation.",
        "BOOKING_WALLET_RESERVATION_LEDGER_CONFLICT",
        error,
      );
    }

    let projectedWallet;
    try {
      projectedWallet = await walletProjectionService.applyProjectionMutation({
        userId: authenticatedUserId,
        currency,
        operationKey: identity.projectionOperationKey,
        deltas: {
          availableBalance: -booking.totalAmount,
          reservedBalance: booking.totalAmount,
          lockedBalance: 0,
        },
        minimums: { availableBalance: booking.totalAmount },
        ledgerEntryIds: [
          availableDebit._id as Types.ObjectId,
          reservedCredit._id as Types.ObjectId,
        ],
      }, session);
    } catch (error) {
      this.mapProjectionError(error);
    }

    const projection = await walletProjectionOperationRepository.findByOperationKey(
      identity.projectionOperationKey,
      session,
    );
    if (!projection) {
      this.fail(
        "Wallet projection operation is missing after projection.",
        "BOOKING_WALLET_RESERVATION_INTEGRITY_ERROR",
      );
    }

    const authorizedAt = new Date();
    const active = await bookingFundReservationRepository.markActiveFromPending(
      created.reservation._id as Types.ObjectId,
      {
        ledgerTransactionId: identity.ledgerTransactionId,
        ledgerEntryIds: [
          availableDebit._id as Types.ObjectId,
          reservedCredit._id as Types.ObjectId,
        ],
        projectionOperationId: projection._id as Types.ObjectId,
        projectionOperationReference: projection.operationReference,
        authorizedAt,
      },
      session,
    );
    if (!active) {
      this.fail(
        "Reservation status changed concurrently.",
        "BOOKING_WALLET_RESERVATION_INVALID_STATUS",
      );
    }

    const authorizedPayment = await paymentRepository.transition(
      payment._id as Types.ObjectId,
      [PaymentStatus.CREATED],
      {
        $set: {
          status: PaymentStatus.AUTHORIZED,
          walletId: wallet._id,
          reservationId: active._id,
          reservationReference: active.reservationReference,
          authorizedAmount: booking.totalAmount,
          authorizedAt,
          retryable: false,
        },
      },
      session,
    );
    if (!authorizedPayment) {
      this.fail(
        "Payment authorization state changed concurrently.",
        "BOOKING_WALLET_RESERVATION_PAYMENT_CONFLICT",
      );
    }

    booking.paymentMethod = PaymentMethod.WALLET;
    booking.paymentReference = payment.paymentReference;
    booking.reservationReference = active.reservationReference;
    booking.fundsReservedAt = authorizedAt;
    booking.paymentStatus = "PAID";
    booking.isPayable = true;
    await booking.save({ session });

    return {
      reservation: active,
      availableBalance: projectedWallet.availableBalance,
      reservedBalance: projectedWallet.reservedBalance,
      lockedBalance: projectedWallet.lockedBalance,
      currentBalance: projectedWallet.currentBalance,
    };
  }
}

export const bookingWalletReservationService =
  new BookingWalletReservationService();
