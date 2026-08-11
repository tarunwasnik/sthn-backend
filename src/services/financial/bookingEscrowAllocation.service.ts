import mongoose, { ClientSession, Types } from "mongoose";
import { SupportedCurrency } from "../../constants/financial/supportedCurrencies";

import { AuditAction } from "../../enums/financial/auditAction.enum";
import { BookingEscrowAllocationStatus } from "../../enums/financial/bookingEscrowAllocationStatus.enum";
import { BookingFundReservationStatus } from "../../enums/financial/bookingFundReservationStatus.enum";
import { BookingWalletCaptureCause } from "../../enums/financial/bookingWalletCaptureCause.enum";
import { LedgerAccount } from "../../enums/financial/ledgerAccount.enum";
import { LedgerEntryType } from "../../enums/financial/ledgerEntryType.enum";
import { LedgerSource } from "../../enums/financial/ledgerSource.enum";
import { MoneyDirection } from "../../enums/financial/moneyDirection.enum";
import { PaymentMethod } from "../../enums/financial/paymentMethod.enum";
import { PaymentStatus } from "../../enums/financial/paymentStatus.enum";
import {
  BookingEscrowAllocationError,
  BookingEscrowAllocationErrorCode,
} from "../../errors/financial/BookingEscrowAllocationError";
import { AuditLog } from "../../models/auditLog.model";
import {
  BookingEscrowAllocationDocument,
} from "../../models/bookingEscrowAllocation.model";
import { IBooking } from "../../models/booking.model";
import { BookingFundReservationDocument } from "../../models/bookingFundReservation.model";
import { Dispute } from "../../models/dispute.model";
import { IPayment } from "../../models/payment.model";
import { Settlement } from "../../models/settlement.model";
import { WalletProjectionOperation } from "../../models/walletProjectionOperation.model";
import { bookingEscrowAllocationRepository } from "../../repositories/bookingEscrowAllocation.repository";
import { bookingFundReservationRepository } from "../../repositories/bookingFundReservation.repository";
import { bookingRepository } from "../../repositories/booking.repository";
import { ledgerEntryRepository } from "../../repositories/ledgerEntry.repository";
import { paymentRepository } from "../../repositories/payment.repository";
import { deriveBookingEscrowAllocationIdentity } from "../../utils/financial/bookingEscrowAllocationIdentity.util";
import { createFinancialAudit } from "../auditLog.service";
import {
  CREATOR_COMMISSION_RATE_BPS,
  marketplacePricingService,
  MarketplacePricingSnapshot,
} from "./marketplacePricing.service";
import { bookingWalletReservationCaptureService } from "./bookingWalletReservationCapture.service";
import { ledgerService } from "./ledger.service";

interface AllocationGraph {
  booking: IBooking;
  payment: IPayment;
  reservation: BookingFundReservationDocument;
}

interface AllocationAmounts extends MarketplacePricingSnapshot {
  commissionRateBps: number;
}

export interface SafeBookingEscrowAllocationResult {
  booking: { bookingReference?: string; status: "COMPLETED" };
  payment: { paymentReference: string; status: PaymentStatus.CAPTURED };
  reservation: {
    reservationReference: string;
    status: BookingFundReservationStatus.CAPTURED;
  };
  allocation: {
    allocationReference: string;
    status: BookingEscrowAllocationStatus.ALLOCATED;
    bookingAmount: number;
    serviceAmount: number;
    platformFeeAmount: number;
    totalAmount: number;
    currency: string;
    commissionRateBps: number;
    commissionAmount: number;
    creatorAmount: number;
    allocatedAt: Date;
  };
  replay: boolean;
}

const isTransientTransactionError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    hasErrorLabel?: (label: string) => boolean;
    errorLabels?: string[];
  };
  return candidate.hasErrorLabel?.("TransientTransactionError") === true ||
    candidate.errorLabels?.includes("TransientTransactionError") === true;
};

export class BookingEscrowAllocationService {
  private fail(
    message: string,
    code: BookingEscrowAllocationErrorCode,
    cause?: unknown,
  ): never {
    throw new BookingEscrowAllocationError(message, code, { cause });
  }

  private amounts(booking: IBooking): AllocationAmounts {
    try {
      const snapshot: MarketplacePricingSnapshot = {
        serviceAmount: booking.serviceAmount,
        platformFeeAmount: booking.platformFeeAmount,
        commissionAmount: booking.commissionAmount,
        creatorAmount: booking.creatorAmount,
        totalAmount: booking.totalAmount,
        currency: booking.currency as SupportedCurrency,
      };
      marketplacePricingService.validate(snapshot);
      if (booking.price !== snapshot.serviceAmount) {
        throw new Error("Creator-facing price conflicts with service amount.");
      }
      return {
        ...snapshot,
        commissionRateBps: CREATOR_COMMISSION_RATE_BPS,
      };
    } catch (error) {
      this.fail(
        "Booking pricing snapshot cannot be allocated safely.",
        "BOOKING_ESCROW_ALLOCATION_INTEGRITY_ERROR",
        error,
      );
    }
  }

  private async loadGraph(
    bookingId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<AllocationGraph> {
    const booking = await bookingRepository.findById(bookingId, session);
    if (!booking) {
      this.fail(
        "Booking not found.",
        "BOOKING_ESCROW_ALLOCATION_BOOKING_NOT_FOUND",
      );
    }
    if (!booking.paymentId) {
      this.fail(
        "Payment not found.",
        "BOOKING_ESCROW_ALLOCATION_PAYMENT_NOT_FOUND",
      );
    }
    const [payment, reservation] = await Promise.all([
      paymentRepository.findByIdWithWalletLinks(booking.paymentId, session),
      bookingFundReservationRepository.findByBookingWithHiddenReleaseLinks(
        bookingId,
        session,
      ),
    ]);
    if (!payment) {
      this.fail(
        "Payment not found.",
        "BOOKING_ESCROW_ALLOCATION_PAYMENT_NOT_FOUND",
      );
    }
    if (!reservation) {
      this.fail(
        "Captured reservation not found.",
        "BOOKING_ESCROW_ALLOCATION_RESERVATION_NOT_FOUND",
      );
    }
    return { booking, payment, reservation };
  }

  private async validateCapturedPreconditions(
    graph: AllocationGraph,
    session?: ClientSession,
  ): Promise<void> {
    const { booking, payment, reservation } = graph;
    if (booking.isFinancialLocked) {
      this.fail(
        "Booking is financially locked.",
        "BOOKING_ESCROW_ALLOCATION_FINANCIAL_LOCKED",
      );
    }
    if (await Dispute.exists({
      bookingId: booking._id,
      status: "OPEN",
    }).session(session ?? null)) {
      this.fail(
        "An OPEN dispute blocks escrow allocation.",
        "BOOKING_ESCROW_ALLOCATION_DISPUTE_OPEN",
      );
    }
    if (
      booking.status !== "COMPLETED" ||
      payment.status !== PaymentStatus.CAPTURED ||
      reservation.status !== BookingFundReservationStatus.CAPTURED
    ) {
      this.fail(
        "Booking capture lifecycle is not eligible for allocation.",
        "BOOKING_ESCROW_ALLOCATION_STATUS_CONFLICT",
      );
    }
    if (
      booking.paymentMethod !== PaymentMethod.WALLET ||
      payment.method !== PaymentMethod.WALLET ||
      !booking.completionCause ||
      !Object.values(BookingWalletCaptureCause).includes(booking.completionCause)
    ) {
      this.fail(
        "Escrow allocation identity requires a Wallet capture.",
        "BOOKING_ESCROW_ALLOCATION_IDENTITY_CONFLICT",
      );
    }
    if (
      payment.bookingId.toString() !== booking._id.toString() ||
      reservation.bookingId.toString() !== booking._id.toString() ||
      reservation.paymentId.toString() !== payment._id.toString() ||
      reservation.userId.toString() !== booking.userId.toString() ||
      payment.userId.toString() !== booking.userId.toString() ||
      reservation.creatorId.toString() !== booking.creatorId.toString() ||
      payment.creatorId.toString() !== booking.creatorId.toString() ||
      reservation.amount !== booking.totalAmount ||
      payment.amount !== booking.totalAmount ||
      payment.serviceAmount !== booking.serviceAmount ||
      payment.customerFeeAmount !== booking.platformFeeAmount ||
      payment.grossEscrowAmount !== booking.totalAmount ||
      reservation.currency !== booking.currency ||
      payment.currency !== booking.currency ||
      !reservation.captureTransactionId ||
      payment.escrowLedgerTransactionReference !== reservation.captureTransactionId
    ) {
      this.fail(
        "Booking capture identity conflicts with allocation.",
        "BOOKING_ESCROW_ALLOCATION_IDENTITY_CONFLICT",
      );
    }
    if (
      booking.settlementId ||
      payment.settlementId ||
      await Settlement.exists({
        $or: [{ bookingId: booking._id }, { paymentId: payment._id }],
      }).session(session ?? null)
    ) {
      this.fail(
        "A settled Booking cannot be allocated.",
        "BOOKING_ESCROW_ALLOCATION_STATUS_CONFLICT",
      );
    }
    try {
      await bookingWalletReservationCaptureService.validateReplay({
        bookingId: booking._id as Types.ObjectId,
        cause: booking.completionCause,
        session,
      });
    } catch (error) {
      this.fail(
        "Captured Booking graph is not authoritative.",
        "BOOKING_ESCROW_ALLOCATION_INTEGRITY_ERROR",
        error,
      );
    }
  }

  private identity(graph: AllocationGraph, amounts: AllocationAmounts) {
    const { booking, payment, reservation } = graph;
    if (
      !booking.bookingReference ||
      !reservation.captureTransactionId
    ) {
      this.fail(
        "Allocation identity is incomplete.",
        "BOOKING_ESCROW_ALLOCATION_INTEGRITY_ERROR",
      );
    }
    return deriveBookingEscrowAllocationIdentity({
      bookingId: booking._id as Types.ObjectId,
      bookingReference: booking.bookingReference,
      paymentId: payment._id as Types.ObjectId,
      paymentReference: payment.paymentReference,
      reservationId: reservation._id as Types.ObjectId,
      reservationReference: reservation.reservationReference,
      customerId: reservation.userId,
      creatorId: reservation.creatorId,
      bookingAmount: reservation.amount,
      serviceAmount: amounts.serviceAmount,
      platformFeeAmount: amounts.platformFeeAmount,
      totalAmount: amounts.totalAmount,
      currency: reservation.currency,
      commissionRateBps: amounts.commissionRateBps,
      commissionAmount: amounts.commissionAmount,
      creatorAmount: amounts.creatorAmount,
      captureTransactionId: reservation.captureTransactionId,
    });
  }

  private safe(
    graph: AllocationGraph,
    allocation: BookingEscrowAllocationDocument,
    replay: boolean,
  ): SafeBookingEscrowAllocationResult {
    if (
      allocation.status !== BookingEscrowAllocationStatus.ALLOCATED ||
      !allocation.allocatedAt
    ) {
      this.fail(
        "Allocated result is incomplete.",
        "BOOKING_ESCROW_ALLOCATION_INTEGRITY_ERROR",
      );
    }
    return {
      booking: {
        bookingReference: graph.booking.bookingReference,
        status: "COMPLETED",
      },
      payment: {
        paymentReference: graph.payment.paymentReference,
        status: PaymentStatus.CAPTURED,
      },
      reservation: {
        reservationReference: graph.reservation.reservationReference,
        status: BookingFundReservationStatus.CAPTURED,
      },
      allocation: {
        allocationReference: allocation.allocationReference,
        status: BookingEscrowAllocationStatus.ALLOCATED,
        bookingAmount: allocation.bookingAmount,
        serviceAmount: allocation.serviceAmount,
        platformFeeAmount: allocation.platformFeeAmount,
        totalAmount: allocation.totalAmount,
        currency: allocation.currency,
        commissionRateBps: allocation.commissionRateBps,
        commissionAmount: allocation.commissionAmount,
        creatorAmount: allocation.creatorAmount,
        allocatedAt: allocation.allocatedAt,
      },
      replay,
    };
  }

  private async validateAllocatedGraph(
    graph: AllocationGraph,
    allocation: BookingEscrowAllocationDocument,
    session?: ClientSession,
  ): Promise<SafeBookingEscrowAllocationResult> {
    await this.validateCapturedPreconditions(graph, session);
    const amounts = this.amounts(graph.booking);
    const identity = this.identity(graph, amounts);
    if (
      allocation.status !== BookingEscrowAllocationStatus.ALLOCATED ||
      !allocation.allocatedAt ||
      allocation.allocationKey !== identity.allocationKey ||
      allocation.allocationReference !== identity.allocationReference ||
      allocation.bookingId.toString() !== graph.booking._id.toString() ||
      allocation.paymentId.toString() !== graph.payment._id.toString() ||
      allocation.reservationId.toString() !== graph.reservation._id.toString() ||
      allocation.customerId.toString() !== graph.reservation.userId.toString() ||
      allocation.creatorId.toString() !== graph.reservation.creatorId.toString() ||
      allocation.bookingAmount !== graph.reservation.amount ||
      allocation.serviceAmount !== amounts.serviceAmount ||
      allocation.platformFeeAmount !== amounts.platformFeeAmount ||
      allocation.totalAmount !== amounts.totalAmount ||
      allocation.currency !== graph.reservation.currency ||
      allocation.commissionRateBps !== amounts.commissionRateBps ||
      allocation.commissionAmount !== amounts.commissionAmount ||
      allocation.creatorAmount !== amounts.creatorAmount ||
      allocation.escrowLedgerTransaction !== graph.reservation.captureTransactionId ||
      allocation.allocationLedgerTransaction !== identity.allocationLedgerTransaction ||
      allocation.allocationFingerprint !== identity.allocationFingerprint ||
      allocation.allocationLedgerEntryIds.length !== 4
    ) {
      this.fail(
        "Allocated authority conflicts with captured Booking.",
        "BOOKING_ESCROW_ALLOCATION_IDENTITY_CONFLICT",
      );
    }

    const entries = await ledgerEntryRepository.findManyWithPostingKeys({
      transactionId: identity.allocationLedgerTransaction,
    }, session);
    if (entries.length !== 4) {
      this.fail(
        "Escrow allocation Ledger transaction is incomplete.",
        "BOOKING_ESCROW_ALLOCATION_LEDGER_CONFLICT",
      );
    }
    const expectedIds = new Set(allocation.allocationLedgerEntryIds.map(String));
    const commonValid = entries.every((entry) =>
      expectedIds.has(entry._id.toString()) &&
      entry.bookingId?.toString() === graph.booking._id.toString() &&
      entry.paymentId?.toString() === graph.payment._id.toString() &&
      entry.type === LedgerEntryType.BOOKING_ESCROW_ALLOCATED &&
      entry.source === LedgerSource.BOOKING_ESCROW_ALLOCATION &&
      entry.currency === graph.reservation.currency &&
      !entry.walletId &&
      entry.metadata?.reservationReference === graph.reservation.reservationReference &&
      entry.metadata?.allocationReference === identity.allocationReference &&
      entry.metadata?.captureTransactionId === graph.reservation.captureTransactionId &&
      entry.metadata?.customerId === graph.reservation.userId.toString() &&
      entry.metadata?.creatorId === graph.reservation.creatorId.toString());
    const escrowDebit = entries.find((entry) =>
      entry.account === LedgerAccount.PLATFORM_ESCROW &&
      entry.direction === MoneyDirection.DEBIT &&
      entry.amount === graph.reservation.amount &&
      entry.userId?.toString() === graph.reservation.userId.toString() &&
      entry.postingKey === identity.escrowDebitPostingKey);
    const commissionCredit = entries.find((entry) =>
      entry.account === LedgerAccount.PLATFORM_CREATOR_COMMISSION_REVENUE &&
      entry.direction === MoneyDirection.CREDIT &&
      entry.amount === amounts.commissionAmount &&
      !entry.userId &&
      entry.postingKey === identity.commissionCreditPostingKey);
    const platformFeeCredit = entries.find((entry) =>
      entry.account === LedgerAccount.PLATFORM_SERVICE_FEE_REVENUE &&
      entry.direction === MoneyDirection.CREDIT &&
      entry.amount === amounts.platformFeeAmount &&
      !entry.userId &&
      entry.postingKey === identity.platformFeeCreditPostingKey);
    const creatorCredit = entries.find((entry) =>
      entry.account === LedgerAccount.CREATOR_PAYABLE &&
      entry.direction === MoneyDirection.CREDIT &&
      entry.amount === amounts.creatorAmount &&
      entry.userId?.toString() === graph.reservation.creatorId.toString() &&
      entry.postingKey === identity.creatorCreditPostingKey);
    const debitTotal = entries
      .filter((entry) => entry.direction === MoneyDirection.DEBIT)
      .reduce((sum, entry) => sum + entry.amount, 0);
    const creditTotal = entries
      .filter((entry) => entry.direction === MoneyDirection.CREDIT)
      .reduce((sum, entry) => sum + entry.amount, 0);
    if (
      !commonValid ||
      !escrowDebit ||
      !commissionCredit ||
      !platformFeeCredit ||
      !creatorCredit ||
      debitTotal !== creditTotal ||
      debitTotal !== graph.reservation.amount
    ) {
      this.fail(
        "Escrow allocation Ledger does not balance.",
        "BOOKING_ESCROW_ALLOCATION_LEDGER_CONFLICT",
      );
    }
    if (await WalletProjectionOperation.exists({
      ledgerEntryIds: { $in: entries.map((entry) => entry._id) },
    }).session(session ?? null)) {
      this.fail(
        "Escrow allocation must not have a Wallet projection.",
        "BOOKING_ESCROW_ALLOCATION_INTEGRITY_ERROR",
      );
    }
    const auditCount = await AuditLog.countDocuments({
      action: AuditAction.BOOKING_ESCROW_ALLOCATED,
      entityId: allocation._id,
      "financialContext.primaryReference": allocation.allocationReference,
    }).session(session ?? null);
    if (auditCount !== 1) {
      this.fail(
        "Escrow allocation audit authority is inconsistent.",
        "BOOKING_ESCROW_ALLOCATION_INTEGRITY_ERROR",
      );
    }
    return this.safe(graph, allocation, true);
  }

  async validateReplay(bookingId: string): Promise<SafeBookingEscrowAllocationResult> {
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      this.fail(
        "Booking not found.",
        "BOOKING_ESCROW_ALLOCATION_BOOKING_NOT_FOUND",
      );
    }
    const id = new Types.ObjectId(bookingId);
    const [graph, allocation] = await Promise.all([
      this.loadGraph(id),
      bookingEscrowAllocationRepository.findByBookingAuthoritative(id),
    ]);
    if (!allocation) {
      this.fail(
        "Escrow allocation does not exist.",
        "BOOKING_ESCROW_ALLOCATION_STATUS_CONFLICT",
      );
    }
    return this.validateAllocatedGraph(graph, allocation);
  }

  async allocate(bookingId: string): Promise<SafeBookingEscrowAllocationResult> {
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      this.fail(
        "Booking not found.",
        "BOOKING_ESCROW_ALLOCATION_BOOKING_NOT_FOUND",
      );
    }
    const id = new Types.ObjectId(bookingId);
    const session = await mongoose.startSession();
    let result: SafeBookingEscrowAllocationResult | null = null;
    try {
      await session.withTransaction(async () => {
        const graph = await this.loadGraph(id, session);
        await this.validateCapturedPreconditions(graph, session);
        const amounts = this.amounts(graph.booking);
        const identity = this.identity(graph, amounts);
        const [existingByBooking, existingByKey, existingEntries] =
          await Promise.all([
            bookingEscrowAllocationRepository.findByBookingAuthoritative(id, session),
            bookingEscrowAllocationRepository.findByAllocationKey(
              identity.allocationKey,
              session,
            ),
            ledgerEntryRepository.findManyWithPostingKeys({
              transactionId: identity.allocationLedgerTransaction,
            }, session),
          ]);
        const existing = existingByBooking ?? existingByKey;
        if (existing) {
          result = await this.validateAllocatedGraph(graph, existing, session);
          return;
        }
        if (existingEntries.length) {
          this.fail(
            "Partial allocation Ledger authority already exists.",
            "BOOKING_ESCROW_ALLOCATION_INTEGRITY_ERROR",
          );
        }
        const allocation = await bookingEscrowAllocationRepository.createPending({
          allocationReference: identity.allocationReference,
          allocationKey: identity.allocationKey,
          bookingId: graph.booking._id as Types.ObjectId,
          paymentId: graph.payment._id as Types.ObjectId,
          reservationId: graph.reservation._id as Types.ObjectId,
          customerId: graph.reservation.userId,
          creatorId: graph.reservation.creatorId,
          bookingAmount: graph.reservation.amount,
          serviceAmount: amounts.serviceAmount,
          platformFeeAmount: amounts.platformFeeAmount,
          totalAmount: amounts.totalAmount,
          currency: graph.reservation.currency,
          commissionRateBps: amounts.commissionRateBps,
          commissionAmount: amounts.commissionAmount,
          creatorAmount: amounts.creatorAmount,
          escrowLedgerTransaction: graph.reservation.captureTransactionId,
          allocationLedgerTransaction: identity.allocationLedgerTransaction,
          allocationFingerprint: identity.allocationFingerprint,
        }, session);

        let escrowDebit;
        let commissionCredit;
        let platformFeeCredit;
        let creatorCredit;
        try {
          const common = {
            type: LedgerEntryType.BOOKING_ESCROW_ALLOCATED,
            source: LedgerSource.BOOKING_ESCROW_ALLOCATION,
            transactionId: identity.allocationLedgerTransaction,
            bookingId: graph.booking._id.toString(),
            paymentId: graph.payment._id.toString(),
            idempotencyKey: identity.allocationLedgerTransaction,
            metadata: {
              reservationReference: graph.reservation.reservationReference,
              allocationReference: identity.allocationReference,
              captureTransactionId: graph.reservation.captureTransactionId,
              customerId: graph.reservation.userId.toString(),
              creatorId: graph.reservation.creatorId.toString(),
              commissionRateBps: amounts.commissionRateBps,
            },
          } as const;
          escrowDebit = await ledgerService.createDebit({
            ...common,
            account: LedgerAccount.PLATFORM_ESCROW,
            money: {
              amount: graph.reservation.amount,
              currency: graph.reservation.currency,
            },
            userId: graph.reservation.userId.toString(),
            postingKey: identity.escrowDebitPostingKey,
            description: "Captured booking escrow allocated",
          }, session);
          commissionCredit = await ledgerService.createCredit({
            ...common,
            account: LedgerAccount.PLATFORM_CREATOR_COMMISSION_REVENUE,
            money: {
              amount: amounts.commissionAmount,
              currency: graph.reservation.currency,
            },
            postingKey: identity.commissionCreditPostingKey,
            description: "Creator commission recognized as platform revenue",
          }, session);
          platformFeeCredit = await ledgerService.createCredit({
            ...common,
            account: LedgerAccount.PLATFORM_SERVICE_FEE_REVENUE,
            money: {
              amount: amounts.platformFeeAmount,
              currency: graph.reservation.currency,
            },
            postingKey: identity.platformFeeCreditPostingKey,
            description: "Customer platform service fee recognized",
          }, session);
          creatorCredit = await ledgerService.createCredit({
            ...common,
            account: LedgerAccount.CREATOR_PAYABLE,
            money: {
              amount: amounts.creatorAmount,
              currency: graph.reservation.currency,
            },
            userId: graph.reservation.creatorId.toString(),
            postingKey: identity.creatorCreditPostingKey,
            description: "Creator payable allocated",
          }, session);
        } catch (error) {
          if (isTransientTransactionError(error)) throw error;
          this.fail(
            "Ledger could not allocate captured escrow.",
            "BOOKING_ESCROW_ALLOCATION_LEDGER_CONFLICT",
            error,
          );
        }
        const allocatedAt = new Date();
        const allocated = await bookingEscrowAllocationRepository
          .guardPendingToAllocated({
            allocationId: allocation._id as Types.ObjectId,
            allocationKey: identity.allocationKey,
            bookingId: graph.booking._id as Types.ObjectId,
            paymentId: graph.payment._id as Types.ObjectId,
            reservationId: graph.reservation._id as Types.ObjectId,
            customerId: graph.reservation.userId,
            creatorId: graph.reservation.creatorId,
            bookingAmount: graph.reservation.amount,
            serviceAmount: amounts.serviceAmount,
            platformFeeAmount: amounts.platformFeeAmount,
            totalAmount: amounts.totalAmount,
            currency: graph.reservation.currency,
            commissionRateBps: amounts.commissionRateBps,
            commissionAmount: amounts.commissionAmount,
            creatorAmount: amounts.creatorAmount,
            escrowLedgerTransaction: graph.reservation.captureTransactionId!,
            allocationLedgerTransaction: identity.allocationLedgerTransaction,
            allocationLedgerEntryIds: [
              escrowDebit._id as Types.ObjectId,
              commissionCredit._id as Types.ObjectId,
              platformFeeCredit._id as Types.ObjectId,
              creatorCredit._id as Types.ObjectId,
            ],
            allocationFingerprint: identity.allocationFingerprint,
            allocatedAt,
            expectedVersion: allocation.version,
          }, session);
        if (!allocated) {
          this.fail(
            "Escrow allocation transition conflicted.",
            "BOOKING_ESCROW_ALLOCATION_TRANSACTION_CONFLICT",
          );
        }
        try {
          await createFinancialAudit({
            action: AuditAction.BOOKING_ESCROW_ALLOCATED,
            actor: { type: "SYSTEM", reference: "booking-escrow-allocation" },
            entityType: "BOOKING_ESCROW_ALLOCATION",
            entityId: allocated._id as Types.ObjectId,
            financialContext: {
              domain: "ESCROW",
              primaryReference: identity.allocationReference,
              bookingReference: graph.booking.bookingReference,
              paymentReference: graph.payment.paymentReference,
              amount: graph.reservation.amount,
              currency: graph.reservation.currency,
              ledgerTransactionReference: identity.allocationLedgerTransaction,
            },
            transition: {
              fromStatus: BookingEscrowAllocationStatus.PENDING,
              toStatus: BookingEscrowAllocationStatus.ALLOCATED,
              outcome: "SUCCEEDED",
            },
            metadata: {
              classification: "CAPTURED_ESCROW_ALLOCATION",
              reservationReference: graph.reservation.reservationReference,
              allocationReference: identity.allocationReference,
              commissionAmount: amounts.commissionAmount,
              creatorAmount: amounts.creatorAmount,
              serviceAmount: amounts.serviceAmount,
              platformFeeAmount: amounts.platformFeeAmount,
              totalAmount: amounts.totalAmount,
              creatorId: graph.reservation.creatorId.toString(),
            },
            session,
          });
        } catch (error) {
          if (isTransientTransactionError(error)) throw error;
          this.fail(
            "Escrow allocation audit could not be persisted.",
            "BOOKING_ESCROW_ALLOCATION_TRANSACTION_CONFLICT",
            error,
          );
        }
        result = this.safe(graph, allocated, false);
      });
      if (!result) {
        this.fail(
          "Escrow allocation transaction returned no result.",
          "BOOKING_ESCROW_ALLOCATION_TRANSACTION_CONFLICT",
        );
      }
      return result;
    } catch (error) {
      const winner = await bookingEscrowAllocationRepository
        .findByBookingAuthoritative(id);
      if (winner?.status === BookingEscrowAllocationStatus.ALLOCATED) {
        const graph = await this.loadGraph(id);
        return this.validateAllocatedGraph(graph, winner);
      }
      if (error instanceof BookingEscrowAllocationError) throw error;
      this.fail(
        "Escrow allocation transaction conflicted.",
        "BOOKING_ESCROW_ALLOCATION_TRANSACTION_CONFLICT",
        error,
      );
    } finally {
      await session.endSession();
    }
  }
}

export const bookingEscrowAllocationService =
  new BookingEscrowAllocationService();
