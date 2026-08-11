import crypto from "node:crypto";
import mongoose, { ClientSession, Types } from "mongoose";
import { SupportedCurrency } from "../../constants/financial/supportedCurrencies";

import { AuditAction } from "../../enums/financial/auditAction.enum";
import { BookingCreatorSettlementStatus } from "../../enums/financial/bookingCreatorSettlementStatus.enum";
import { BookingEscrowAllocationStatus } from "../../enums/financial/bookingEscrowAllocationStatus.enum";
import { BookingFundReservationStatus } from "../../enums/financial/bookingFundReservationStatus.enum";
import { LedgerAccount } from "../../enums/financial/ledgerAccount.enum";
import { LedgerEntryType } from "../../enums/financial/ledgerEntryType.enum";
import { LedgerSource } from "../../enums/financial/ledgerSource.enum";
import { MoneyDirection } from "../../enums/financial/moneyDirection.enum";
import { PaymentMethod } from "../../enums/financial/paymentMethod.enum";
import { PaymentStatus } from "../../enums/financial/paymentStatus.enum";
import {
  BookingCreatorSettlementError,
  BookingCreatorSettlementErrorCode,
} from "../../errors/financial/BookingCreatorSettlementError";
import { WalletError } from "../../errors/financial/WalletError";
import { AuditLog } from "../../models/auditLog.model";
import {
  BookingCreatorSettlementDocument,
} from "../../models/bookingCreatorSettlement.model";
import {
  BookingEscrowAllocationDocument,
} from "../../models/bookingEscrowAllocation.model";
import { BookingFundReservationDocument } from "../../models/bookingFundReservation.model";
import { IBooking } from "../../models/booking.model";
import {
  CreatorProfile,
  CreatorProfileDocument,
} from "../../models/creatorProfile.model";
import { Dispute } from "../../models/dispute.model";
import { IPayment } from "../../models/payment.model";
import { Refund } from "../../models/refund.model";
import { Settlement } from "../../models/settlement.model";
import User, { IUser } from "../../models/User";
import { WalletDocument } from "../../models/wallet.model";
import { bookingCreatorSettlementRepository } from "../../repositories/bookingCreatorSettlement.repository";
import { bookingEscrowAllocationRepository } from "../../repositories/bookingEscrowAllocation.repository";
import { bookingFundReservationRepository } from "../../repositories/bookingFundReservation.repository";
import { bookingRepository } from "../../repositories/booking.repository";
import { ledgerEntryRepository } from "../../repositories/ledgerEntry.repository";
import { paymentRepository } from "../../repositories/payment.repository";
import { walletRepository } from "../../repositories/wallet/wallet.repository";
import { walletProjectionOperationRepository } from "../../repositories/wallet/walletProjectionOperation.repository";
import { deriveBookingCreatorSettlementIdentity } from "../../utils/financial/bookingCreatorSettlementIdentity.util";
import { deriveBookingEscrowAllocationIdentity } from "../../utils/financial/bookingEscrowAllocationIdentity.util";
import { createFinancialAudit } from "../auditLog.service";
import { walletIntegrityService } from "../wallet/walletIntegrity.service";
import { walletCreationService } from "../wallet/walletCreation.service";
import { walletProjectionService } from "../wallet/walletProjection.service";
import { bookingWalletReservationCaptureService } from "./bookingWalletReservationCapture.service";
import { ledgerService } from "./ledger.service";
import {
  CREATOR_COMMISSION_RATE_BPS,
  marketplacePricingService,
  MarketplacePricingSnapshot,
} from "./marketplacePricing.service";

interface SettlementGraph {
  booking: IBooking;
  payment: IPayment;
  reservation: BookingFundReservationDocument;
  allocation: BookingEscrowAllocationDocument;
  creator: CreatorProfileDocument;
  creatorUser: IUser;
  creatorWallet: WalletDocument;
}

export interface SafeBookingCreatorSettlementResult {
  booking: { bookingReference: string; status: "COMPLETED" };
  payment: { paymentReference: string; status: PaymentStatus.CAPTURED };
  reservation: {
    reservationReference: string;
    status: BookingFundReservationStatus.CAPTURED;
  };
  allocation: {
    allocationReference: string;
    status: BookingEscrowAllocationStatus.ALLOCATED;
  };
  creator: { reference: string };
  settlement: {
    settlementReference: string;
    status: BookingCreatorSettlementStatus.SETTLED;
    serviceAmount: number;
    platformFeeAmount: number;
    totalAmount: number;
    commissionAmount: number;
    creatorAmount: number;
    currency: string;
    settledAt: Date;
  };
  wallet: {
    currency: string;
    availableBalance: number;
    reservedBalance: number;
    lockedBalance: number;
    currentBalance: number;
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

export class BookingCreatorSettlementService {
  private fail(
    message: string,
    code: BookingCreatorSettlementErrorCode,
    cause?: unknown,
  ): never {
    throw new BookingCreatorSettlementError(message, code, { cause });
  }

  private pricingSnapshot(booking: IBooking): MarketplacePricingSnapshot {
    try {
      const snapshot = {
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
      return snapshot;
    } catch (error) {
      this.fail(
        "Booking pricing snapshot cannot be settled safely.",
        "BOOKING_CREATOR_SETTLEMENT_AMOUNT_CONFLICT",
        error,
      );
    }
  }

  private async loadCore(
    bookingId: Types.ObjectId,
    session?: ClientSession,
  ) {
    const booking = await bookingRepository.findById(bookingId, session);
    if (!booking) {
      this.fail(
        "Booking not found.",
        "BOOKING_CREATOR_SETTLEMENT_BOOKING_NOT_FOUND",
      );
    }
    if (!booking.paymentId) {
      this.fail(
        "Payment not found.",
        "BOOKING_CREATOR_SETTLEMENT_PAYMENT_NOT_FOUND",
      );
    }
    const [payment, reservation, allocation] = await Promise.all([
      paymentRepository.findByIdWithWalletLinks(booking.paymentId, session),
      bookingFundReservationRepository.findByBookingWithHiddenReleaseLinks(
        bookingId,
        session,
      ),
      bookingEscrowAllocationRepository.findByBookingAuthoritative(
        bookingId,
        session,
      ),
    ]);
    if (!payment) {
      this.fail(
        "Payment not found.",
        "BOOKING_CREATOR_SETTLEMENT_PAYMENT_NOT_FOUND",
      );
    }
    if (!reservation) {
      this.fail(
        "Reservation not found.",
        "BOOKING_CREATOR_SETTLEMENT_RESERVATION_NOT_FOUND",
      );
    }
    if (!allocation) {
      this.fail(
        "Escrow allocation not found.",
        "BOOKING_CREATOR_SETTLEMENT_ALLOCATION_NOT_FOUND",
      );
    }
    return { booking, payment, reservation, allocation };
  }

  private async loadGraph(
    bookingId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<SettlementGraph> {
    const core = await this.loadCore(bookingId, session);
    const creator = await CreatorProfile.findOne({
      userId: core.booking.creatorId,
    }).session(session ?? null).exec();
    if (!creator) {
      this.fail(
        "Creator profile not found.",
        "BOOKING_CREATOR_SETTLEMENT_CREATOR_NOT_FOUND",
      );
    }
    const creatorUser = await User.findById(creator.userId)
      .session(session ?? null).exec();
    if (!creatorUser) {
      this.fail(
        "Creator User not found.",
        "BOOKING_CREATOR_SETTLEMENT_CREATOR_NOT_FOUND",
      );
    }
    let creatorWallet = await walletRepository.findByUserAndCurrency(
      creator.userId,
      core.allocation.currency,
      session,
    );
    if (!creatorWallet) {
      creatorWallet = await walletCreationService.createWallet(
        creator.userId,
        core.allocation.currency,
        session,
      );
    }
    return { ...core, creator, creatorUser, creatorWallet };
  }

  private async validateBaseGraph(
    graph: SettlementGraph,
    session?: ClientSession,
  ): Promise<void> {
    const {
      booking,
      payment,
      reservation,
      allocation,
      creator,
      creatorUser,
      creatorWallet,
    } = graph;
    if (booking.status !== "COMPLETED") {
      this.fail(
        "Booking is not completed.",
        "BOOKING_CREATOR_SETTLEMENT_INVALID_BOOKING_STATUS",
      );
    }
    if (payment.status !== PaymentStatus.CAPTURED) {
      this.fail(
        "Payment is not captured.",
        "BOOKING_CREATOR_SETTLEMENT_INVALID_PAYMENT_STATUS",
      );
    }
    if (reservation.status !== BookingFundReservationStatus.CAPTURED) {
      this.fail(
        "Reservation is not captured.",
        "BOOKING_CREATOR_SETTLEMENT_INVALID_RESERVATION_STATUS",
      );
    }
    if (
      allocation.status !== BookingEscrowAllocationStatus.ALLOCATED ||
      !allocation.allocatedAt
    ) {
      this.fail(
        "Escrow allocation is not allocated.",
        "BOOKING_CREATOR_SETTLEMENT_INVALID_ALLOCATION_STATUS",
      );
    }
    if (booking.isFinancialLocked) {
      this.fail(
        "Booking is financially locked.",
        "BOOKING_CREATOR_SETTLEMENT_FINANCIAL_LOCKED",
      );
    }
    if (await Dispute.exists({
      bookingId: booking._id,
      status: "OPEN",
    }).session(session ?? null)) {
      this.fail(
        "An OPEN dispute blocks Creator settlement.",
        "BOOKING_CREATOR_SETTLEMENT_DISPUTE_OPEN",
      );
    }
    if (
      booking.paymentMethod !== PaymentMethod.WALLET ||
      payment.method !== PaymentMethod.WALLET ||
      payment.bookingId.toString() !== booking._id.toString() ||
      reservation.bookingId.toString() !== booking._id.toString() ||
      reservation.paymentId.toString() !== payment._id.toString() ||
      payment.userId.toString() !== booking.userId.toString() ||
      reservation.userId.toString() !== booking.userId.toString() ||
      payment.creatorId.toString() !== booking.creatorId.toString() ||
      reservation.creatorId.toString() !== booking.creatorId.toString() ||
      allocation.customerId.toString() !== booking.userId.toString() ||
      allocation.creatorId.toString() !== booking.creatorId.toString() ||
      creator.userId.toString() !== booking.creatorId.toString() ||
      creatorUser._id.toString() !== creator.userId.toString() ||
      creatorWallet.userId.toString() !== creator.userId.toString()
    ) {
      this.fail(
        "Creator settlement identity graph conflicts.",
        "BOOKING_CREATOR_SETTLEMENT_IDENTITY_CONFLICT",
      );
    }
    if (
      payment.amount !== booking.totalAmount ||
      payment.serviceAmount !== booking.serviceAmount ||
      payment.customerFeeAmount !== booking.platformFeeAmount ||
      payment.grossEscrowAmount !== booking.totalAmount ||
      reservation.amount !== booking.totalAmount ||
      allocation.bookingAmount !== booking.totalAmount ||
      allocation.serviceAmount !== booking.serviceAmount ||
      allocation.platformFeeAmount !== booking.platformFeeAmount ||
      allocation.totalAmount !== booking.totalAmount
    ) {
      this.fail(
        "Creator settlement amount conflicts.",
        "BOOKING_CREATOR_SETTLEMENT_AMOUNT_CONFLICT",
      );
    }
    if (
      payment.currency !== booking.currency ||
      reservation.currency !== booking.currency ||
      allocation.currency !== booking.currency ||
      creatorWallet.currency !== booking.currency
    ) {
      this.fail(
        "Creator settlement currency conflicts.",
        "BOOKING_CREATOR_SETTLEMENT_CURRENCY_CONFLICT",
      );
    }
    if (!walletIntegrityService.validateWallet(creatorWallet)) {
      this.fail(
        "Creator Wallet integrity is invalid.",
        "BOOKING_CREATOR_SETTLEMENT_WALLET_OWNERSHIP_CONFLICT",
      );
    }
    if (
      booking.settlementId ||
      payment.settlementId ||
      await Settlement.exists({
        $or: [{ bookingId: booking._id }, { paymentId: payment._id }],
      }).session(session ?? null) ||
      await Refund.exists({ paymentId: payment._id }).session(session ?? null) ||
      await ledgerEntryRepository.exists({
        bookingId: booking._id,
        type: { $in: [LedgerEntryType.REFUND, LedgerEntryType.REVERSAL] },
      }, session)
    ) {
      this.fail(
        "Post-capture settlement or reversal metadata conflicts.",
        "BOOKING_CREATOR_SETTLEMENT_COMPLETION_CONFLICT",
      );
    }
    if (!booking.completionCause) {
      this.fail(
        "Booking capture identity is incomplete.",
        "BOOKING_CREATOR_SETTLEMENT_IDENTITY_CONFLICT",
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
        "BOOKING_CREATOR_SETTLEMENT_INTEGRITY_ERROR",
        error,
      );
    }

    const amounts = this.pricingSnapshot(booking);
    if (
      allocation.commissionRateBps !== CREATOR_COMMISSION_RATE_BPS ||
      allocation.commissionAmount !== amounts.commissionAmount
    ) {
      this.fail(
        "Escrow allocation commission conflicts.",
        "BOOKING_CREATOR_SETTLEMENT_COMMISSION_CONFLICT",
      );
    }
    if (
      allocation.creatorAmount !== amounts.creatorAmount ||
      allocation.creatorAmount < 1 ||
      !Number.isSafeInteger(allocation.creatorAmount)
    ) {
      this.fail(
        "Escrow allocation Creator amount conflicts.",
        "BOOKING_CREATOR_SETTLEMENT_AMOUNT_CONFLICT",
      );
    }
    if (
      !booking.bookingReference ||
      !reservation.captureTransactionId
    ) {
      this.fail(
        "Escrow allocation identity is incomplete.",
        "BOOKING_CREATOR_SETTLEMENT_INTEGRITY_ERROR",
      );
    }
    const allocationIdentity = deriveBookingEscrowAllocationIdentity({
      bookingId: booking._id as Types.ObjectId,
      bookingReference: booking.bookingReference,
      paymentId: payment._id as Types.ObjectId,
      paymentReference: payment.paymentReference,
      reservationId: reservation._id as Types.ObjectId,
      reservationReference: reservation.reservationReference,
      customerId: booking.userId,
      creatorId: booking.creatorId,
      bookingAmount: booking.totalAmount,
      serviceAmount: booking.serviceAmount,
      platformFeeAmount: booking.platformFeeAmount,
      totalAmount: booking.totalAmount,
      currency: booking.currency,
      commissionRateBps: CREATOR_COMMISSION_RATE_BPS,
      commissionAmount: amounts.commissionAmount,
      creatorAmount: amounts.creatorAmount,
      captureTransactionId: reservation.captureTransactionId,
    });
    if (
      allocation.allocationKey !== allocationIdentity.allocationKey ||
      allocation.allocationReference !== allocationIdentity.allocationReference ||
      allocation.paymentId.toString() !== payment._id.toString() ||
      allocation.reservationId.toString() !== reservation._id.toString() ||
      allocation.escrowLedgerTransaction !== reservation.captureTransactionId ||
      allocation.allocationLedgerTransaction !==
        allocationIdentity.allocationLedgerTransaction ||
      allocation.allocationFingerprint !==
        allocationIdentity.allocationFingerprint ||
      allocation.allocationLedgerEntryIds.length !== 4
    ) {
      this.fail(
        "Escrow allocation authority conflicts.",
        "BOOKING_CREATOR_SETTLEMENT_IDENTITY_CONFLICT",
      );
    }
    const allocationEntries =
      await ledgerEntryRepository.findManyWithPostingKeys({
        transactionId: allocation.allocationLedgerTransaction,
      }, session);
    const allocationEntryIds =
      new Set(allocation.allocationLedgerEntryIds.map(String));
    const commonAllocationValid = allocationEntries.length === 4 &&
      allocationEntries.every((entry) =>
        allocationEntryIds.has(entry._id.toString()) &&
        entry.bookingId?.toString() === booking._id.toString() &&
        entry.paymentId?.toString() === payment._id.toString() &&
        entry.type === LedgerEntryType.BOOKING_ESCROW_ALLOCATED &&
        entry.source === LedgerSource.BOOKING_ESCROW_ALLOCATION &&
        entry.currency === booking.currency &&
        !entry.walletId &&
        entry.metadata?.allocationReference === allocation.allocationReference);
    const escrowDebit = allocationEntries.find((entry) =>
      entry.account === LedgerAccount.PLATFORM_ESCROW &&
      entry.direction === MoneyDirection.DEBIT &&
      entry.amount === booking.totalAmount &&
      entry.userId?.toString() === booking.userId.toString() &&
      entry.postingKey === allocationIdentity.escrowDebitPostingKey);
    const commissionCredit = allocationEntries.find((entry) =>
      entry.account === LedgerAccount.PLATFORM_CREATOR_COMMISSION_REVENUE &&
      entry.direction === MoneyDirection.CREDIT &&
      entry.amount === amounts.commissionAmount &&
      !entry.userId &&
      entry.postingKey === allocationIdentity.commissionCreditPostingKey);
    const creatorCredit = allocationEntries.find((entry) =>
      entry.account === LedgerAccount.CREATOR_PAYABLE &&
      entry.direction === MoneyDirection.CREDIT &&
      entry.amount === amounts.creatorAmount &&
      entry.userId?.toString() === booking.creatorId.toString() &&
      entry.postingKey === allocationIdentity.creatorCreditPostingKey);
    const platformFeeCredit = allocationEntries.find((entry) =>
      entry.account === LedgerAccount.PLATFORM_SERVICE_FEE_REVENUE &&
      entry.direction === MoneyDirection.CREDIT &&
      entry.amount === amounts.platformFeeAmount &&
      !entry.userId &&
      entry.postingKey === allocationIdentity.platformFeeCreditPostingKey);
    if (
      !commonAllocationValid ||
      !escrowDebit ||
      !commissionCredit ||
      !platformFeeCredit ||
      !creatorCredit
    ) {
      this.fail(
        "Escrow allocation Ledger graph conflicts.",
        "BOOKING_CREATOR_SETTLEMENT_LEDGER_CONFLICT",
      );
    }
    const allocationAuditCount = await AuditLog.countDocuments({
      action: AuditAction.BOOKING_ESCROW_ALLOCATED,
      entityId: allocation._id,
      "financialContext.primaryReference": allocation.allocationReference,
    }).session(session ?? null);
    if (allocationAuditCount !== 1) {
      this.fail(
        "Escrow allocation audit authority conflicts.",
        "BOOKING_CREATOR_SETTLEMENT_INTEGRITY_ERROR",
      );
    }
  }

  private identity(graph: SettlementGraph) {
    const { booking, payment, reservation, allocation, creator, creatorWallet } =
      graph;
    if (
      !booking.bookingReference ||
      !reservation.captureTransactionId ||
      !allocation.allocationLedgerTransaction
    ) {
      this.fail(
        "Creator settlement identity is incomplete.",
        "BOOKING_CREATOR_SETTLEMENT_INTEGRITY_ERROR",
      );
    }
    return deriveBookingCreatorSettlementIdentity({
      allocationId: allocation._id as Types.ObjectId,
      allocationReference: allocation.allocationReference,
      bookingId: booking._id as Types.ObjectId,
      bookingReference: booking.bookingReference,
      paymentId: payment._id as Types.ObjectId,
      paymentReference: payment.paymentReference,
      reservationId: reservation._id as Types.ObjectId,
      reservationReference: reservation.reservationReference,
      customerUserId: booking.userId,
      creatorId: creator._id as Types.ObjectId,
      creatorUserId: creator.userId,
      creatorWalletId: creatorWallet._id as Types.ObjectId,
      bookingAmount: allocation.bookingAmount,
      currency: allocation.currency,
      commissionAmount: allocation.commissionAmount,
      creatorAmount: allocation.creatorAmount,
      captureTransactionId: reservation.captureTransactionId,
      allocationTransactionId: allocation.allocationLedgerTransaction,
    });
  }

  private projectionFingerprint(
    graph: SettlementGraph,
    operationKey: string,
    ledgerEntryIds: Types.ObjectId[],
  ): string {
    const normalizedIds = ledgerEntryIds.slice()
      .sort((a, b) => a.toString().localeCompare(b.toString()));
    const canonical = [
      graph.creator.userId.toString(),
      graph.allocation.currency,
      operationKey,
      graph.allocation.creatorAmount,
      0,
      0,
      0,
      0,
      0,
      normalizedIds.map(String).join(","),
    ].join("|");
    return crypto.createHash("sha256").update(canonical).digest("hex");
  }

  private safe(
    graph: SettlementGraph,
    settlement: BookingCreatorSettlementDocument,
    replay: boolean,
  ): SafeBookingCreatorSettlementResult {
    if (
      settlement.status !== BookingCreatorSettlementStatus.SETTLED ||
      !settlement.settledAt ||
      !graph.booking.bookingReference
    ) {
      this.fail(
        "Creator settlement result is incomplete.",
        "BOOKING_CREATOR_SETTLEMENT_INTEGRITY_ERROR",
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
        allocationReference: graph.allocation.allocationReference,
        status: BookingEscrowAllocationStatus.ALLOCATED,
      },
      creator: { reference: graph.creator.slug },
      settlement: {
        settlementReference: settlement.settlementReference,
        status: BookingCreatorSettlementStatus.SETTLED,
        serviceAmount: graph.allocation.serviceAmount,
        platformFeeAmount: graph.allocation.platformFeeAmount,
        totalAmount: graph.allocation.totalAmount,
        commissionAmount: graph.allocation.commissionAmount,
        creatorAmount: settlement.creatorAmount,
        currency: settlement.currency,
        settledAt: settlement.settledAt,
      },
      wallet: {
        currency: graph.creatorWallet.currency,
        availableBalance: graph.creatorWallet.availableBalance,
        reservedBalance: graph.creatorWallet.reservedBalance,
        lockedBalance: graph.creatorWallet.lockedBalance,
        currentBalance: graph.creatorWallet.currentBalance,
      },
      replay,
    };
  }

  private async validateSettledGraph(
    graph: SettlementGraph,
    settlement: BookingCreatorSettlementDocument,
    session?: ClientSession,
  ): Promise<SafeBookingCreatorSettlementResult> {
    await this.validateBaseGraph(graph, session);
    const identity = this.identity(graph);
    const {
      booking,
      payment,
      reservation,
      allocation,
      creator,
      creatorWallet,
    } = graph;
    if (
      settlement.status !== BookingCreatorSettlementStatus.SETTLED ||
      !settlement.settledAt ||
      settlement.settlementKey !== identity.settlementKey ||
      settlement.settlementReference !== identity.settlementReference ||
      settlement.bookingId.toString() !== booking._id.toString() ||
      settlement.paymentId.toString() !== payment._id.toString() ||
      settlement.reservationId.toString() !== reservation._id.toString() ||
      settlement.allocationId.toString() !== allocation._id.toString() ||
      settlement.customerUserId.toString() !== booking.userId.toString() ||
      settlement.creatorId.toString() !== creator._id.toString() ||
      settlement.creatorUserId.toString() !== creator.userId.toString() ||
      settlement.creatorWalletId.toString() !== creatorWallet._id.toString() ||
      settlement.bookingAmount !== allocation.bookingAmount ||
      settlement.currency !== allocation.currency ||
      settlement.commissionAmount !== allocation.commissionAmount ||
      settlement.creatorAmount !== allocation.creatorAmount ||
      settlement.captureTransactionId !== reservation.captureTransactionId ||
      settlement.allocationTransactionId !==
        allocation.allocationLedgerTransaction ||
      settlement.settlementTransactionId !==
        identity.settlementTransactionId ||
      settlement.settlementFingerprint !== identity.settlementFingerprint ||
      settlement.settlementProjectionOperationReference !==
        identity.settlementProjectionOperationReference ||
      settlement.settlementLedgerEntryIds.length !== 2
    ) {
      this.fail(
        "Creator settlement authority conflicts.",
        "BOOKING_CREATOR_SETTLEMENT_IDENTITY_CONFLICT",
      );
    }

    const entries = await ledgerEntryRepository.findManyWithPostingKeys({
      transactionId: identity.settlementTransactionId,
    }, session);
    const allocationSettlementEntries =
      await ledgerEntryRepository.findManyWithPostingKeys({
        source: LedgerSource.BOOKING_CREATOR_WALLET_SETTLEMENT,
        "metadata.allocationReference": allocation.allocationReference,
      }, session);
    const expectedIds = new Set(settlement.settlementLedgerEntryIds.map(String));
    const commonValid = entries.length === 2 && entries.every((entry) =>
      expectedIds.has(entry._id.toString()) &&
      entry.bookingId?.toString() === booking._id.toString() &&
      entry.paymentId?.toString() === payment._id.toString() &&
      entry.settlementId?.toString() === settlement._id.toString() &&
      entry.userId?.toString() === creator.userId.toString() &&
      entry.type === LedgerEntryType.BOOKING_CREATOR_SETTLED &&
      entry.source === LedgerSource.BOOKING_CREATOR_WALLET_SETTLEMENT &&
      entry.currency === allocation.currency &&
      entry.amount === allocation.creatorAmount &&
      entry.metadata?.reservationReference === reservation.reservationReference &&
      entry.metadata?.allocationReference === allocation.allocationReference &&
      entry.metadata?.settlementReference === settlement.settlementReference &&
      entry.metadata?.creatorId === creator._id.toString() &&
      entry.metadata?.creatorUserId === creator.userId.toString() &&
      entry.metadata?.creatorWalletId === creatorWallet._id.toString());
    const payableDebit = entries.find((entry) =>
      entry.account === LedgerAccount.CREATOR_PAYABLE &&
      entry.direction === MoneyDirection.DEBIT &&
      !entry.walletId &&
      entry.postingKey === identity.creatorPayableDebitPostingKey);
    const walletCredit = entries.find((entry) =>
      entry.account === LedgerAccount.WALLET_AVAILABLE &&
      entry.direction === MoneyDirection.CREDIT &&
      entry.walletId?.toString() === creatorWallet._id.toString() &&
      entry.postingKey === identity.walletAvailableCreditPostingKey);
    const debitTotal = entries
      .filter((entry) => entry.direction === MoneyDirection.DEBIT)
      .reduce((sum, entry) => sum + entry.amount, 0);
    const creditTotal = entries
      .filter((entry) => entry.direction === MoneyDirection.CREDIT)
      .reduce((sum, entry) => sum + entry.amount, 0);
    if (
      !commonValid ||
      allocationSettlementEntries.length !== 2 ||
      !allocationSettlementEntries.every((entry) =>
        expectedIds.has(entry._id.toString())) ||
      !payableDebit ||
      !walletCredit ||
      debitTotal !== allocation.creatorAmount ||
      creditTotal !== allocation.creatorAmount
    ) {
      this.fail(
        "Creator settlement Ledger transaction conflicts.",
        "BOOKING_CREATOR_SETTLEMENT_LEDGER_CONFLICT",
      );
    }
    const projection =
      await walletProjectionOperationRepository.findByOperationKey(
        identity.projectionOperationKey,
        session,
      );
    const expectedProjectionFingerprint = this.projectionFingerprint(
      graph,
      identity.projectionOperationKey,
      settlement.settlementLedgerEntryIds,
    );
    if (
      !projection ||
      projection.operationReference !==
        identity.settlementProjectionOperationReference ||
      projection.walletId.toString() !== creatorWallet._id.toString() ||
      projection.userId.toString() !== creator.userId.toString() ||
      projection.currency !== allocation.currency ||
      projection.operationKey !== identity.projectionOperationKey ||
      projection.fingerprint !== expectedProjectionFingerprint ||
      projection.deltas.availableBalance !== allocation.creatorAmount ||
      projection.deltas.reservedBalance !== 0 ||
      projection.deltas.lockedBalance !== 0 ||
      projection.ledgerEntryIds.length !== 2 ||
      new Set(projection.ledgerEntryIds.map(String)).size !== 2 ||
      !projection.ledgerEntryIds.every((id) => expectedIds.has(id.toString())) ||
      creatorWallet.projectionVersion < projection.projectionVersion
    ) {
      this.fail(
        "Creator Wallet projection conflicts.",
        "BOOKING_CREATOR_SETTLEMENT_PROJECTION_CONFLICT",
      );
    }
    const auditCount = await AuditLog.countDocuments({
      action: AuditAction.BOOKING_CREATOR_WALLET_SETTLED,
      entityId: settlement._id,
      "financialContext.primaryReference": settlement.settlementReference,
    }).session(session ?? null);
    if (auditCount !== 1) {
      this.fail(
        "Creator settlement audit authority conflicts.",
        "BOOKING_CREATOR_SETTLEMENT_INTEGRITY_ERROR",
      );
    }
    return this.safe(graph, settlement, true);
  }

  async validateReplay(
    bookingId: string,
  ): Promise<SafeBookingCreatorSettlementResult> {
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      this.fail(
        "Booking not found.",
        "BOOKING_CREATOR_SETTLEMENT_BOOKING_NOT_FOUND",
      );
    }
    const id = new Types.ObjectId(bookingId);
    const graph = await this.loadGraph(id);
    const settlement =
      await bookingCreatorSettlementRepository.findByBooking(id);
    if (!settlement) {
      this.fail(
        "Creator settlement does not exist.",
        "BOOKING_CREATOR_SETTLEMENT_COMPLETION_CONFLICT",
      );
    }
    return this.validateSettledGraph(graph, settlement);
  }

  async settle(
    bookingId: string,
  ): Promise<SafeBookingCreatorSettlementResult> {
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      this.fail(
        "Booking not found.",
        "BOOKING_CREATOR_SETTLEMENT_BOOKING_NOT_FOUND",
      );
    }
    const id = new Types.ObjectId(bookingId);
    const session = await mongoose.startSession();
    let result: SafeBookingCreatorSettlementResult | null = null;
    try {
      await session.withTransaction(async () => {
        const graph = await this.loadGraph(id, session);
        await this.validateBaseGraph(graph, session);
        const identity = this.identity(graph);
        const [
          existingByAllocation,
          existingByKey,
          existingByBooking,
          existingEntries,
          conflictingSettlementEntries,
          existingProjection,
        ] = await Promise.all([
          bookingCreatorSettlementRepository.findByAllocation(
            graph.allocation._id as Types.ObjectId,
            session,
          ),
          bookingCreatorSettlementRepository.findBySettlementKey(
            identity.settlementKey,
            session,
          ),
          bookingCreatorSettlementRepository.findByBooking(id, session),
          ledgerEntryRepository.findManyWithPostingKeys({
            transactionId: identity.settlementTransactionId,
          }, session),
          ledgerEntryRepository.findManyWithPostingKeys({
            source: LedgerSource.BOOKING_CREATOR_WALLET_SETTLEMENT,
            $or: [
              { bookingId: graph.booking._id },
              {
                "metadata.allocationReference":
                  graph.allocation.allocationReference,
              },
            ],
          }, session),
          walletProjectionOperationRepository.findByOperationKey(
            identity.projectionOperationKey,
            session,
          ),
        ]);
        const existing =
          existingByAllocation ?? existingByKey ?? existingByBooking;
        if (existing) {
          result = await this.validateSettledGraph(graph, existing, session);
          return;
        }
        if (
          existingEntries.length ||
          conflictingSettlementEntries.length ||
          existingProjection
        ) {
          this.fail(
            "Partial Creator settlement authority already exists.",
            "BOOKING_CREATOR_SETTLEMENT_INTEGRITY_ERROR",
          );
        }
        const settlement =
          await bookingCreatorSettlementRepository.createPending({
            settlementReference: identity.settlementReference,
            settlementKey: identity.settlementKey,
            bookingId: graph.booking._id as Types.ObjectId,
            paymentId: graph.payment._id as Types.ObjectId,
            reservationId: graph.reservation._id as Types.ObjectId,
            allocationId: graph.allocation._id as Types.ObjectId,
            customerUserId: graph.booking.userId,
            creatorId: graph.creator._id as Types.ObjectId,
            creatorUserId: graph.creator.userId,
            creatorWalletId: graph.creatorWallet._id as Types.ObjectId,
            bookingAmount: graph.allocation.bookingAmount,
            currency: graph.allocation.currency,
            commissionAmount: graph.allocation.commissionAmount,
            creatorAmount: graph.allocation.creatorAmount,
            captureTransactionId: graph.reservation.captureTransactionId!,
            allocationTransactionId:
              graph.allocation.allocationLedgerTransaction,
            settlementTransactionId: identity.settlementTransactionId,
            settlementFingerprint: identity.settlementFingerprint,
            settlementProjectionOperationReference:
              identity.settlementProjectionOperationReference,
          }, session);

        let creatorPayableDebit;
        let walletAvailableCredit;
        try {
          const common = {
            type: LedgerEntryType.BOOKING_CREATOR_SETTLED,
            source: LedgerSource.BOOKING_CREATOR_WALLET_SETTLEMENT,
            transactionId: identity.settlementTransactionId,
            bookingId: graph.booking._id.toString(),
            paymentId: graph.payment._id.toString(),
            settlementId: settlement._id.toString(),
            userId: graph.creator.userId.toString(),
            idempotencyKey: identity.settlementTransactionId,
            money: {
              amount: graph.allocation.creatorAmount,
              currency: graph.allocation.currency,
            },
            metadata: {
              reservationReference: graph.reservation.reservationReference,
              allocationReference: graph.allocation.allocationReference,
              settlementReference: identity.settlementReference,
              captureTransactionId: graph.reservation.captureTransactionId,
              allocationTransactionId:
                graph.allocation.allocationLedgerTransaction,
              customerUserId: graph.booking.userId.toString(),
              creatorId: graph.creator._id.toString(),
              creatorUserId: graph.creator.userId.toString(),
              creatorWalletId: graph.creatorWallet._id.toString(),
            },
          } as const;
          creatorPayableDebit = await ledgerService.createDebit({
            ...common,
            account: LedgerAccount.CREATOR_PAYABLE,
            postingKey: identity.creatorPayableDebitPostingKey,
            description: "Allocated Creator payable settled to Wallet",
          }, session);
          walletAvailableCredit = await ledgerService.createCredit({
            ...common,
            account: LedgerAccount.WALLET_AVAILABLE,
            walletId: graph.creatorWallet._id.toString(),
            postingKey: identity.walletAvailableCreditPostingKey,
            description: "Creator Wallet available balance credited",
          }, session);
        } catch (error) {
          if (isTransientTransactionError(error)) throw error;
          this.fail(
            "Ledger could not record Creator settlement.",
            "BOOKING_CREATOR_SETTLEMENT_LEDGER_CONFLICT",
            error,
          );
        }
        const ledgerEntryIds = [
          creatorPayableDebit._id as Types.ObjectId,
          walletAvailableCredit._id as Types.ObjectId,
        ];
        try {
          const wallet = await walletProjectionService.applyProjectionMutation({
            userId: graph.creator.userId,
            currency: graph.allocation.currency,
            operationKey: identity.projectionOperationKey,
            deltas: {
              availableBalance: graph.allocation.creatorAmount,
              reservedBalance: 0,
              lockedBalance: 0,
            },
            ledgerEntryIds,
          }, session);
          if (
            wallet._id.toString() !== graph.creatorWallet._id.toString() ||
            wallet.userId.toString() !== graph.creator.userId.toString() ||
            wallet.currency !== graph.allocation.currency
          ) {
            this.fail(
              "Wallet projection resolved a conflicting Creator Wallet.",
              "BOOKING_CREATOR_SETTLEMENT_WALLET_OWNERSHIP_CONFLICT",
            );
          }
          graph.creatorWallet = wallet;
        } catch (error) {
          if (isTransientTransactionError(error)) throw error;
          if (error instanceof BookingCreatorSettlementError) throw error;
          const code =
            error instanceof WalletError && error.code === "WALLET_NOT_FOUND"
              ? "BOOKING_CREATOR_SETTLEMENT_WALLET_NOT_FOUND"
              : "BOOKING_CREATOR_SETTLEMENT_PROJECTION_CONFLICT";
          this.fail(
            "Creator Wallet projection could not be applied.",
            code,
            error,
          );
        }
        const projection =
          await walletProjectionOperationRepository.findByOperationKey(
            identity.projectionOperationKey,
            session,
          );
        if (
          !projection ||
          projection.operationReference !==
            identity.settlementProjectionOperationReference
        ) {
          this.fail(
            "Creator Wallet projection authority is missing.",
            "BOOKING_CREATOR_SETTLEMENT_PROJECTION_CONFLICT",
          );
        }
        const settledAt = new Date();
        const settled =
          await bookingCreatorSettlementRepository.guardPendingToSettled({
            settlementId: settlement._id as Types.ObjectId,
            settlementKey: identity.settlementKey,
            allocationId: graph.allocation._id as Types.ObjectId,
            creatorUserId: graph.creator.userId,
            creatorWalletId: graph.creatorWallet._id as Types.ObjectId,
            creatorAmount: graph.allocation.creatorAmount,
            currency: graph.allocation.currency,
            settlementTransactionId: identity.settlementTransactionId,
            settlementProjectionOperationReference:
              identity.settlementProjectionOperationReference,
            settlementFingerprint: identity.settlementFingerprint,
            settlementLedgerEntryIds: ledgerEntryIds,
            settledAt,
            expectedVersion: settlement.version,
          }, session);
        if (!settled) {
          this.fail(
            "Creator settlement transition conflicted.",
            "BOOKING_CREATOR_SETTLEMENT_TRANSACTION_CONFLICT",
          );
        }
        try {
          await createFinancialAudit({
            action: AuditAction.BOOKING_CREATOR_WALLET_SETTLED,
            actor: {
              type: "SYSTEM",
              reference: "booking-creator-wallet-settlement",
            },
            entityType: "BOOKING_CREATOR_SETTLEMENT",
            entityId: settled._id as Types.ObjectId,
            financialContext: {
              domain: "BOOKING_WALLET",
              primaryReference: identity.settlementReference,
              bookingReference: graph.booking.bookingReference,
              paymentReference: graph.payment.paymentReference,
              settlementReference: identity.settlementReference,
              amount: graph.allocation.creatorAmount,
              currency: graph.allocation.currency,
              ledgerTransactionReference: identity.settlementTransactionId,
              projectionOperationReference:
                identity.settlementProjectionOperationReference,
            },
            transition: {
              fromStatus: BookingCreatorSettlementStatus.PENDING,
              toStatus: BookingCreatorSettlementStatus.SETTLED,
              outcome: "SUCCEEDED",
            },
            metadata: {
              classification: "CREATOR_PAYABLE_WALLET_SETTLEMENT",
              reservationReference: graph.reservation.reservationReference,
              allocationReference: graph.allocation.allocationReference,
              creatorAmount: graph.allocation.creatorAmount,
              creatorId: graph.creator._id.toString(),
              creatorUserId: graph.creator.userId.toString(),
              creatorWalletId: graph.creatorWallet._id.toString(),
            },
            session,
          });
        } catch (error) {
          if (isTransientTransactionError(error)) throw error;
          this.fail(
            "Creator settlement audit could not be persisted.",
            "BOOKING_CREATOR_SETTLEMENT_TRANSACTION_CONFLICT",
            error,
          );
        }
        result = this.safe(graph, settled, false);
      });
      if (!result) {
        this.fail(
          "Creator settlement transaction returned no result.",
          "BOOKING_CREATOR_SETTLEMENT_TRANSACTION_CONFLICT",
        );
      }
      return result;
    } catch (error) {
      const winner =
        await bookingCreatorSettlementRepository.findSettledAuthoritative(id);
      if (winner) {
        const graph = await this.loadGraph(id);
        return this.validateSettledGraph(graph, winner);
      }
      if (error instanceof BookingCreatorSettlementError) throw error;
      this.fail(
        "Creator settlement transaction conflicted.",
        "BOOKING_CREATOR_SETTLEMENT_TRANSACTION_CONFLICT",
        error,
      );
    } finally {
      await session.endSession();
    }
  }
}

export const bookingCreatorSettlementService =
  new BookingCreatorSettlementService();
