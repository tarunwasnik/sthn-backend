import crypto from "node:crypto";
import { ClientSession, Types } from "mongoose";

import { AuditAction } from "../../enums/financial/auditAction.enum";
import { BookingCreatorSettlementFailureClassification as Classification } from "../../enums/financial/bookingCreatorSettlementFailureClassification.enum";
import { BookingCreatorSettlementStatus } from "../../enums/financial/bookingCreatorSettlementStatus.enum";
import { BookingEscrowAllocationStatus } from "../../enums/financial/bookingEscrowAllocationStatus.enum";
import { BookingFundReservationStatus } from "../../enums/financial/bookingFundReservationStatus.enum";
import { LedgerAccount } from "../../enums/financial/ledgerAccount.enum";
import { LedgerEntryType } from "../../enums/financial/ledgerEntryType.enum";
import { LedgerSource } from "../../enums/financial/ledgerSource.enum";
import { MoneyDirection } from "../../enums/financial/moneyDirection.enum";
import { PaymentStatus } from "../../enums/financial/paymentStatus.enum";
import { BookingCreatorSettlementOperationalError } from "../../errors/financial/BookingCreatorSettlementOperationalError";
import { AuditLog } from "../../models/auditLog.model";
import { Booking } from "../../models/booking.model";
import { BookingCreatorSettlementDocument } from "../../models/bookingCreatorSettlement.model";
import { BookingEscrowAllocation } from "../../models/bookingEscrowAllocation.model";
import { BookingFundReservation } from "../../models/bookingFundReservation.model";
import { CreatorProfile } from "../../models/creatorProfile.model";
import { LedgerEntry } from "../../models/ledgerEntry.model";
import { Payment } from "../../models/payment.model";
import { Wallet } from "../../models/wallet.model";
import { WalletProjectionOperation } from "../../models/walletProjectionOperation.model";
import { bookingCreatorSettlementRepository } from "../../repositories/bookingCreatorSettlement.repository";
import { deriveBookingCreatorSettlementIdentity } from "../../utils/financial/bookingCreatorSettlementIdentity.util";
import { marketplacePricingService } from "./marketplacePricing.service";
import { SupportedCurrency } from "../../constants/financial/supportedCurrencies";

const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

export interface BookingCreatorSettlementOperationalInspection {
  settlement: BookingCreatorSettlementDocument;
  classification: Classification;
  issues: string[];
  snapshot: Record<string, unknown>;
  snapshotFingerprint: string;
  bookingReference: string;
  allocationReference: string;
  walletReference: string;
  creatorReference: string;
  ledgerEntryIds: Types.ObjectId[];
  financialEffectValid: boolean;
  auditValid: boolean;
  replayMetadataValid: boolean;
}

export class BookingCreatorSettlementOperationalInspectionService {
  async inspect(
    settlementReference: string,
    session?: ClientSession,
  ): Promise<BookingCreatorSettlementOperationalInspection> {
    const settlement =
      await bookingCreatorSettlementRepository.findBySettlementReference(
        settlementReference,
        session,
      );
    if (!settlement) {
      throw new BookingCreatorSettlementOperationalError(
        "Creator settlement was not found.",
        "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_SETTLEMENT_NOT_FOUND",
      );
    }
    const [booking, payment, reservation, allocation, creator, wallet] =
      await Promise.all([
        Booking.findById(settlement.bookingId).session(session ?? null),
        Payment.findById(settlement.paymentId)
          .select("+walletId +reservationId").session(session ?? null),
        BookingFundReservation.findById(settlement.reservationId)
          .select(
            "+captureKey +captureTransactionId +captureLedgerEntryIds " +
            "+captureProjectionOperationId +captureProjectionOperationReference " +
            "+captureFingerprint",
          ).session(session ?? null),
        BookingEscrowAllocation.findById(settlement.allocationId)
          .select(
            "+allocationKey +escrowLedgerTransaction " +
            "+allocationLedgerTransaction +allocationLedgerEntryIds " +
            "+allocationFingerprint",
          ).session(session ?? null),
        CreatorProfile.findById(settlement.creatorId).session(session ?? null),
        Wallet.findById(settlement.creatorWalletId).session(session ?? null),
      ]);
    const issues: string[] = [];
    const add = (issue: string) => {
      if (!issues.includes(issue)) issues.push(issue);
    };
    if (!booking) add("BOOKING_NOT_FOUND");
    if (!payment) add("PAYMENT_NOT_FOUND");
    if (!reservation) add("RESERVATION_NOT_FOUND");
    if (!allocation) add("ALLOCATION_NOT_FOUND");
    if (!creator) add("CREATOR_NOT_FOUND");
    if (!wallet) add("WALLET_NOT_FOUND");

    let coreValid = false;
    let identity: ReturnType<typeof deriveBookingCreatorSettlementIdentity> | null =
      null;
    if (booking && payment && reservation && allocation && creator && wallet) {
      try {
        marketplacePricingService.validate({
          serviceAmount: booking.serviceAmount,
          platformFeeAmount: booking.platformFeeAmount,
          commissionAmount: booking.commissionAmount,
          creatorAmount: booking.creatorAmount,
          totalAmount: booking.totalAmount,
          currency: booking.currency as SupportedCurrency,
        });
      } catch {
        add("BOOKING_PRICING_CONFLICT");
      }
      if (booking.status !== "COMPLETED") add("BOOKING_NOT_COMPLETED");
      if (payment.status !== PaymentStatus.CAPTURED) add("PAYMENT_NOT_CAPTURED");
      if (reservation.status !== BookingFundReservationStatus.CAPTURED) {
        add("RESERVATION_NOT_CAPTURED");
      }
      if (allocation.status !== BookingEscrowAllocationStatus.ALLOCATED) {
        add("ALLOCATION_NOT_ALLOCATED");
      }
      if (
        !booking.bookingReference ||
        !reservation.captureTransactionId ||
        !allocation.allocationLedgerTransaction
      ) {
        add("SOURCE_IDENTITY_INCOMPLETE");
      } else {
        identity = deriveBookingCreatorSettlementIdentity({
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
          creatorWalletId: wallet._id as Types.ObjectId,
          bookingAmount: allocation.bookingAmount,
          currency: allocation.currency,
          commissionAmount: allocation.commissionAmount,
          creatorAmount: allocation.creatorAmount,
          captureTransactionId: reservation.captureTransactionId,
          allocationTransactionId: allocation.allocationLedgerTransaction,
        });
        coreValid =
          settlement.settlementKey === identity.settlementKey &&
          settlement.settlementReference === identity.settlementReference &&
          settlement.settlementFingerprint === identity.settlementFingerprint &&
          settlement.settlementTransactionId === identity.settlementTransactionId &&
          settlement.settlementProjectionOperationReference ===
            identity.settlementProjectionOperationReference &&
          settlement.bookingId.equals(booking._id) &&
          settlement.paymentId.equals(payment._id) &&
          settlement.reservationId.equals(reservation._id) &&
          settlement.allocationId.equals(allocation._id) &&
          settlement.customerUserId.equals(booking.userId) &&
          settlement.creatorUserId.equals(creator.userId) &&
          settlement.creatorWalletId.equals(wallet._id) &&
          wallet.userId.equals(creator.userId) &&
          payment.bookingId.equals(booking._id) &&
          reservation.bookingId.equals(booking._id) &&
          allocation.bookingId.equals(booking._id) &&
          payment.amount === booking.totalAmount &&
          payment.serviceAmount === booking.serviceAmount &&
          payment.customerFeeAmount === booking.platformFeeAmount &&
          payment.grossEscrowAmount === booking.totalAmount &&
          reservation.amount === booking.totalAmount &&
          allocation.bookingAmount === booking.totalAmount &&
          allocation.serviceAmount === booking.serviceAmount &&
          allocation.platformFeeAmount === booking.platformFeeAmount &&
          allocation.totalAmount === booking.totalAmount &&
          allocation.commissionAmount === booking.commissionAmount &&
          allocation.creatorAmount === booking.creatorAmount &&
          settlement.bookingAmount === allocation.bookingAmount &&
          settlement.commissionAmount === allocation.commissionAmount &&
          settlement.creatorAmount === allocation.creatorAmount &&
          settlement.currency === allocation.currency &&
          wallet.currency === allocation.currency;
        if (!coreValid) add("SETTLEMENT_IDENTITY_CONFLICT");
      }
    }

    const entries = identity
      ? await LedgerEntry.find({
        transactionId: identity.settlementTransactionId,
      }).select("+postingKey").session(session ?? null)
      : [];
    const allocationSettlementEntries = allocation
      ? await LedgerEntry.find({
        source: LedgerSource.BOOKING_CREATOR_WALLET_SETTLEMENT,
        "metadata.allocationReference": allocation.allocationReference,
      }).select("+postingKey").session(session ?? null)
      : [];
    const transactionEntryIdSet =
      new Set(entries.map((entry) => entry._id.toString()));
    const ledgerCommonValid = entries.length === 2 &&
      allocationSettlementEntries.length === 2 &&
      allocationSettlementEntries.every((entry) =>
        transactionEntryIdSet.has(entry._id.toString())) &&
      entries.every((entry) =>
        entry.type === LedgerEntryType.BOOKING_CREATOR_SETTLED &&
        entry.source === LedgerSource.BOOKING_CREATOR_WALLET_SETTLEMENT &&
        entry.bookingId?.equals(settlement.bookingId) &&
        entry.paymentId?.equals(settlement.paymentId) &&
        entry.settlementId?.equals(settlement._id) &&
        entry.userId?.equals(settlement.creatorUserId) &&
        entry.metadata?.reservationReference ===
          reservation?.reservationReference &&
        entry.metadata?.allocationReference ===
          allocation?.allocationReference &&
        entry.metadata?.settlementReference ===
          settlement.settlementReference &&
        entry.metadata?.creatorId === settlement.creatorId.toString() &&
        entry.metadata?.creatorUserId === settlement.creatorUserId.toString() &&
        entry.metadata?.creatorWalletId ===
          settlement.creatorWalletId.toString());
    const payableDebit = identity && entries.find((entry) =>
      entry.account === LedgerAccount.CREATOR_PAYABLE &&
      entry.direction === MoneyDirection.DEBIT &&
      entry.postingKey === identity!.creatorPayableDebitPostingKey &&
      entry.amount === settlement.creatorAmount &&
      entry.currency === settlement.currency &&
      entry.userId?.equals(settlement.creatorUserId) &&
      !entry.walletId);
    const walletCredit = identity && entries.find((entry) =>
      entry.account === LedgerAccount.WALLET_AVAILABLE &&
      entry.direction === MoneyDirection.CREDIT &&
      entry.postingKey === identity!.walletAvailableCreditPostingKey &&
      entry.amount === settlement.creatorAmount &&
      entry.currency === settlement.currency &&
      entry.userId?.equals(settlement.creatorUserId) &&
      entry.walletId?.equals(settlement.creatorWalletId));
    const ledgerValid = ledgerCommonValid && !!payableDebit && !!walletCredit;
    if (entries.length && !ledgerValid) add("SETTLEMENT_LEDGER_CONFLICT");

    const projection = identity
      ? await WalletProjectionOperation.findOne({
        operationKey: identity.projectionOperationKey,
      }).select("+fingerprint").session(session ?? null)
      : null;
    const ledgerIds = entries.map((entry) => entry._id as Types.ObjectId);
    const entryIdSet = new Set(ledgerIds.map(String));
    const expectedProjectionFingerprint =
      identity && creator && allocation
        ? hash([
          creator.userId.toString(),
          allocation.currency,
          identity.projectionOperationKey,
          allocation.creatorAmount,
          0,
          0,
          0,
          0,
          0,
          ledgerIds.slice()
            .sort((a, b) => a.toString().localeCompare(b.toString()))
            .map(String).join(","),
        ].join("|"))
        : null;
    const projectionValid = !!projection && ledgerValid &&
      projection.operationReference ===
        identity?.settlementProjectionOperationReference &&
      projection.fingerprint === expectedProjectionFingerprint &&
      projection.walletId.equals(settlement.creatorWalletId) &&
      projection.userId.equals(settlement.creatorUserId) &&
      projection.currency === settlement.currency &&
      projection.deltas.availableBalance === settlement.creatorAmount &&
      projection.deltas.reservedBalance === 0 &&
      projection.deltas.lockedBalance === 0 &&
      projection.ledgerEntryIds.length === 2 &&
      new Set(projection.ledgerEntryIds.map(String)).size === 2 &&
      projection.ledgerEntryIds.every((id) => entryIdSet.has(id.toString()));
    if (projection && !projectionValid) add("SETTLEMENT_PROJECTION_CONFLICT");

    const walletValid = !!wallet &&
      wallet.userId.equals(settlement.creatorUserId) &&
      wallet.currency === settlement.currency &&
      wallet.currentBalance ===
        wallet.availableBalance + wallet.reservedBalance + wallet.lockedBalance &&
      (!projection || wallet.projectionVersion >= projection.projectionVersion);
    if (wallet && !walletValid) add("SETTLEMENT_WALLET_CONFLICT");

    const auditCount = await AuditLog.countDocuments({
      action: AuditAction.BOOKING_CREATOR_WALLET_SETTLED,
      entityId: settlement._id,
      "financialContext.primaryReference": settlement.settlementReference,
    }).session(session ?? null);
    const auditValid = auditCount === 1;
    if (!auditValid) add(auditCount === 0 ? "SETTLEMENT_AUDIT_MISSING" : "SETTLEMENT_AUDIT_DUPLICATED");

    const replayMetadataValid =
      settlement.settlementLedgerEntryIds.length === 2 &&
      settlement.settlementLedgerEntryIds.every((id) =>
        entryIdSet.has(id.toString()));
    if (!replayMetadataValid && ledgerValid) add("REPLAY_METADATA_MISSING");

    const financialEffectValid =
      coreValid && ledgerValid && projectionValid && walletValid;
    let classification = Classification.UNKNOWN;
    if (!coreValid) classification = Classification.CORRUPTED_SETTLEMENT;
    else if (entries.length > 0 && !ledgerValid) {
      classification = Classification.CORRUPTED_LEDGER;
    } else if (projection && !projectionValid) {
      classification = Classification.CORRUPTED_PROJECTION;
    } else if (!walletValid) classification = Classification.INTEGRITY_FAILURE;
    else if (
      settlement.status === BookingCreatorSettlementStatus.PENDING &&
      !entries.length &&
      !projection
    ) {
      classification = Classification.PENDING;
    } else if (
      settlement.status === BookingCreatorSettlementStatus.PENDING &&
      financialEffectValid
    ) {
      classification = Classification.REPLAY_REQUIRED;
    } else if (!ledgerValid) classification = Classification.CORRUPTED_LEDGER;
    else if (!projectionValid) classification = Classification.CORRUPTED_PROJECTION;
    else if (!auditValid) classification = Classification.MISSING_AUDIT;
    else if (!replayMetadataValid) classification = Classification.REPLAY_REQUIRED;
    else if (
      settlement.status === BookingCreatorSettlementStatus.SETTLED &&
      settlement.settledAt
    ) {
      classification = Classification.HEALTHY;
    } else {
      classification = Classification.CORRUPTED_SETTLEMENT;
    }

    const snapshot = {
      settlementReference: settlement.settlementReference,
      settlementStatus: settlement.status,
      bookingStatus: booking?.status,
      paymentStatus: payment?.status,
      reservationStatus: reservation?.status,
      allocationStatus: allocation?.status,
      amount: settlement.creatorAmount,
      currency: settlement.currency,
      ledgerEntryCount: entries.length,
      projectionPresent: !!projection,
      walletIntegrityValid: walletValid,
      auditCount,
      replayMetadataValid,
      classification,
      issueCodes: issues,
    };
    return {
      settlement,
      classification,
      issues,
      snapshot,
      snapshotFingerprint: hash(JSON.stringify(snapshot)),
      bookingReference: booking?.bookingReference ?? "UNKNOWN",
      allocationReference: allocation?.allocationReference ?? "UNKNOWN",
      walletReference:
        `WAL-${hash(settlement.creatorWalletId.toString()).slice(0, 16).toUpperCase()}`,
      creatorReference: creator?.slug ?? "UNKNOWN",
      ledgerEntryIds: ledgerIds,
      financialEffectValid,
      auditValid,
      replayMetadataValid,
    };
  }
}

export const bookingCreatorSettlementOperationalInspectionService =
  new BookingCreatorSettlementOperationalInspectionService();
